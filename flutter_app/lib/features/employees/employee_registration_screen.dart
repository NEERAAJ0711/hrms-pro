import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class EmployeeRegistrationScreen extends StatefulWidget {
  const EmployeeRegistrationScreen({super.key});

  @override
  State<EmployeeRegistrationScreen> createState() => _EmployeeRegistrationScreenState();
}

class _EmployeeRegistrationScreenState extends State<EmployeeRegistrationScreen> {
  final ApiClient _api = ApiClient();
  final _formKey = GlobalKey<FormState>();
  bool _isSaving = false;
  bool _isLoading = true;

  List<dynamic> _departments = [];
  List<dynamic> _designations = [];
  List<dynamic> _locations = [];

  final _empCodeCtrl    = TextEditingController();
  final _fullNameCtrl   = TextEditingController();
  final _mobileCtrl     = TextEditingController();
  final _emailCtrl      = TextEditingController();
  final _aadhaarCtrl    = TextEditingController();
  final _panCtrl        = TextEditingController();
  final _bankAccCtrl    = TextEditingController();
  final _ifscCtrl       = TextEditingController();
  final _bankNameCtrl   = TextEditingController();
  final _uanCtrl        = TextEditingController();
  final _esiNumberCtrl  = TextEditingController();
  final _grossSalaryCtrl = TextEditingController();
  final _addressCtrl    = TextEditingController();

  String _gender = 'male';
  String _employmentType = 'permanent';
  String? _department;
  String? _designation;
  String? _location;
  String? _ptState;
  DateTime _dateOfJoining = DateTime.now();
  DateTime? _dateOfBirth;
  bool _pfApplicable    = false;
  bool _esiApplicable   = false;
  bool _lwfApplicable   = false;
  bool _bonusApplicable = false;
  bool _bonusPaidMonthly = false;
  String _paymentMode   = 'bank';

  @override
  void initState() {
    super.initState();
    _loadMasterData();
  }

  Future<void> _loadMasterData() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _api.dio.get('/api/mobile/departments'),
        _api.dio.get('/api/mobile/designations'),
        _api.dio.get('/api/mobile/locations'),
      ]);
      setState(() {
        _departments = results[0].data ?? [];
        _designations = results[1].data ?? [];
        _locations = results[2].data ?? [];
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _pickDate({required bool isJoining}) async {
    final date = await showDatePicker(
      context: context,
      initialDate: isJoining ? _dateOfJoining : (_dateOfBirth ?? DateTime(1990)),
      firstDate: DateTime(1950),
      lastDate: DateTime.now(),
    );
    if (date != null) setState(() { isJoining ? _dateOfJoining = date : _dateOfBirth = date; });
  }

  String _fmt(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String get _initials {
    final n = _fullNameCtrl.text.trim().split(' ');
    if (n.isEmpty || n.first.isEmpty) return 'E';
    if (n.length == 1) return n.first[0].toUpperCase();
    return (n.first[0] + n.last[0]).toUpperCase();
  }

  Future<void> _saveEmployee() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSaving = true);
    try {
      final nameParts = _fullNameCtrl.text.trim().split(RegExp(r'\s+'));
      final firstName = nameParts.first;
      final lastName = nameParts.length > 1 ? nameParts.sublist(1).join(' ') : '';
      await _api.dio.post('/api/mobile/employees', data: {
        'employeeCode': _empCodeCtrl.text.trim(),
        'firstName': firstName,
        'lastName': lastName,
        'gender': _gender,
        'dateOfBirth': _dateOfBirth != null ? _fmt(_dateOfBirth!) : null,
        'mobileNumber': _mobileCtrl.text.trim().isNotEmpty ? _mobileCtrl.text.trim() : null,
        'officialEmail': _emailCtrl.text.trim().isNotEmpty ? _emailCtrl.text.trim() : null,
        'dateOfJoining': _fmt(_dateOfJoining),
        'department': _department,
        'designation': _designation,
        'location': _location,
        'employmentType': _employmentType,
        'grossSalary': _grossSalaryCtrl.text.trim().isNotEmpty ? int.tryParse(_grossSalaryCtrl.text.trim()) : null,
        'paymentMode': _paymentMode,
        'pfApplicable': _pfApplicable,
        'uan': _uanCtrl.text.trim().isNotEmpty ? _uanCtrl.text.trim() : null,
        'esiApplicable': _esiApplicable,
        'esiNumber': _esiNumberCtrl.text.trim().isNotEmpty ? _esiNumberCtrl.text.trim() : null,
        'ptState': _ptState,
        'lwfApplicable': _lwfApplicable,
        'bonusApplicable': _bonusApplicable,
        'bonusPaidMonthly': _bonusPaidMonthly,
        'bankAccount': _bankAccCtrl.text.trim().isNotEmpty ? _bankAccCtrl.text.trim() : null,
        'bankName': _bankNameCtrl.text.trim().isNotEmpty ? _bankNameCtrl.text.trim() : null,
        'ifsc': _ifscCtrl.text.trim().isNotEmpty ? _ifscCtrl.text.trim() : null,
        'pan': _panCtrl.text.trim().isNotEmpty ? _panCtrl.text.trim() : null,
        'aadhaar': _aadhaarCtrl.text.trim().isNotEmpty ? _aadhaarCtrl.text.trim() : null,
        'address': _addressCtrl.text.trim().isNotEmpty ? _addressCtrl.text.trim() : null,
        'status': 'active',
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Employee registered successfully!'), backgroundColor: AppTheme.accentColor),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      String msg = 'Failed to register employee';
      if (e is DioException) msg = e.response?.data?['error'] ?? msg;
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor));
    }
    setState(() => _isSaving = false);
  }

  @override
  void dispose() {
    _empCodeCtrl.dispose(); _fullNameCtrl.dispose(); _mobileCtrl.dispose();
    _emailCtrl.dispose(); _aadhaarCtrl.dispose(); _panCtrl.dispose();
    _bankAccCtrl.dispose(); _ifscCtrl.dispose(); _bankNameCtrl.dispose();
    _uanCtrl.dispose(); _esiNumberCtrl.dispose(); _grossSalaryCtrl.dispose();
    _addressCtrl.dispose();
    super.dispose();
  }

  // ─── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text('Register Employee'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        titleTextStyle: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
        elevation: 0,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    // ── Gradient header ──────────────────────────────
                    _buildHeader(),
                    const SizedBox(height: 16),

                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Column(
                        children: [
                          _section('Basic Information', Icons.person_outline, const Color(0xFF1A56DB), [
                            _field(_empCodeCtrl, 'Employee Code', Icons.badge_outlined, required: true),
                            _field(_fullNameCtrl, 'Full Name', Icons.account_circle_outlined, required: true,
                              onChanged: (_) => setState(() {})),
                            _dropdown<String>(
                              label: 'Gender', icon: Icons.wc,
                              value: _gender,
                              items: const [
                                DropdownMenuItem(value: 'male', child: Text('Male')),
                                DropdownMenuItem(value: 'female', child: Text('Female')),
                                DropdownMenuItem(value: 'other', child: Text('Other')),
                              ],
                              onChanged: (v) => setState(() => _gender = v ?? 'male'),
                            ),
                            _dateTile('Date of Birth', _dateOfBirth, onTap: () => _pickDate(isJoining: false)),
                            _dateTile('Date of Joining *', _dateOfJoining, onTap: () => _pickDate(isJoining: true)),
                            _field(_mobileCtrl, 'Mobile Number', Icons.phone_outlined, keyboardType: TextInputType.phone),
                            _field(_emailCtrl, 'Official Email', Icons.email_outlined, keyboardType: TextInputType.emailAddress),
                          ]),

                          _section('Organization Details', Icons.business_outlined, const Color(0xFF0694A2), [
                            if (_departments.isNotEmpty)
                              _dropdown<String>(
                                label: 'Department', icon: Icons.corporate_fare,
                                value: _department,
                                items: _departments.map<DropdownMenuItem<String>>((d) =>
                                  DropdownMenuItem(value: d['name'].toString(), child: Text(d['name'].toString()))).toList(),
                                onChanged: (v) => setState(() => _department = v),
                              ),
                            if (_designations.isNotEmpty)
                              _dropdown<String>(
                                label: 'Designation', icon: Icons.work_history_outlined,
                                value: _designation,
                                items: _designations.map<DropdownMenuItem<String>>((d) =>
                                  DropdownMenuItem(value: d['name'].toString(), child: Text(d['name'].toString()))).toList(),
                                onChanged: (v) => setState(() => _designation = v),
                              ),
                            if (_locations.isNotEmpty)
                              _dropdown<String>(
                                label: 'Location', icon: Icons.location_on_outlined,
                                value: _location,
                                items: _locations.map<DropdownMenuItem<String>>((l) =>
                                  DropdownMenuItem(value: l['name'].toString(), child: Text(l['name'].toString()))).toList(),
                                onChanged: (v) => setState(() => _location = v),
                              ),
                            _dropdown<String>(
                              label: 'Employment Type', icon: Icons.work_outline,
                              value: _employmentType,
                              items: const [
                                DropdownMenuItem(value: 'permanent', child: Text('Permanent')),
                                DropdownMenuItem(value: 'contract', child: Text('Contract')),
                                DropdownMenuItem(value: 'probation', child: Text('Probation')),
                                DropdownMenuItem(value: 'intern', child: Text('Intern')),
                              ],
                              onChanged: (v) => setState(() => _employmentType = v ?? 'permanent'),
                            ),
                          ]),

                          _section('KYC / Documents', Icons.folder_open_outlined, const Color(0xFF9C27B0), [
                            _field(_aadhaarCtrl, 'Aadhaar Number', Icons.credit_card_outlined, keyboardType: TextInputType.number, maxLength: 12),
                            _field(_panCtrl, 'PAN Number', Icons.article_outlined, maxLength: 10),
                            _field(_addressCtrl, 'Address', Icons.home_outlined, maxLines: 2),
                          ]),

                          _section('Salary & Bank Details', Icons.account_balance_outlined, const Color(0xFF009688), [
                            _field(_grossSalaryCtrl, 'Gross Salary (₹)', Icons.currency_rupee, keyboardType: TextInputType.number),
                            _dropdown<String>(
                              label: 'Payment Mode', icon: Icons.payment_outlined,
                              value: _paymentMode,
                              items: const [
                                DropdownMenuItem(value: 'bank', child: Text('Bank Transfer')),
                                DropdownMenuItem(value: 'cash', child: Text('Cash')),
                                DropdownMenuItem(value: 'cheque', child: Text('Cheque')),
                              ],
                              onChanged: (v) => setState(() => _paymentMode = v ?? 'bank'),
                            ),
                            _field(_bankAccCtrl, 'Bank Account Number', Icons.account_balance_wallet_outlined, keyboardType: TextInputType.number),
                            _field(_ifscCtrl, 'IFSC Code', Icons.numbers_outlined),
                            _field(_bankNameCtrl, 'Bank Name', Icons.business_outlined),
                          ]),

                          _section('Statutory Compliance', Icons.gavel_outlined, const Color(0xFFE91E63), [
                            _switchTile('PF Applicable', Icons.savings_outlined, _pfApplicable,
                              (v) => setState(() => _pfApplicable = v)),
                            if (_pfApplicable)
                              _field(_uanCtrl, 'UAN Number', Icons.fingerprint),
                            _switchTile('ESI Applicable', Icons.health_and_safety_outlined, _esiApplicable,
                              (v) => setState(() => _esiApplicable = v)),
                            if (_esiApplicable)
                              _field(_esiNumberCtrl, 'ESI Number', Icons.medical_information_outlined),
                            _dropdown<String?>(
                              label: 'Professional Tax State', icon: Icons.account_balance_outlined,
                              value: _ptState,
                              items: const [
                                DropdownMenuItem(value: null, child: Text('Not Applicable')),
                                DropdownMenuItem(value: 'Maharashtra', child: Text('Maharashtra')),
                                DropdownMenuItem(value: 'Karnataka', child: Text('Karnataka')),
                                DropdownMenuItem(value: 'West Bengal', child: Text('West Bengal')),
                                DropdownMenuItem(value: 'Tamil Nadu', child: Text('Tamil Nadu')),
                                DropdownMenuItem(value: 'Andhra Pradesh', child: Text('Andhra Pradesh')),
                                DropdownMenuItem(value: 'Telangana', child: Text('Telangana')),
                                DropdownMenuItem(value: 'Gujarat', child: Text('Gujarat')),
                                DropdownMenuItem(value: 'Madhya Pradesh', child: Text('Madhya Pradesh')),
                                DropdownMenuItem(value: 'Kerala', child: Text('Kerala')),
                                DropdownMenuItem(value: 'Assam', child: Text('Assam')),
                              ],
                              onChanged: (v) => setState(() => _ptState = v),
                            ),
                            _switchTile('LWF Applicable', Icons.account_balance_wallet_outlined, _lwfApplicable,
                              (v) => setState(() => _lwfApplicable = v)),
                            _switchTile('Bonus Applicable', Icons.card_giftcard_outlined, _bonusApplicable,
                              (v) => setState(() { _bonusApplicable = v; if (!v) _bonusPaidMonthly = false; })),
                            if (_bonusApplicable)
                              _switchTile('Pay Bonus Monthly', Icons.calendar_month_outlined, _bonusPaidMonthly,
                                (v) => setState(() => _bonusPaidMonthly = v)),
                          ]),

                          // ── Submit ─────────────────────────────────
                          const SizedBox(height: 8),
                          SizedBox(
                            width: double.infinity,
                            height: 52,
                            child: ElevatedButton.icon(
                              onPressed: _isSaving ? null : _saveEmployee,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.primaryColor,
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                elevation: 2,
                              ),
                              icon: _isSaving
                                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                  : const Icon(Icons.person_add_rounded),
                              label: Text(_isSaving ? 'Registering…' : 'Register Employee',
                                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                            ),
                          ),
                          const SizedBox(height: 32),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  // ── Header with avatar ────────────────────────────────────────────────────
  Widget _buildHeader() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 28),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppTheme.primaryColor, AppTheme.primaryDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(28),
          bottomRight: Radius.circular(28),
        ),
      ),
      child: Column(
        children: [
          CircleAvatar(
            radius: 38,
            backgroundColor: Colors.white.withValues(alpha: 0.2),
            child: Text(
              _initials,
              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            _fullNameCtrl.text.trim().isEmpty ? 'New Employee' : _fullNameCtrl.text.trim(),
            style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            _empCodeCtrl.text.trim().isEmpty ? 'Employee Code: —' : 'Code: ${_empCodeCtrl.text.trim()}',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 13),
          ),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
            child: Text(
              _employmentType.toUpperCase(),
              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5),
            ),
          ),
        ],
      ),
    );
  }

  // ── Section card ──────────────────────────────────────────────────────────
  Widget _section(String title, IconData icon, Color color, List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.07),
              borderRadius: const BorderRadius.only(topLeft: Radius.circular(16), topRight: Radius.circular(16)),
              border: Border(bottom: BorderSide(color: color.withValues(alpha: 0.12))),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
                  child: Icon(icon, color: color, size: 18),
                ),
                const SizedBox(width: 10),
                Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: color)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: _withSpacing(children),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _withSpacing(List<Widget> widgets) {
    final result = <Widget>[];
    for (int i = 0; i < widgets.length; i++) {
      result.add(widgets[i]);
      if (i < widgets.length - 1) result.add(const SizedBox(height: 12));
    }
    return result;
  }

  // ── Field helpers ─────────────────────────────────────────────────────────
  Widget _field(TextEditingController ctrl, String label, IconData icon, {
    TextInputType? keyboardType,
    int maxLines = 1,
    int? maxLength,
    bool required = false,
    ValueChanged<String>? onChanged,
  }) {
    return TextFormField(
      controller: ctrl,
      keyboardType: keyboardType,
      maxLines: maxLines,
      maxLength: maxLength,
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 20, color: AppTheme.primaryColor),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primaryColor, width: 1.5)),
        filled: true,
        fillColor: Colors.grey.shade50,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        counterText: '',
      ),
      validator: required ? (v) => (v == null || v.trim().isEmpty) ? '$label is required' : null : null,
    );
  }

  Widget _dropdown<T>({
    required String label,
    required IconData icon,
    required T? value,
    required List<DropdownMenuItem<T>> items,
    required ValueChanged<T?> onChanged,
  }) {
    return DropdownButtonFormField<T>(
      value: value,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 20, color: AppTheme.primaryColor),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primaryColor, width: 1.5)),
        filled: true,
        fillColor: Colors.grey.shade50,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      ),
      isExpanded: true,
      items: items,
      onChanged: onChanged,
    );
  }

  Widget _dateTile(String label, DateTime? date, {required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(10),
          color: Colors.grey.shade50,
        ),
        child: Row(
          children: [
            const Icon(Icons.calendar_today_outlined, size: 20, color: AppTheme.primaryColor),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  const SizedBox(height: 2),
                  Text(
                    date != null ? _fmt(date) : 'Tap to select',
                    style: TextStyle(
                      fontSize: 15,
                      color: date != null ? AppTheme.textPrimary : Colors.grey.shade400,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.grey.shade400),
          ],
        ),
      ),
    );
  }

  Widget _switchTile(String label, IconData icon, bool value, ValueChanged<bool> onChanged) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade200),
        borderRadius: BorderRadius.circular(10),
        color: value ? AppTheme.primaryColor.withValues(alpha: 0.04) : Colors.grey.shade50,
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: value ? AppTheme.primaryColor : Colors.grey),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 14))),
          Switch(
            value: value,
            onChanged: onChanged,
            activeColor: AppTheme.primaryColor,
          ),
        ],
      ),
    );
  }
}
