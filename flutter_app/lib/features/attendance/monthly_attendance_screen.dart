import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class MonthlyAttendanceScreen extends StatefulWidget {
  const MonthlyAttendanceScreen({super.key});

  @override
  State<MonthlyAttendanceScreen> createState() => _MonthlyAttendanceScreenState();
}

class _MonthlyAttendanceScreenState extends State<MonthlyAttendanceScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _employees = [];
  bool _isLoading = true;
  bool _isSaving = false;

  String? _selectedEmployeeId;
  int _selectedMonth = DateTime.now().month;
  int _selectedYear = DateTime.now().year;
  final _payDaysCtrl = TextEditingController();
  final _otHoursCtrl = TextEditingController(text: '0');

  final List<String> _months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  @override
  void initState() {
    super.initState();
    _loadEmployees();
  }

  Future<void> _loadEmployees() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.dio.get('/api/mobile/my-team');
      setState(() {
        _employees = res.data ?? [];
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  int _getDaysInMonth() {
    return DateTime(_selectedYear, _selectedMonth + 1, 0).day;
  }

  Future<void> _saveEntry() async {
    if (_selectedEmployeeId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select an employee'), backgroundColor: AppTheme.warningColor),
      );
      return;
    }
    final payDays = int.tryParse(_payDaysCtrl.text) ?? 0;
    if (payDays <= 0 || payDays > _getDaysInMonth()) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Pay days must be between 1 and ${_getDaysInMonth()}'), backgroundColor: AppTheme.warningColor),
      );
      return;
    }

    setState(() => _isSaving = true);
    try {
      final res = await _api.dio.post('/api/mobile/monthly-attendance-entry', data: {
        'employeeId': _selectedEmployeeId,
        'month': _selectedMonth.toString(),
        'year': _selectedYear.toString(),
        'payDays': _payDaysCtrl.text,
        'otHours': _otHoursCtrl.text,
      });
      if (mounted) {
        final data = res.data;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(data['message'] ?? 'Attendance created successfully'),
            backgroundColor: AppTheme.accentColor,
          ),
        );
        _selectedEmployeeId = null;
        _payDaysCtrl.clear();
        _otHoursCtrl.text = '0';
        setState(() {});
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
    _payDaysCtrl.dispose();
    _otHoursCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Monthly Attendance Entry')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Card(
                    color: AppTheme.primaryColor.withValues(alpha: 0.05),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline, color: AppTheme.primaryColor, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Enter total pay days and OT hours for a month. System will auto-generate daily attendance records.',
                              style: TextStyle(fontSize: 12, color: Colors.grey[700]),
                            ),
                          ),
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
                          const Text('Monthly Entry', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 16),

                          DropdownButtonFormField<String>(
                            value: _selectedEmployeeId,
                            decoration: const InputDecoration(labelText: 'Select Employee *', border: OutlineInputBorder()),
                            isExpanded: true,
                            items: _employees.map<DropdownMenuItem<String>>((e) {
                              return DropdownMenuItem(
                                value: e['id'].toString(),
                                child: Text('${e['firstName']} ${e['lastName']} (${e['employeeCode'] ?? ""})'),
                              );
                            }).toList(),
                            onChanged: (val) => setState(() => _selectedEmployeeId = val),
                          ),
                          const SizedBox(height: 16),

                          Row(
                            children: [
                              Expanded(
                                child: DropdownButtonFormField<int>(
                                  value: _selectedMonth,
                                  decoration: const InputDecoration(labelText: 'Month *', border: OutlineInputBorder()),
                                  items: List.generate(12, (i) => DropdownMenuItem(value: i + 1, child: Text(_months[i]))),
                                  onChanged: (val) => setState(() => _selectedMonth = val ?? DateTime.now().month),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: DropdownButtonFormField<int>(
                                  value: _selectedYear,
                                  decoration: const InputDecoration(labelText: 'Year *', border: OutlineInputBorder()),
                                  items: List.generate(3, (i) {
                                    final year = DateTime.now().year - 1 + i;
                                    return DropdownMenuItem(value: year, child: Text('$year'));
                                  }),
                                  onChanged: (val) => setState(() => _selectedYear = val ?? DateTime.now().year),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text('Days in ${_months[_selectedMonth - 1]} $_selectedYear: ${_getDaysInMonth()}',
                              style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                          const SizedBox(height: 16),

                          TextField(
                            controller: _payDaysCtrl,
                            decoration: InputDecoration(
                              labelText: 'Pay Days *',
                              helperText: 'Total working days (Present + Leave + Holidays + WO)',
                              border: const OutlineInputBorder(),
                              suffixText: '/ ${_getDaysInMonth()}',
                            ),
                            keyboardType: TextInputType.number,
                          ),
                          const SizedBox(height: 16),

                          TextField(
                            controller: _otHoursCtrl,
                            decoration: const InputDecoration(
                              labelText: 'OT Hours (Total)',
                              helperText: 'Total overtime hours for the month (distributed across pay days)',
                              border: OutlineInputBorder(),
                            ),
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          ),
                          const SizedBox(height: 24),

                          SizedBox(
                            width: double.infinity,
                            height: 48,
                            child: ElevatedButton.icon(
                              onPressed: _isSaving ? null : _saveEntry,
                              icon: _isSaving
                                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                  : const Icon(Icons.save),
                              label: Text(_isSaving ? 'Creating Records...' : 'Generate Attendance'),
                              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryColor),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
