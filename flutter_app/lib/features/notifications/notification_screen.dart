import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _notifications = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    try {
      final res = await _api.get('/api/mobile/notifications');
      setState(() => _notifications = res.data is List ? res.data : []);
    } catch (_) {
      setState(() => _notifications = []);
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _markRead(String id) async {
    try {
      await _api.patch('/api/mobile/notifications/$id/read', data: {});
      setState(() {
        final idx = _notifications.indexWhere((n) => n['id'] == id);
        if (idx != -1) _notifications[idx] = {..._notifications[idx], 'isRead': true};
      });
    } catch (_) {}
  }

  Future<void> _markAllRead() async {
    try {
      await _api.patch('/api/mobile/notifications/read-all', data: {});
      setState(() => _notifications = _notifications.map((n) => {...n, 'isRead': true}).toList());
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('All marked as read'), backgroundColor: Colors.green));
    } catch (_) {}
  }

  Future<void> _clearAll() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Clear All Notifications'),
        content: const Text('Are you sure you want to clear all notifications?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Clear', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await _api.delete('/api/mobile/notifications/clear');
      setState(() => _notifications = []);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Notifications cleared')));
    } catch (_) {}
  }

  int get _unreadCount => _notifications.where((n) => n['isRead'] != true).length;

  Color _typeColor(String type) {
    if (type.contains('approved') || type.contains('paid') || type.contains('processed')) return Colors.green;
    if (type.contains('rejected')) return Colors.red;
    if (type.contains('submitted') || type.contains('request')) return Colors.orange;
    return AppTheme.primaryColor;
  }

  String _typeIcon(String type) {
    if (type.contains('leave')) return '📋';
    if (type.contains('payroll') || type.contains('salary')) return '💰';
    if (type.contains('loan') || type.contains('advance')) return '🏦';
    if (type.contains('approved')) return '✅';
    if (type.contains('rejected')) return '❌';
    return '🔔';
  }

  String _timeAgo(String? createdAt) {
    if (createdAt == null) return '';
    try {
      final dt = DateTime.parse(createdAt).toLocal();
      final diff = DateTime.now().difference(dt);
      if (diff.inSeconds < 60) return 'just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return DateFormat('dd MMM').format(dt);
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        title: Row(children: [
          const Text('Notifications'),
          if (_unreadCount > 0) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(10)),
              child: Text('$_unreadCount', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
            ),
          ],
        ]),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          if (_unreadCount > 0)
            TextButton(
              onPressed: _markAllRead,
              child: const Text('Mark all read', style: TextStyle(color: Colors.white70, fontSize: 12)),
            ),
          if (_notifications.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep, size: 22),
              onPressed: _clearAll,
              tooltip: 'Clear all',
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _notifications.isEmpty
              ? Center(
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    const Text('🔔', style: TextStyle(fontSize: 56)),
                    const SizedBox(height: 16),
                    Text('No notifications yet', style: TextStyle(fontSize: 16, color: Colors.grey[500], fontWeight: FontWeight.w500)),
                    const SizedBox(height: 8),
                    Text('You\'re all caught up!', style: TextStyle(fontSize: 13, color: Colors.grey[400])),
                  ]),
                )
              : RefreshIndicator(
                  onRefresh: _fetch,
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: _notifications.length,
                    itemBuilder: (ctx, i) {
                      final n = _notifications[i];
                      final isRead = n['isRead'] == true;
                      final type = (n['type'] ?? '') as String;
                      final color = _typeColor(type);
                      final icon = _typeIcon(type);

                      return Dismissible(
                        key: Key(n['id'] ?? i.toString()),
                        direction: DismissDirection.endToStart,
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 20),
                          color: Colors.red,
                          child: const Icon(Icons.delete, color: Colors.white),
                        ),
                        onDismissed: (_) async {
                          final removed = _notifications.removeAt(i);
                          setState(() {});
                          try {
                            await _api.patch('/api/mobile/notifications/${removed['id']}/read', data: {});
                          } catch (_) {}
                        },
                        child: GestureDetector(
                          onTap: () => !isRead ? _markRead(n['id']) : null,
                          child: Container(
                            margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(
                              color: isRead ? Colors.white : Colors.blue[50],
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: isRead ? Colors.grey[200]! : Colors.blue[100]!),
                              boxShadow: [BoxShadow(color: Colors.grey.withValues(alpha: 0.06), blurRadius: 4, offset: const Offset(0, 2))],
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Container(
                                  width: 42,
                                  height: 42,
                                  decoration: BoxDecoration(
                                    color: color.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(color: color.withValues(alpha: 0.3)),
                                  ),
                                  child: Center(child: Text(icon, style: const TextStyle(fontSize: 20))),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Row(children: [
                                      Expanded(
                                        child: Text(
                                          n['title'] ?? '',
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: isRead ? FontWeight.w500 : FontWeight.bold,
                                            color: AppTheme.textPrimary,
                                          ),
                                        ),
                                      ),
                                      if (!isRead)
                                        Container(
                                          width: 8,
                                          height: 8,
                                          decoration: const BoxDecoration(color: Colors.blue, shape: BoxShape.circle),
                                        ),
                                    ]),
                                    const SizedBox(height: 4),
                                    Text(
                                      n['message'] ?? '',
                                      style: TextStyle(fontSize: 12, color: Colors.grey[600], height: 1.4),
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      _timeAgo(n['createdAt']?.toString()),
                                      style: TextStyle(fontSize: 11, color: Colors.grey[400]),
                                    ),
                                  ]),
                                ),
                              ]),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
