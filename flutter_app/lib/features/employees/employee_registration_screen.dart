import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

  // ── Wizard state ──────────────────────────────────────────────────────────
  int _currentStep = 0;
  static const int _totalSteps = 6;
  static const List<String> _stepTitles = [
    'Aadhaar Verification',
    'Basic Information',
    'Organization Details',
    'KYC / Documents',
    'Salary & Bank',
    'Statutory & Review',
  ];

  // ── Aadhaar verification state ────────────────────────────────────────────
  bool _aadhaarChecking = false;
  bool _aadhaarProceedable = false; // true when not_found or other_company
  Map<String, dynamic>? _aadhaarResult;

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

  // ── Aadhaar Verhoeff checksum (mirrors backend) ───────────────────────────
  static const List<List<int>> _vD = [
    [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],
    [4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],
    [8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0],
  ];
  static const List<List<int>> _vP = [
    [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],
    [9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
  ];

  bool _verhoeff(String num) {
    int c = 0;
    final digits = num.split('').map(int.parse).toList().reversed.toList();
    for (int i = 0; i < digits.length; i++) {
      c = _vD[c][_vP[i % 8][digits[i]]];
    }
    return c == 0;
  }

  String? _localAadhaarError(String clean) {
    if (!RegExp(r'^\d{12}$').hasMatch(clean)) return 'Aadhaar must be exactly 12 digits';
    if (RegExp(r'^[01]').hasMatch(clean)) return 'Aadhaar cannot start with 0 or 1';
    if (!_verhoeff(clean)) return 'Invalid Aadhaar number (checksum failed)';
    return null;
  }

  Future<void> _verifyAadhaar() async {
    FocusScope.of(context).unfocus();
    final clean = _aadhaarCtrl.text.replaceAll(RegExp(r'\s'), '');
    final localErr = _localAadhaarError(clean);
    if (localErr != null) {
      setState(() {
        _aadhaarProceedable = false;
        _aadhaarResult = {'status': 'error', 'message': localErr};
      });
      return;
    }

    setState(() { _aadhaarChecking = true; _aadhaarResult = null; });
    try {
      final res = await _api.dio.post('/api/mobile/employees/verify-aadhaar', data: {'aadhaar': clean});
      final data = Map<String, dynamic>.from(res.data as Map);
      final status = data['status'] as String?;

      if (status == 'other_company' && data['employeeInfo'] != null) {
        final info = Map<String, dynamic>.from(data['employeeInfo'] as Map);
        final first = (info['firstName'] ?? '').toString().trim();
        final last = (info['lastName'] ?? '').toString().trim();
        final full = [first, last].where((s) => s.isNotEmpty).join(' ');
        if (full.isNotEmpty) _fullNameCtrl.text = full;
        if (info['gender'] != null && ['male', 'female', 'other'].contains(info['gender'])) {
          _gender = info['gender'];
        }
        if ((info['mobileNumber'] ?? '').toString().isNotEmpty) _mobileCtrl.text = info['mobileNumber'].toString();
        if ((info['officialEmail'] ?? '').toString().isNotEmpty) _emailCtrl.text = info['officialEmail'].toString();
        if ((info['pan'] ?? '').toString().isNotEmpty) _panCtrl.text = info['pan'].toString();
        if ((info['bankAccount'] ?? '').toString().isNotEmpty) _bankAccCtrl.text = info['bankAccount'].toString();
        if ((info['ifsc'] ?? '').toString().isNotEmpty) _ifscCtrl.text = info['ifsc'].toString();
        final dob = (info['dateOfBirth'] ?? '').toString();
        if (dob.isNotEmpty) {
          final parsed = DateTime.tryParse(dob);
          if (parsed != null) _dateOfBirth = parsed;
        }
      }

      setState(() {
        _aadhaarResult = data;
        _aadhaarProceedable = status == 'not_found' || status == 'other_company';
        _aadhaarChecking = false;
      });
    } catch (e) {
      String msg = 'Verification failed. Please try again.';
      if (e is DioException) msg = e.response?.data?['error']?.toString() ?? msg;
      setState(() {
        _aadhaarResult = {'status': 'error', 'message': msg};
        _aadhaarProceedable = false;
        _aadhaarChecking = false;
      });
    }
  }

  // ── Step navigation ───────────────────────────────────────────────────────
  bool _validateCurrentStep() {
    switch (_currentStep) {
      case 0:
        if (!_aadhaarProceedable) {
          _toast('Please verify a valid Aadhaar number to continue.', AppTheme.warningColor);
          return false;
        }
        return true;
      case 1:
        if (_empCodeCtrl.text.trim().isEmpty) { _toast('Employee Code is required.', AppTheme.warningColor); return false; }
        if (_fullNameCtrl.text.trim().isEmpty) { _toast('Full Name is required.', AppTheme.warningColor); return false; }
        return true;
      default:
        return true;
    }
  }

  void _nextStep() {
    if (!_validateCurrentStep()) return;
    if (_currentStep < _totalSteps - 1) {
      setState(() => _currentStep++);
    } else {
      _saveEmployee();
    }
  }

  void _prevStep() {
    if (_currentStep > 0) setState(() => _currentStep--);
  }

  void _toast(String msg, Color color) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: color));
  }

  Future<void> _saveEmployee() async {
    if (!_validateCurrentStep()) return;
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
        'aadhaar': _aadhaarCtrl.text.replaceAll(RegExp(r'\s'), '').isNotEmpty ? _aadhaarCtrl.text.replaceAll(RegExp(r'\s'), '') : null,
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
              child: Column(
                children: [
                  _buildStepHeader(),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                      child: _buildStepContent(),
                    ),
                  ),
                  _buildBottomNav(),
                ],
              ),
            ),
    );
  }

  // ── Step header with progress ─────────────────────────────────────────────
  Widget _buildStepHeader() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 18),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppTheme.primaryColor, AppTheme.primaryDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(24),
          bottomRight: Radius.circular(24),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(20)),
                child: Text('Step ${_currentStep + 1} of $_totalSteps',
                    style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
              ),
              const Spacer(),
              if (_fullNameCtrl.text.trim().isNotEmpty)
                Row(
                  children: [
                    CircleAvatar(
                      radius: 14,
                      backgroundColor: Colors.white.withOpacity(0.22),
                      child: Text(_initials, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white)),
                    ),
                    const SizedBox(width: 8),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 140),
                      child: Text(_fullNameCtrl.text.trim(),
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(_stepTitles[_currentStep],
              style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: (_currentStep + 1) / _totalSteps,
              minHeight: 6,
              backgroundColor: Colors.white.withOpacity(0.25),
              valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
            ),
          ),
        ],
      ),
    );
  }

  // ── Step content router ───────────────────────────────────────────────────
  Widget _buildStepContent() {
    switch (_currentStep) {
      case 0: return _stepAadhaar();
      case 1: return _stepBasic();
      case 2: return _stepOrganization();
      case 3: return _stepKyc();
      case 4: return _stepSalaryBank();
      case 5: return _stepStatutory();
      default: return const SizedBox.shrink();
    }
  }

  // ── Step 0: Aadhaar verification ──────────────────────────────────────────
  Widget _stepAadhaar() {
    final status = _aadhaarResult?['status'] as String?;
    return _card('Verify Aadhaar', Icons.verified_user_outlined, const Color(0xFF9C27B0), [
      Text(
        'Enter the employee\'s 12-digit Aadhaar number and verify it before registering. This prevents duplicate records and pre-fills details if the person already exists in another company.',
        style: TextStyle(fontSize: 13, color: Colors.grey.shade600, height: 1.4),
      ),
      const SizedBox(height: 16),
      TextFormField(
        controller: _aadhaarCtrl,
        keyboardType: TextInputType.number,
        maxLength: 12,
        enabled: !_aadhaarChecking,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(12)],
        onChanged: (_) {
          if (_aadhaarProceedable || _aadhaarResult != null) {
            setState(() { _aadhaarProceedable = false; _aadhaarResult = null; });
          }
        },
        decoration: InputDecoration(
          labelText: 'Aadhaar Number',
          hintText: '1234 5678 9012',
          prefixIcon: const Icon(Icons.credit_card_outlined, size: 20, color: AppTheme.primaryColor),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primaryColor, width: 1.5)),
          filled: true,
          fillColor: Colors.grey.shade50,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          counterText: '',
        ),
      ),
      const SizedBox(height: 12),
      SizedBox(
        width: double.infinity,
        height: 48,
        child: ElevatedButton.icon(
          onPressed: _aadhaarChecking ? null : _verifyAadhaar,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF9C27B0),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            elevation: 1,
          ),
          icon: _aadhaarChecking
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.search, size: 20),
          label: Text(_aadhaarChecking ? 'Verifying…' : 'Verify Aadhaar',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        ),
      ),
      if (_aadhaarResult != null) ...[
        const SizedBox(height: 16),
        _aadhaarResultCard(status, _aadhaarResult?['message']?.toString() ?? ''),
      ],
    ]);
  }

  Widget _aadhaarResultCard(String? status, String message) {
    late Color color;
    late IconData icon;
    switch (status) {
      case 'not_found':
        color = AppTheme.accentColor; icon = Icons.check_circle_outline; break;
      case 'other_company':
        color = AppTheme.primaryColor; icon = Icons.info_outline; break;
      case 'exited_same_company':
        color = AppTheme.warningColor; icon = Icons.history; break;
      case 'active_same_company':
        color = AppTheme.errorColor; icon = Icons.block; break;
      default:
        color = AppTheme.errorColor; icon = Icons.error_outline;
    }
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _aadhaarProceedable ? 'Verified — you can continue' : 'Cannot continue',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: color),
                ),
                const SizedBox(height: 4),
                Text(message, style: TextStyle(fontSize: 13, color: Colors.grey.shade700, height: 1.35)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Step 1: Basic ─────────────────────────────────────────────────────────
  Widget _stepBasic() {
    return _card('Basic Information', Icons.person_outline, const Color(0xFF1A56DB), [
      _field(_empCodeCtrl, 'Employee Code', Icons.badge_outlined, required: true),
      _field(_fullNameCtrl, 'Full Name', Icons.account_circle_outlined, required: true, onChanged: (_) => setState(() {})),
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
    ]);
  }

  // ── Step 2: Organization ──────────────────────────────────────────────────
  Widget _stepOrganization() {
    return _card('Organization Details', Icons.business_outlined, const Color(0xFF0694A2), [
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
    ]);
  }

  // ── Step 3: KYC ───────────────────────────────────────────────────────────
  Widget _stepKyc() {
    return _card('KYC / Documents', Icons.folder_open_outlined, const Color(0xFF9C27B0), [
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.accentColor.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppTheme.accentColor.withOpacity(0.25)),
        ),
        child: Row(
          children: [
            const Icon(Icons.verified, color: AppTheme.accentColor, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text('Aadhaar verified: ${_aadhaarCtrl.text.replaceAll(RegExp(r'\s'), '')}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
            ),
          ],
        ),
      ),
      _field(_panCtrl, 'PAN Number', Icons.article_outlined, maxLength: 10),
      _field(_addressCtrl, 'Address', Icons.home_outlined, maxLines: 2),
    ]);
  }

  // ── Step 4: Salary & Bank ─────────────────────────────────────────────────
  Widget _stepSalaryBank() {
    return _card('Salary & Bank Details', Icons.account_balance_outlined, const Color(0xFF009688), [
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
    ]);
  }

  // ── Step 5: Statutory + review ────────────────────────────────────────────
  Widget _stepStatutory() {
    return Column(
      children: [
        _card('Statutory Compliance', Icons.gavel_outlined, const Color(0xFFE91E63), [
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
        _buildReviewCard(),
      ],
    );
  }

  Widget _buildReviewCard() {
    final fullName = _fullNameCtrl.text.trim().isEmpty ? '—' : _fullNameCtrl.text.trim();
    return _card('Review', Icons.fact_check_outlined, const Color(0xFF455A64), [
      _reviewRow('Name', fullName),
      _reviewRow('Employee Code', _empCodeCtrl.text.trim().isEmpty ? '—' : _empCodeCtrl.text.trim()),
      _reviewRow('Aadhaar', _aadhaarCtrl.text.replaceAll(RegExp(r'\s'), '')),
      _reviewRow('Gender', _gender),
      _reviewRow('Date of Joining', _fmt(_dateOfJoining)),
      _reviewRow('Employment Type', _employmentType),
      if (_department != null) _reviewRow('Department', _department!),
      if (_designation != null) _reviewRow('Designation', _designation!),
      if (_grossSalaryCtrl.text.trim().isNotEmpty) _reviewRow('Gross Salary', '₹${_grossSalaryCtrl.text.trim()}'),
    ]);
  }

  Widget _reviewRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 130, child: Text(label, style: TextStyle(fontSize: 13, color: Colors.grey.shade600))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary))),
        ],
      ),
    );
  }

  // ── Bottom navigation ─────────────────────────────────────────────────────
  Widget _buildBottomNav() {
    final isLast = _currentStep == _totalSteps - 1;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            if (_currentStep > 0)
              Expanded(
                child: SizedBox(
                  height: 50,
                  child: OutlinedButton.icon(
                    onPressed: _isSaving ? null : _prevStep,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.primaryColor,
                      side: const BorderSide(color: AppTheme.primaryColor),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.arrow_back, size: 18),
                    label: const Text('Back', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                  ),
                ),
              ),
            if (_currentStep > 0) const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: SizedBox(
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: _isSaving ? null : _nextStep,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 2,
                  ),
                  icon: _isSaving
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Icon(isLast ? Icons.person_add_rounded : Icons.arrow_forward, size: 18),
                  label: Text(
                    _isSaving ? 'Registering…' : (isLast ? 'Register Employee' : 'Continue'),
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Card wrapper ──────────────────────────────────────────────────────────
  Widget _card(String title, IconData icon, Color color, List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: color.withOpacity(0.07),
              borderRadius: const BorderRadius.only(topLeft: Radius.circular(16), topRight: Radius.circular(16)),
              border: Border(bottom: BorderSide(color: color.withOpacity(0.12))),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
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
        color: value ? AppTheme.primaryColor.withOpacity(0.04) : Colors.grey.shade50,
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
