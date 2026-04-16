import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:intl/intl.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class AdvanceRequestScreen extends StatefulWidget {
  const AdvanceRequestScreen({super.key});

  @override
  State<AdvanceRequestScreen> createState() => _AdvanceRequestScreenState();
}

class _AdvanceRequestScreenState extends State<AdvanceRequestScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiClient _api = ApiClient();

  List<dynamic> _myRequests = [];
  bool _loadingList = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _fetchRequests();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _fetchRequests() async {
    setState(() => _loadingList = true);
    try {
      final res = await _api.get('/api/mobile/loan-advances');
      setState(() => _myRequests = res.data is List ? res.data : []);
    } catch (_) {
      setState(() => _myRequests = []);
    } finally {
      setState(() => _loadingList = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        title: const Text('Advance & Loan Request'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        elevation: 0,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(text: 'My Requests'),
            Tab(text: 'New Request'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _RequestListTab(
            requests: _myRequests,
            loading: _loadingList,
            onRefresh: _fetchRequests,
          ),
          _NewRequestTab(onSubmitted: () {
            _fetchRequests();
            _tabController.animateTo(0);
          }),
        ],
      ),
    );
  }
}

class _RequestListTab extends StatelessWidget {
  final List<dynamic> requests;
  final bool loading;
  final VoidCallback onRefresh;

  const _RequestListTab({
    required this.requests,
    required this.loading,
    required this.onRefresh,
  });

  Color _statusColor(String status) {
    switch (status) {
      case 'approved': return Colors.green;
      case 'rejected': return Colors.red;
      case 'disbursed': return Colors.blue;
      default: return Colors.orange;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (requests.isEmpty) {
      return Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.account_balance_wallet_outlined, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text('No advance requests yet', style: TextStyle(color: Colors.grey[500], fontSize: 16)),
          const SizedBox(height: 8),
          Text('Tap "New Request" to apply', style: TextStyle(color: Colors.grey[400], fontSize: 13)),
        ]),
      );
    }
    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: requests.length,
        itemBuilder: (ctx, i) {
          final r = requests[i];
          final status = r['status'] ?? 'pending';
          final type = r['type'] ?? 'advance';
          final amount = r['amount'] != null
              ? NumberFormat('#,##,###').format(double.tryParse(r['amount'].toString()) ?? 0)
              : '0';
          final remaining = r['remainingBalance'] != null
              ? NumberFormat('#,##,###').format(double.tryParse(r['remainingBalance'].toString()) ?? 0)
              : null;
          final createdAt = r['appliedDate'] != null
              ? DateFormat('dd MMM yyyy').format(DateTime.tryParse(r['appliedDate'].toString()) ?? DateTime.now())
              : '-';

          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey[200]!),
              boxShadow: [BoxShadow(color: Colors.grey.withValues(alpha: 0.07), blurRadius: 4, offset: const Offset(0, 2))],
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: type == 'loan' ? const Color(0xFF6366F1).withValues(alpha: 0.1) : AppTheme.primaryColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      type == 'loan' ? 'LOAN' : 'ADVANCE',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: type == 'loan' ? const Color(0xFF6366F1) : AppTheme.primaryColor,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: _statusColor(status).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      status.toUpperCase(),
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: _statusColor(status)),
                    ),
                  ),
                ]),
                const SizedBox(height: 12),
                Row(children: [
                  const Icon(Icons.currency_rupee, size: 20, color: AppTheme.textPrimary),
                  Text(
                    amount,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                  ),
                ]),
                if (remaining != null && status == 'approved') ...[
                  const SizedBox(height: 4),
                  Text('Remaining: ₹$remaining', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                ],
                const SizedBox(height: 8),
                if (r['reason'] != null && r['reason'].toString().isNotEmpty) ...[
                  Text(r['reason'].toString(), style: TextStyle(fontSize: 13, color: Colors.grey[700]), maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                ],
                Row(children: [
                  Icon(Icons.calendar_today, size: 12, color: Colors.grey[400]),
                  const SizedBox(width: 4),
                  Text('Applied: $createdAt', style: TextStyle(fontSize: 12, color: Colors.grey[500])),
                  if (r['installmentAmount'] != null) ...[
                    const SizedBox(width: 12),
                    Icon(Icons.repeat, size: 12, color: Colors.grey[400]),
                    const SizedBox(width: 4),
                    Text(
                      'EMI: ₹${NumberFormat('#,##,###').format(double.tryParse(r['installmentAmount'].toString()) ?? 0)}',
                      style: TextStyle(fontSize: 12, color: Colors.grey[500]),
                    ),
                  ],
                ]),
              ]),
            ),
          );
        },
      ),
    );
  }
}

class _NewRequestTab extends StatefulWidget {
  final VoidCallback onSubmitted;
  const _NewRequestTab({required this.onSubmitted});

  @override
  State<_NewRequestTab> createState() => _NewRequestTabState();
}

class _NewRequestTabState extends State<_NewRequestTab> {
  final ApiClient _api = ApiClient();
  final _formKey = GlobalKey<FormState>();
  final _amountCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();
  final _installmentCtrl = TextEditingController();
  String _type = 'advance';
  bool _isSubmitting = false;

  @override
  void dispose() {
    _amountCtrl.dispose();
    _reasonCtrl.dispose();
    _installmentCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSubmitting = true);
    try {
      await _api.post('/api/mobile/loan-advances', data: {
        'type': _type,
        'amount': double.tryParse(_amountCtrl.text.trim()) ?? 0,
        'reason': _reasonCtrl.text.trim(),
        if (_type == 'loan' && _installmentCtrl.text.isNotEmpty)
          'installmentAmount': double.tryParse(_installmentCtrl.text.trim()),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Request submitted successfully'), backgroundColor: Colors.green),
        );
        _amountCtrl.clear();
        _reasonCtrl.clear();
        _installmentCtrl.clear();
        setState(() => _type = 'advance');
        widget.onSubmitted();
      }
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.response?.data?['error'] ?? 'Submission failed'),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Form(
        key: _formKey,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Request Type', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: AppTheme.textPrimary)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _type = 'advance'),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    color: _type == 'advance' ? AppTheme.primaryColor : Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: _type == 'advance' ? AppTheme.primaryColor : Colors.grey[300]!),
                    boxShadow: _type == 'advance' ? [BoxShadow(color: AppTheme.primaryColor.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 3))] : [],
                  ),
                  child: Column(children: [
                    Icon(Icons.account_balance_wallet, color: _type == 'advance' ? Colors.white : Colors.grey[500], size: 26),
                    const SizedBox(height: 6),
                    Text('Salary Advance', style: TextStyle(fontWeight: FontWeight.w600, color: _type == 'advance' ? Colors.white : AppTheme.textPrimary, fontSize: 13)),
                    Text('Short-term', style: TextStyle(fontSize: 10, color: _type == 'advance' ? Colors.white70 : Colors.grey[400])),
                  ]),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _type = 'loan'),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    color: _type == 'loan' ? const Color(0xFF6366F1) : Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: _type == 'loan' ? const Color(0xFF6366F1) : Colors.grey[300]!),
                    boxShadow: _type == 'loan' ? [BoxShadow(color: const Color(0xFF6366F1).withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 3))] : [],
                  ),
                  child: Column(children: [
                    Icon(Icons.monetization_on, color: _type == 'loan' ? Colors.white : Colors.grey[500], size: 26),
                    const SizedBox(height: 6),
                    Text('Loan', style: TextStyle(fontWeight: FontWeight.w600, color: _type == 'loan' ? Colors.white : AppTheme.textPrimary, fontSize: 13)),
                    Text('Long-term EMI', style: TextStyle(fontSize: 10, color: _type == 'loan' ? Colors.white70 : Colors.grey[400])),
                  ]),
                ),
              ),
            ),
          ]),
          const SizedBox(height: 24),
          const Text('Amount (₹)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: AppTheme.textPrimary)),
          const SizedBox(height: 8),
          TextFormField(
            controller: _amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.currency_rupee),
              hintText: 'Enter amount',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              filled: true,
              fillColor: Colors.white,
            ),
            validator: (v) {
              if (v == null || v.trim().isEmpty) return 'Please enter an amount';
              final n = double.tryParse(v.trim());
              if (n == null || n <= 0) return 'Enter a valid amount';
              return null;
            },
          ),
          if (_type == 'loan') ...[
            const SizedBox(height: 16),
            const Text('Monthly Installment (₹)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: AppTheme.textPrimary)),
            const SizedBox(height: 8),
            TextFormField(
              controller: _installmentCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.repeat),
                hintText: 'Enter monthly EMI amount',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                filled: true,
                fillColor: Colors.white,
              ),
              validator: (v) {
                if (_type == 'loan') {
                  if (v == null || v.trim().isEmpty) return 'Please enter installment amount';
                  final n = double.tryParse(v.trim());
                  if (n == null || n <= 0) return 'Enter a valid installment';
                }
                return null;
              },
            ),
          ],
          const SizedBox(height: 16),
          const Text('Reason / Purpose', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: AppTheme.textPrimary)),
          const SizedBox(height: 8),
          TextFormField(
            controller: _reasonCtrl,
            maxLines: 4,
            decoration: InputDecoration(
              hintText: 'Explain why you need this ${_type == 'loan' ? 'loan' : 'advance'}...',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              filled: true,
              fillColor: Colors.white,
            ),
            validator: (v) {
              if (v == null || v.trim().isEmpty) return 'Please provide a reason';
              if (v.trim().length < 10) return 'Reason must be at least 10 characters';
              return null;
            },
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.blue[50],
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.blue[100]!),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(Icons.info_outline, color: Colors.blue[600], size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _type == 'loan'
                      ? 'Loan requests are subject to HR approval. The EMI will be deducted from your monthly salary automatically.'
                      : 'Salary advances will be deducted from your next payroll cycle. Subject to HR approval.',
                  style: TextStyle(fontSize: 12, color: Colors.blue[700]),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: _isSubmitting ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: _type == 'loan' ? const Color(0xFF6366F1) : AppTheme.primaryColor,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 2,
              ),
              child: _isSubmitting
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : Text(
                      'Submit ${_type == 'loan' ? 'Loan' : 'Advance'} Request',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
            ),
          ),
          const SizedBox(height: 30),
        ]),
      ),
    );
  }
}
