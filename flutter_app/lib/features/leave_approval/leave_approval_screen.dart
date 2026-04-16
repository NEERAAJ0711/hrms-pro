import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class LeaveApprovalScreen extends StatefulWidget {
  const LeaveApprovalScreen({super.key});

  @override
  State<LeaveApprovalScreen> createState() => _LeaveApprovalScreenState();
}

class _LeaveApprovalScreenState extends State<LeaveApprovalScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _requests = [];
  bool _isLoading = true;
  String _filter = 'pending';

  @override
  void initState() {
    super.initState();
    _loadRequests();
  }

  Future<void> _loadRequests() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.dio.get('/api/mobile/team-leave-requests');
      setState(() {
        _requests = res.data ?? [];
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _updateStatus(String id, String status) async {
    try {
      await _api.dio.patch('/api/mobile/leave-requests/$id', data: {'status': status});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Leave request ${status == "approved" ? "approved" : "rejected"}'), backgroundColor: status == "approved" ? AppTheme.accentColor : AppTheme.errorColor),
        );
      }
      _loadRequests();
    } catch (e) {
      String msg = 'Failed to update';
      if (e is DioException) msg = e.response?.data?['error'] ?? msg;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor));
      }
    }
  }

  void _confirmAction(String id, String status) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${status == "approved" ? "Approve" : "Reject"} Leave?'),
        content: Text('Are you sure you want to ${status == "approved" ? "approve" : "reject"} this leave request?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () { Navigator.pop(ctx); _updateStatus(id, status); },
            style: ElevatedButton.styleFrom(backgroundColor: status == "approved" ? AppTheme.accentColor : AppTheme.errorColor),
            child: Text(status == "approved" ? 'Approve' : 'Reject'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _requests.where((r) => _filter == 'all' || r['status'] == _filter).toList();
    final pendingCount = _requests.where((r) => r['status'] == 'pending').length;

    return Scaffold(
      appBar: AppBar(title: Text('Leave Approval${pendingCount > 0 ? " ($pendingCount)" : ""}')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                _filterChip('Pending', 'pending'),
                const SizedBox(width: 8),
                _filterChip('Approved', 'approved'),
                const SizedBox(width: 8),
                _filterChip('Rejected', 'rejected'),
                const SizedBox(width: 8),
                _filterChip('All', 'all'),
              ],
            ),
          ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? Center(child: Text('No $_filter leave requests', style: const TextStyle(color: AppTheme.textSecondary)))
                    : RefreshIndicator(
                        onRefresh: _loadRequests,
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: filtered.length,
                          itemBuilder: (context, index) => _requestCard(filtered[index]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _filterChip(String label, String value) {
    final isSelected = _filter == value;
    return GestureDetector(
      onTap: () => setState(() => _filter = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryColor : Colors.grey[100],
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(label, style: TextStyle(color: isSelected ? Colors.white : Colors.grey[700], fontSize: 13, fontWeight: FontWeight.w500)),
      ),
    );
  }

  Widget _requestCard(Map<String, dynamic> req) {
    final status = req['status'] ?? 'pending';
    final isPending = status == 'pending';
    Color statusColor;
    switch (status) {
      case 'approved': statusColor = AppTheme.accentColor; break;
      case 'rejected': statusColor = AppTheme.errorColor; break;
      default: statusColor = AppTheme.warningColor;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(req['employeeName'] ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                      Text('${req['employeeCode'] ?? ""}', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                  child: Text(status.toUpperCase(), style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.calendar_today, size: 14, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Text('${req['startDate']} to ${req['endDate']}', style: TextStyle(fontSize: 13, color: Colors.grey[700])),
                const SizedBox(width: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: AppTheme.primaryColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                  child: Text('${req['leaveTypeCode'] ?? req['leaveTypeName'] ?? ""}', style: const TextStyle(fontSize: 11, color: AppTheme.primaryColor, fontWeight: FontWeight.w500)),
                ),
                const SizedBox(width: 8),
                Text('${req['days'] ?? 0} day(s)', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
              ],
            ),
            if (req['reason'] != null && req['reason'].toString().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('Reason: ${req['reason']}', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
            ],
            if (isPending) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _confirmAction(req['id'], 'approved'),
                      icon: const Icon(Icons.check, size: 16),
                      label: const Text('Approve'),
                      style: ElevatedButton.styleFrom(backgroundColor: AppTheme.accentColor, padding: const EdgeInsets.symmetric(vertical: 10)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _confirmAction(req['id'], 'rejected'),
                      icon: const Icon(Icons.close, size: 16),
                      label: const Text('Reject'),
                      style: ElevatedButton.styleFrom(backgroundColor: AppTheme.errorColor, padding: const EdgeInsets.symmetric(vertical: 10)),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
