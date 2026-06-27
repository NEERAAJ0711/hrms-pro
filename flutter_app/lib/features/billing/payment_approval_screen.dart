import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

/// Super-admin screen to review company-reported payments. Mirrors the web
/// billing approval flow: list submissions, then approve (which credits the
/// company's account) or reject (with an optional note).
class PaymentApprovalScreen extends StatefulWidget {
  const PaymentApprovalScreen({super.key});

  @override
  State<PaymentApprovalScreen> createState() => _PaymentApprovalScreenState();
}

class _PaymentApprovalScreenState extends State<PaymentApprovalScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _submissions = [];
  bool _isLoading = true;
  String? _error;
  String _filter = 'pending';
  final Set<String> _busyIds = {};

  static const _filters = ['pending', 'approved', 'rejected', 'all'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final res = await _api.dio.get('/api/mobile/billing/payment-submissions');
      setState(() {
        _submissions = (res.data as List?) ?? [];
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load payment submissions';
        _isLoading = false;
      });
    }
  }

  List<dynamic> get _visible {
    if (_filter == 'all') return _submissions;
    return _submissions.where((s) => (s['status'] ?? 'pending') == _filter).toList();
  }

  int _countFor(String status) =>
      _submissions.where((s) => (s['status'] ?? 'pending') == status).length;

  Future<void> _review(Map<String, dynamic> sub, String status) async {
    final id = sub['id']?.toString();
    if (id == null) return;

    String? note;
    if (status == 'rejected') {
      note = await _askNote();
      if (note == null) return; // cancelled
    } else {
      final confirmed = await _confirmApprove(sub);
      if (confirmed != true) return;
    }

    setState(() => _busyIds.add(id));
    try {
      final res = await _api.dio.patch(
        '/api/mobile/billing/payment-submission/$id',
        data: {'status': status, if (note != null && note.isNotEmpty) 'reviewNote': note},
      );
      final updated = res.data as Map<String, dynamic>;
      final idx = _submissions.indexWhere((s) => s['id']?.toString() == id);
      setState(() {
        if (idx != -1) _submissions[idx] = updated;
        _busyIds.remove(id);
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(status == 'approved' ? 'Payment approved & credited' : 'Payment rejected'),
          backgroundColor: status == 'approved' ? AppTheme.accentColor : AppTheme.errorColor,
        ));
      }
    } catch (e) {
      setState(() => _busyIds.remove(id));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Action failed. Please try again.'),
          backgroundColor: AppTheme.errorColor,
        ));
      }
    }
  }

  Future<bool?> _confirmApprove(Map<String, dynamic> sub) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Approve payment?'),
        content: Text(
          'This will credit ₹${_fmtAmount(sub['amount'])} to ${sub['companyName'] ?? 'this company'} and unlock their account.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.accentColor),
            child: const Text('Approve'),
          ),
        ],
      ),
    );
  }

  Future<String?> _askNote() {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reject payment'),
        content: TextField(
          controller: controller,
          maxLines: 3,
          maxLength: 500,
          decoration: const InputDecoration(
            hintText: 'Reason (optional) — shown to the company',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.errorColor),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
  }

  String _fmtAmount(dynamic raw) {
    final n = double.tryParse('${raw ?? ''}') ?? 0;
    final s = n.toStringAsFixed(n.truncateToDouble() == n ? 0 : 2);
    final parts = s.split('.');
    final intPart = parts[0];
    final buf = StringBuffer();
    for (int i = 0; i < intPart.length; i++) {
      if (i > 0 && (intPart.length - i) % 3 == 0) buf.write(',');
      buf.write(intPart[i]);
    }
    return parts.length > 1 ? '${buf.toString()}.${parts[1]}' : buf.toString();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        title: const Text('Payment Approvals'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: Column(
        children: [
          _filterBar(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: _buildBody(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterBar() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: _filters.map((f) {
            final selected = _filter == f;
            final label = f == 'all'
                ? 'All (${_submissions.length})'
                : '${f[0].toUpperCase()}${f.substring(1)} (${_countFor(f)})';
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(label),
                selected: selected,
                onSelected: (_) => setState(() => _filter = f),
                selectedColor: AppTheme.primaryColor,
                labelStyle: TextStyle(
                  color: selected ? Colors.white : AppTheme.textSecondary,
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                ),
                backgroundColor: const Color(0xFFF0F1F5),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return ListView(children: [
        const SizedBox(height: 120),
        Center(
          child: Column(children: [
            const Icon(Icons.error_outline, size: 48, color: AppTheme.errorColor),
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: AppTheme.textSecondary)),
            const SizedBox(height: 12),
            ElevatedButton(onPressed: _load, child: const Text('Retry')),
          ]),
        ),
      ]);
    }
    final items = _visible;
    if (items.isEmpty) {
      return ListView(children: [
        const SizedBox(height: 140),
        Center(
          child: Column(children: [
            Icon(Icons.inbox_outlined, size: 56, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text('No $_filter payments', style: TextStyle(color: Colors.grey.shade600, fontSize: 15)),
          ]),
        ),
      ]);
    }
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: items.length,
      itemBuilder: (_, i) => _card(items[i] as Map<String, dynamic>),
    );
  }

  Widget _card(Map<String, dynamic> sub) {
    final status = (sub['status'] ?? 'pending').toString();
    final id = sub['id']?.toString() ?? '';
    final busy = _busyIds.contains(id);
    final note = sub['note']?.toString();
    final reviewNote = sub['reviewNote']?.toString();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  sub['companyName']?.toString() ?? 'Unknown company',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppTheme.textPrimary),
                ),
              ),
              _statusBadge(status),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.currency_rupee, size: 18, color: AppTheme.primaryColor),
              Text(
                _fmtAmount(sub['amount']),
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppTheme.primaryColor),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _infoRow(Icons.event, 'Payment date', sub['paymentDate']?.toString() ?? '—'),
          _infoRow(Icons.tag, 'Reference', sub['referenceNo']?.toString() ?? '—'),
          if (note != null && note.isNotEmpty) _infoRow(Icons.notes, 'Note', note),
          if (reviewNote != null && reviewNote.isNotEmpty)
            _infoRow(Icons.rate_review, 'Review note', reviewNote),
          if (status == 'pending') ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: busy ? null : () => _review(sub, 'rejected'),
                    icon: const Icon(Icons.close, size: 18),
                    label: const Text('Reject'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.errorColor,
                      side: const BorderSide(color: AppTheme.errorColor),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: busy ? null : () => _review(sub, 'approved'),
                    icon: busy
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.check, size: 18),
                    label: const Text('Approve'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.accentColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: AppTheme.textSecondary),
          const SizedBox(width: 8),
          Text('$label: ', style: const TextStyle(fontSize: 12.5, color: AppTheme.textSecondary)),
          Expanded(
            child: Text(value, style: const TextStyle(fontSize: 12.5, color: AppTheme.textPrimary, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }

  Widget _statusBadge(String status) {
    Color color;
    switch (status) {
      case 'approved':
        color = AppTheme.accentColor;
        break;
      case 'rejected':
        color = AppTheme.errorColor;
        break;
      default:
        color = AppTheme.warningColor;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.3),
      ),
    );
  }
}
