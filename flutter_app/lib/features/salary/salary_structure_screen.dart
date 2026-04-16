import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class SalaryStructureScreen extends StatefulWidget {
  const SalaryStructureScreen({super.key});

  @override
  State<SalaryStructureScreen> createState() => _SalaryStructureScreenState();
}

class _SalaryStructureScreenState extends State<SalaryStructureScreen> {
  final ApiClient _api = ApiClient();
  Map<String, dynamic>? _structure;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadStructure();
  }

  Future<void> _loadStructure() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.dio.get('/api/mobile/salary-structure');
      setState(() {
        _structure = res.data;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Salary Structure')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _structure == null
              ? const Center(child: Text('No salary structure assigned yet', style: TextStyle(color: AppTheme.textSecondary)))
              : RefreshIndicator(
                  onRefresh: _loadStructure,
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Card(
                          color: AppTheme.primaryColor.withValues(alpha: 0.05),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('CTC (Monthly)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                                Text('₹${_formatAmount(_structure!['ctc'] ?? _structure!['grossSalary'])}',
                                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),

                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Earnings', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.accentColor)),
                                const SizedBox(height: 12),
                                _row('Basic Salary', _structure!['basicSalary']),
                                _row('HRA', _structure!['hra']),
                                _row('DA', _structure!['da']),
                                _row('Conveyance', _structure!['conveyance']),
                                _row('Medical Allowance', _structure!['medicalAllowance']),
                                _row('Special Allowance', _structure!['specialAllowance']),
                                _row('Other Earnings', _structure!['otherEarnings']),
                                if (_structure!['monthlyBonus'] != null && _structure!['monthlyBonus'] != 0)
                                  _row('Monthly Bonus', _structure!['monthlyBonus']),
                                const Divider(),
                                _row('Gross Salary', _structure!['grossSalary'], isBold: true),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),

                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Deductions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.errorColor)),
                                const SizedBox(height: 12),
                                _row('PF (Employee)', _structure!['pfEmployee']),
                                _row('PF (Employer)', _structure!['pfEmployer']),
                                _row('ESIC (Employee)', _structure!['esicEmployee']),
                                _row('ESIC (Employer)', _structure!['esicEmployer']),
                                _row('Professional Tax', _structure!['professionalTax']),
                                _row('LWF', _structure!['lwf']),
                                _row('TDS', _structure!['tds']),
                                _row('Other Deductions', _structure!['otherDeductions']),
                                const Divider(),
                                _row('Total Deductions', _structure!['totalDeductions'], isBold: true),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),

                        Card(
                          color: AppTheme.accentColor.withValues(alpha: 0.05),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Net Salary', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                                Text('₹${_formatAmount(_structure!['netSalary'] ?? _structure!['netPay'])}',
                                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppTheme.accentColor)),
                              ],
                            ),
                          ),
                        ),

                        if (_structure!['effectiveFrom'] != null) ...[
                          const SizedBox(height: 12),
                          Text('Effective from: ${_structure!['effectiveFrom']}', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                        ],
                        const SizedBox(height: 24),
                      ],
                    ),
                  ),
                ),
    );
  }

  Widget _row(String label, dynamic amount, {bool isBold = false}) {
    if (amount == null || amount == 0 || amount == '0') return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey[700], fontWeight: isBold ? FontWeight.bold : FontWeight.normal)),
          Text('₹${_formatAmount(amount)}', style: TextStyle(fontWeight: isBold ? FontWeight.bold : FontWeight.w500)),
        ],
      ),
    );
  }

  String _formatAmount(dynamic amount) {
    if (amount == null) return '0';
    final num val = amount is num ? amount : num.tryParse(amount.toString()) ?? 0;
    return NumberFormat('#,##,###', 'en_IN').format(val);
  }
}
