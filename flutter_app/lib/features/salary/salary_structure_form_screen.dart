import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:intl/intl.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class SalaryStructureFormScreen extends StatefulWidget {
  final Map<String, dynamic>? existingStructure;
  const SalaryStructureFormScreen({super.key, this.existingStructure});

  @override
  State<SalaryStructureFormScreen> createState() => _SalaryStructureFormScreenState();
}

class _SalaryStructureFormScreenState extends State<SalaryStructureFormScreen> {
  final ApiClient _api = ApiClient();
  final _formKey = GlobalKey<FormState>();
  bool _isSaving = false;
  bool _isLoading = true;
  List<dynamic> _employees = [];

  String? _selectedEmployeeId;
  DateTime _effectiveFrom = DateTime.now();

  final _basicCtrl = TextEditingController(text: '0');
  final _hraCtrl = TextEditingController(text: '0');
  final _convCtrl = TextEditingController(text: '0');
  final _medCtrl = TextEditingController(text: '0');
  final _specialCtrl = TextEditingController(text: '0');
  final _otherEarnCtrl = TextEditingController(text: '0');
  final _pfEmpCtrl = TextEditingController(text: '0');
  final _pfErCtrl = TextEditingController(text: '0');
  final _esiCtrl = TextEditingController(text: '0');
  final _ptCtrl = TextEditingController(text: '0');
  final _lwfCtrl = TextEditingController(text: '0');
  final _tdsCtrl = TextEditingController(text: '0');
  final _otherDedCtrl = TextEditingController(text: '0');

  bool get isEditing => widget.existingStructure != null;

  @override
  void initState() {
    super.initState();
    _loadEmployees();
    if (isEditing) {
      final s = widget.existingStructure!;
      _selectedEmployeeId = s['employeeId']?.toString();
      _basicCtrl.text = (s['basicSalary'] ?? 0).toString();
      _hraCtrl.text = (s['hra'] ?? 0).toString();
      _convCtrl.text = (s['conveyance'] ?? 0).toString();
      _medCtrl.text = (s['medicalAllowance'] ?? 0).toString();
      _specialCtrl.text = (s['specialAllowance'] ?? 0).toString();
      _otherEarnCtrl.text = (s['otherAllowances'] ?? 0).toString();
      _pfEmpCtrl.text = (s['pfEmployee'] ?? 0).toString();
      _pfErCtrl.text = (s['pfEmployer'] ?? 0).toString();
      _esiCtrl.text = (s['esi'] ?? 0).toString();
      _ptCtrl.text = (s['professionalTax'] ?? 0).toString();
      _lwfCtrl.text = (s['lwfEmployee'] ?? 0).toString();
      _tdsCtrl.text = (s['tds'] ?? 0).toString();
      _otherDedCtrl.text = (s['otherDeductions'] ?? 0).toString();
      if (s['effectiveFrom'] != null) {
        try { _effectiveFrom = DateTime.parse(s['effectiveFrom']); } catch (_) {}
      }
    }
  }

  Future<void> _loadEmployees() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.dio.get('/api/mobile/my-team');
      setState(() { _employees = res.data ?? []; _isLoading = false; });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  int _intVal(TextEditingController ctrl) => int.tryParse(ctrl.text) ?? 0;

  int get _grossSalary => _intVal(_basicCtrl) + _intVal(_hraCtrl) + _intVal(_convCtrl) + _intVal(_medCtrl) + _intVal(_specialCtrl) + _intVal(_otherEarnCtrl);
  int get _totalDeductions => _intVal(_pfEmpCtrl) + _intVal(_pfErCtrl) + _intVal(_esiCtrl) + _intVal(_ptCtrl) + _intVal(_lwfCtrl) + _intVal(_tdsCtrl) + _intVal(_otherDedCtrl);
  int get _netSalary => _grossSalary - _totalDeductions + _intVal(_pfErCtrl);

  String _formatDate(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  String _formatAmount(int amount) => NumberFormat('#,##,###', 'en_IN').format(amount);

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (!isEditing && _selectedEmployeeId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please select an employee'), backgroundColor: AppTheme.warningColor));
      return;
    }

    setState(() => _isSaving = true);
    try {
      final data = {
        'employeeId': _selectedEmployeeId ?? widget.existingStructure?['employeeId'],
        'basicSalary': _intVal(_basicCtrl),
        'hra': _intVal(_hraCtrl),
        'conveyance': _intVal(_convCtrl),
        'medicalAllowance': _intVal(_medCtrl),
        'specialAllowance': _intVal(_specialCtrl),
        'otherAllowances': _intVal(_otherEarnCtrl),
        'grossSalary': _grossSalary,
        'pfEmployee': _intVal(_pfEmpCtrl),
        'pfEmployer': _intVal(_pfErCtrl),
        'esi': _intVal(_esiCtrl),
        'professionalTax': _intVal(_ptCtrl),
        'lwfEmployee': _intVal(_lwfCtrl),
        'tds': _intVal(_tdsCtrl),
        'otherDeductions': _intVal(_otherDedCtrl),
        'netSalary': _netSalary,
        'effectiveFrom': _formatDate(_effectiveFrom),
        'status': 'active',
      };

      if (isEditing) {
        await _api.dio.patch('/api/mobile/salary-structures/${widget.existingStructure!['id']}', data: data);
      } else {
        await _api.dio.post('/api/mobile/salary-structures', data: data);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Salary structure ${isEditing ? "updated" : "created"} successfully!'), backgroundColor: AppTheme.accentColor),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      String msg = 'Failed to save';
      if (e is DioException) msg = e.response?.data?['error'] ?? msg;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor));
      }
    }
    setState(() => _isSaving = false);
  }

  @override
  void dispose() {
    _basicCtrl.dispose(); _hraCtrl.dispose(); _convCtrl.dispose();
    _medCtrl.dispose(); _specialCtrl.dispose(); _otherEarnCtrl.dispose();
    _pfEmpCtrl.dispose(); _pfErCtrl.dispose(); _esiCtrl.dispose();
    _ptCtrl.dispose(); _lwfCtrl.dispose(); _tdsCtrl.dispose(); _otherDedCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(isEditing ? 'Update Salary Structure' : 'Create Salary Structure')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (!isEditing) ...[
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: DropdownButtonFormField<String>(
                            value: _selectedEmployeeId,
                            decoration: const InputDecoration(labelText: 'Select Employee *', border: OutlineInputBorder()),
                            isExpanded: true,
                            items: _employees.map<DropdownMenuItem<String>>((e) {
                              return DropdownMenuItem(value: e['id'].toString(), child: Text('${e['firstName']} ${e['lastName']} (${e['employeeCode'] ?? ""})'));
                            }).toList(),
                            onChanged: (val) => setState(() => _selectedEmployeeId = val),
                            validator: (v) => v == null ? 'Required' : null,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],

                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Earnings', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.accentColor)),
                            const SizedBox(height: 12),
                            _amountField(_basicCtrl, 'Basic Salary *', required: true),
                            const SizedBox(height: 10),
                            _amountField(_hraCtrl, 'HRA'),
                            const SizedBox(height: 10),
                            _amountField(_convCtrl, 'Conveyance'),
                            const SizedBox(height: 10),
                            _amountField(_medCtrl, 'Medical Allowance'),
                            const SizedBox(height: 10),
                            _amountField(_specialCtrl, 'Special Allowance'),
                            const SizedBox(height: 10),
                            _amountField(_otherEarnCtrl, 'Other Allowances'),
                            const Divider(height: 24),
                            _summaryRow('Gross Salary', _grossSalary, AppTheme.accentColor),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Deductions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.errorColor)),
                            const SizedBox(height: 12),
                            _amountField(_pfEmpCtrl, 'PF (Employee)'),
                            const SizedBox(height: 10),
                            _amountField(_pfErCtrl, 'PF (Employer)'),
                            const SizedBox(height: 10),
                            _amountField(_esiCtrl, 'ESI'),
                            const SizedBox(height: 10),
                            _amountField(_ptCtrl, 'Professional Tax'),
                            const SizedBox(height: 10),
                            _amountField(_lwfCtrl, 'LWF'),
                            const SizedBox(height: 10),
                            _amountField(_tdsCtrl, 'TDS'),
                            const SizedBox(height: 10),
                            _amountField(_otherDedCtrl, 'Other Deductions'),
                            const Divider(height: 24),
                            _summaryRow('Total Deductions', _totalDeductions, AppTheme.errorColor),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    Card(
                      color: AppTheme.primaryColor.withValues(alpha: 0.05),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            _summaryRow('Net Salary', _netSalary, AppTheme.primaryColor),
                            const SizedBox(height: 12),
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text('Effective From: ${_formatDate(_effectiveFrom)}'),
                              trailing: const Icon(Icons.calendar_today, color: AppTheme.primaryColor),
                              onTap: () async {
                                final date = await showDatePicker(
                                  context: context, initialDate: _effectiveFrom,
                                  firstDate: DateTime(2020), lastDate: DateTime(2030),
                                );
                                if (date != null) setState(() => _effectiveFrom = date);
                              },
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),

                    SizedBox(
                      width: double.infinity, height: 50,
                      child: ElevatedButton.icon(
                        onPressed: _isSaving ? null : _save,
                        icon: _isSaving
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.save),
                        label: Text(_isSaving ? 'Saving...' : (isEditing ? 'Update Structure' : 'Create Structure')),
                        style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryColor),
                      ),
                    ),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _amountField(TextEditingController ctrl, String label, {bool required = false}) {
    return TextFormField(
      controller: ctrl,
      decoration: InputDecoration(labelText: label, border: const OutlineInputBorder(), prefixText: '₹ '),
      keyboardType: TextInputType.number,
      validator: required ? (v) => (v == null || v.isEmpty || (int.tryParse(v) ?? 0) <= 0) ? 'Required' : null : null,
      onChanged: (_) => setState(() {}),
    );
  }

  Widget _summaryRow(String label, int amount, Color color) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color)),
        Text('₹${_formatAmount(amount)}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color)),
      ],
    );
  }
}
