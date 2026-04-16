import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:intl/intl.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class QuickAttendanceScreen extends StatefulWidget {
  const QuickAttendanceScreen({super.key});

  @override
  State<QuickAttendanceScreen> createState() => _QuickAttendanceScreenState();
}

class _QuickAttendanceScreenState extends State<QuickAttendanceScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _employees = [];
  bool _isLoading = true;
  bool _isSaving = false;

  String? _selectedEmployeeId;
  DateTime _selectedDate = DateTime.now();
  String _status = 'present';
  final _clockInCtrl = TextEditingController();
  final _clockOutCtrl = TextEditingController();
  final _otHoursCtrl = TextEditingController(text: '0');

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

  Future<void> _saveEntry() async {
    if (_selectedEmployeeId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please select an employee'), backgroundColor: AppTheme.warningColor));
      return;
    }
    setState(() => _isSaving = true);
    try {
      await _api.dio.post('/api/mobile/quick-attendance', data: {
        'employeeId': _selectedEmployeeId,
        'date': DateFormat('yyyy-MM-dd').format(_selectedDate),
        'status': _status,
        'clockIn': _clockInCtrl.text.isNotEmpty ? _clockInCtrl.text : null,
        'clockOut': _clockOutCtrl.text.isNotEmpty ? _clockOutCtrl.text : null,
        'otHours': _otHoursCtrl.text,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Attendance entry saved'), backgroundColor: AppTheme.accentColor));
        _selectedEmployeeId = null;
        _clockInCtrl.clear();
        _clockOutCtrl.clear();
        _otHoursCtrl.text = '0';
        _status = 'present';
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
    _clockInCtrl.dispose();
    _clockOutCtrl.dispose();
    _otHoursCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Quick Attendance Entry')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('New Attendance Entry', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 16),

                          DropdownButtonFormField<String>(
                            value: _selectedEmployeeId,
                            decoration: const InputDecoration(labelText: 'Select Employee *'),
                            items: _employees.map<DropdownMenuItem<String>>((e) {
                              return DropdownMenuItem(value: e['id'].toString(), child: Text('${e['firstName']} ${e['lastName']} (${e['employeeCode'] ?? ""})'));
                            }).toList(),
                            onChanged: (val) => setState(() => _selectedEmployeeId = val),
                          ),
                          const SizedBox(height: 16),

                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text('Date: ${DateFormat('yyyy-MM-dd (EEEE)').format(_selectedDate)}'),
                            trailing: const Icon(Icons.calendar_today, color: AppTheme.primaryColor),
                            onTap: () async {
                              final date = await showDatePicker(
                                context: context,
                                initialDate: _selectedDate,
                                firstDate: DateTime.now().subtract(const Duration(days: 60)),
                                lastDate: DateTime.now(),
                              );
                              if (date != null) setState(() => _selectedDate = date);
                            },
                          ),
                          const SizedBox(height: 12),

                          DropdownButtonFormField<String>(
                            value: _status,
                            decoration: const InputDecoration(labelText: 'Status'),
                            items: const [
                              DropdownMenuItem(value: 'present', child: Text('Present (P)')),
                              DropdownMenuItem(value: 'absent', child: Text('Absent (A)')),
                              DropdownMenuItem(value: 'half_day', child: Text('Half Day (HD)')),
                              DropdownMenuItem(value: 'weekly_off', child: Text('Weekly Off (WO)')),
                              DropdownMenuItem(value: 'holiday', child: Text('Holiday (H)')),
                              DropdownMenuItem(value: 'leave', child: Text('On Leave (L)')),
                            ],
                            onChanged: (val) => setState(() => _status = val ?? 'present'),
                          ),
                          const SizedBox(height: 16),

                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _clockInCtrl,
                                  decoration: const InputDecoration(labelText: 'Clock In (HH:MM)', hintText: '09:00'),
                                  keyboardType: TextInputType.datetime,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: TextField(
                                  controller: _clockOutCtrl,
                                  decoration: const InputDecoration(labelText: 'Clock Out (HH:MM)', hintText: '18:00'),
                                  keyboardType: TextInputType.datetime,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),

                          TextField(
                            controller: _otHoursCtrl,
                            decoration: const InputDecoration(labelText: 'OT Hours'),
                            keyboardType: TextInputType.number,
                          ),
                          const SizedBox(height: 20),

                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: _isSaving ? null : _saveEntry,
                              icon: _isSaving
                                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                  : const Icon(Icons.save),
                              label: Text(_isSaving ? 'Saving...' : 'Save Entry'),
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
