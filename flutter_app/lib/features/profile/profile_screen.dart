import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import '../../core/api_client.dart';
import '../../core/auth_provider.dart';
import '../../core/theme.dart';
import 'add_experience_screen.dart';

class ProfileScreen extends StatefulWidget {
  final bool showAppBar;
  const ProfileScreen({super.key, this.showAppBar = false});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final ApiClient _api = ApiClient();
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _employee;
  List<dynamic> _experiences = [];
  bool _isLoading = true;
  bool _isSaving = false;

  // Personal
  final _fullNameCtrl     = TextEditingController();
  final _aadhaarCtrl      = TextEditingController();
  final _dobCtrl          = TextEditingController();
  final _mobileCtrl       = TextEditingController();
  final _emailCtrl        = TextEditingController();
  final _fatherCtrl       = TextEditingController();
  // Address
  final _addressCtrl      = TextEditingController();
  final _addressPinCtrl   = TextEditingController();
  // Professional
  final _currentSalCtrl   = TextEditingController();
  final _expectedSalCtrl  = TextEditingController();
  final _skillsCtrl       = TextEditingController();
  // KYC / Bank
  final _panCtrl          = TextEditingController();
  final _bankAccCtrl      = TextEditingController();
  final _ifscCtrl         = TextEditingController();
  final _bankNameCtrl     = TextEditingController();

  String _gender          = '';
  String _addressState    = '';
  String _addressDistrict = '';
  DateTime? _selectedDob;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    // Capture context-dependent objects before any await
    final auth = Provider.of<AuthProvider>(context, listen: false);
    setState(() => _isLoading = true);
    try {
      final profileRes = await _api.dio.get('/api/mobile/profile');
      final empRes     = await _api.dio.get('/api/mobile/employee');
      setState(() {
        _profile  = profileRes.data;
        _employee = empRes.data;

        if (_profile != null) {
          final fn = (_profile!['firstName'] ?? '').trim();
          final ln = (_profile!['lastName']  ?? '').trim();
          _fullNameCtrl.text    = [fn, ln].where((s) => s.isNotEmpty).join(' ');
          _aadhaarCtrl.text     = _profile!['aadhaar']         ?? '';
          _dobCtrl.text         = _profile!['dateOfBirth']      ?? '';
          _gender               = _profile!['gender']            ?? '';
          _mobileCtrl.text      = _profile!['mobileNumber']     ?? '';
          _emailCtrl.text       = _profile!['personalEmail']    ?? '';
          _fatherCtrl.text      = _profile!['fatherName']       ?? '';
          _addressCtrl.text     = _profile!['address']          ?? '';
          _addressState         = _profile!['addressState']      ?? '';
          _addressDistrict      = _profile!['addressDistrict']   ?? '';
          _addressPinCtrl.text  = _profile!['addressPincode']   ?? '';
          _currentSalCtrl.text  = _profile!['currentSalary']    ?? '';
          _expectedSalCtrl.text = _profile!['expectedSalary']   ?? '';
          _skillsCtrl.text      = _profile!['skills']           ?? '';
          _panCtrl.text         = _profile!['pan']              ?? '';
          _bankAccCtrl.text     = _profile!['bankAccount']      ?? '';
          _ifscCtrl.text        = _profile!['ifsc']             ?? '';
          _bankNameCtrl.text    = _profile!['bankName']         ?? '';
          _experiences          = _profile!['experiences']      ?? [];
          if (_dobCtrl.text.isNotEmpty) {
            try { _selectedDob = DateTime.parse(_dobCtrl.text); } catch (_) {}
          }
        } else {
          final fn = (auth.user?.firstName ?? '').trim();
          final ln = (auth.user?.lastName  ?? '').trim();
          _fullNameCtrl.text = [fn, ln].where((s) => s.isNotEmpty).join(' ');
          _emailCtrl.text    = auth.user?.email ?? '';
        }
        if (_employee != null) {
          _experiences = _employee!['experiences'] ?? _experiences;
        }
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _saveProfile() async {
    if (_fullNameCtrl.text.trim().isEmpty) {
      _snack('Full name is required', error: true); return;
    }
    final nameParts = _fullNameCtrl.text.trim().split(RegExp(r'\s+'));
    final firstName = nameParts.first;
    final lastName  = nameParts.length > 1 ? nameParts.sublist(1).join(' ') : '';
    setState(() => _isSaving = true);
    try {
      final res = await _api.dio.put('/api/mobile/profile', data: {
        'firstName': firstName,
        'lastName': lastName,
        'aadhaar': _aadhaarCtrl.text,
        'dateOfBirth': _dobCtrl.text,
        'gender': _gender,
        'mobileNumber': _mobileCtrl.text,
        'personalEmail': _emailCtrl.text,
        'fatherName': _fatherCtrl.text,
        'address': _addressCtrl.text,
        'addressState': _addressState,
        'addressDistrict': _addressDistrict,
        'addressPincode': _addressPinCtrl.text,
        'pan': _panCtrl.text,
        'bankAccount': _bankAccCtrl.text,
        'ifsc': _ifscCtrl.text,
        'bankName': _bankNameCtrl.text,
        'currentSalary': _currentSalCtrl.text,
        'expectedSalary': _expectedSalCtrl.text,
        'skills': _skillsCtrl.text,
      });
      if (mounted) {
        final isPending = res.data is Map && res.data['pending'] == true;
        if (isPending) {
          _snack('Profile update submitted for Admin approval.');
        } else {
          _snack('Profile saved successfully!');
          await Provider.of<AuthProvider>(context, listen: false).refreshUser();
        }
      }
    } catch (e) {
      String msg = 'Failed to save';
      if (e is DioException) msg = e.response?.data?['error'] ?? msg;
      if (mounted) _snack(msg, error: true);
    }
    setState(() => _isSaving = false);
  }

  void _snack(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? AppTheme.errorColor : AppTheme.accentColor,
    ));
  }

  Future<void> _openAddExperience() async {
    final result = await Navigator.push(context, MaterialPageRoute(builder: (_) => AddExperienceScreen(isEmployee: _employee != null)));
    if (result == true) _loadProfile();
  }

  Future<void> _pickDob() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _selectedDob ?? DateTime(1990),
      firstDate: DateTime(1950),
      lastDate: DateTime.now(),
    );
    if (date != null) {
      setState(() {
        _selectedDob  = date;
        _dobCtrl.text = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
      });
    }
  }

  String get _initials {
    final n = _fullNameCtrl.text.trim().split(' ');
    if (n.isEmpty || n.first.isEmpty) return '?';
    if (n.length == 1) return n.first[0].toUpperCase();
    return (n.first[0] + n.last[0]).toUpperCase();
  }

  @override
  void dispose() {
    _fullNameCtrl.dispose();    _aadhaarCtrl.dispose();    _dobCtrl.dispose();
    _mobileCtrl.dispose();      _emailCtrl.dispose();      _fatherCtrl.dispose();
    _addressCtrl.dispose();     _addressPinCtrl.dispose();
    _currentSalCtrl.dispose();  _expectedSalCtrl.dispose(); _skillsCtrl.dispose();
    _panCtrl.dispose();         _bankAccCtrl.dispose();
    _ifscCtrl.dispose();        _bankNameCtrl.dispose();
    super.dispose();
  }

  // ─── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: widget.showAppBar
          ? AppBar(
              title: const Text('My Profile'),
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: Colors.white,
              titleTextStyle: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
              elevation: 0,
            )
          : null,
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              child: Column(
                children: [
                  _buildProfileHeader(),
                  const SizedBox(height: 16),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Column(
                      children: [
                        // Read-only employment card (for linked employees)
                        if (_employee != null) _buildEmployeeInfoCard(),

                        // Personal Information
                        _section('Personal Information', Icons.person_outline, const Color(0xFF1A56DB), [
                          _field(_fullNameCtrl, 'Full Name *', Icons.account_circle_outlined, required: true, onChanged: (_) => setState(() {})),
                          _genderDropdown(),
                          _field(_fatherCtrl, "Father's / Husband's Name", Icons.family_restroom_outlined),
                          _dobTile(),
                          _row([
                            _field(_mobileCtrl, 'Mobile Number', Icons.phone_outlined, keyboardType: TextInputType.phone, maxLength: 10),
                            _field(_emailCtrl, 'Personal Email', Icons.email_outlined, keyboardType: TextInputType.emailAddress),
                          ]),
                        ]),

                        // Address
                        _section('Address Details', Icons.location_on_outlined, const Color(0xFFE3770C), [
                          _field(_addressCtrl, 'Street / House No.', Icons.home_outlined, maxLines: 2),
                          _row([
                            _stateDropdown(),
                            _districtField(),
                          ]),
                          _field(_addressPinCtrl, 'Pincode', Icons.pin_drop_outlined,
                              keyboardType: TextInputType.number, maxLength: 6),
                        ]),

                        // Professional Details
                        _section('Professional Details', Icons.work_outline, const Color(0xFF0694A2), [
                          _row([
                            _field(_currentSalCtrl, 'Current / Last Salary (Annual)', Icons.currency_rupee_outlined,
                                keyboardType: TextInputType.number, hint: 'e.g. 450000'),
                            _field(_expectedSalCtrl, 'Expected Salary (Annual)', Icons.trending_up_outlined,
                                keyboardType: TextInputType.number, hint: 'e.g. 600000'),
                          ]),
                          _field(_skillsCtrl, 'Key Skills', Icons.star_outline,
                              maxLines: 3, hint: 'e.g. HR Management, Payroll, MS Office...'),
                        ]),

                        // Work Experience
                        _buildExperienceCard(),

                        // KYC
                        _section('KYC Documents', Icons.folder_open_outlined, const Color(0xFF9C27B0), [
                          _field(_aadhaarCtrl, 'Aadhaar Number', Icons.credit_card_outlined,
                              keyboardType: TextInputType.number, maxLength: 12,
                              enabled: _profile == null || (_profile!['aadhaar'] ?? '').isEmpty),
                          _field(_panCtrl, 'PAN Number', Icons.article_outlined, maxLength: 10),
                        ]),

                        // Bank Details
                        _section('Bank Details', Icons.account_balance_outlined, const Color(0xFF059669), [
                          _field(_bankAccCtrl, 'Bank Account Number', Icons.account_balance_wallet_outlined,
                              keyboardType: TextInputType.number),
                          _row([
                            _field(_ifscCtrl, 'IFSC Code', Icons.numbers_outlined, maxLength: 11),
                            _field(_bankNameCtrl, 'Bank Name', Icons.business_outlined),
                          ]),
                        ]),

                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: ElevatedButton.icon(
                            onPressed: _isSaving ? null : _saveProfile,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.primaryColor,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              elevation: 2,
                            ),
                            icon: _isSaving
                                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.save_rounded),
                            label: Text(_isSaving ? 'Saving…' : 'Save Profile',
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
    );
  }

  // ── Profile header ────────────────────────────────────────────────────────
  Widget _buildProfileHeader() {
    final auth  = Provider.of<AuthProvider>(context, listen: false);
    final role  = auth.user?.role ?? '';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 28),
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [AppTheme.primaryColor, AppTheme.primaryDark], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.only(bottomLeft: Radius.circular(28), bottomRight: Radius.circular(28)),
      ),
      child: Column(children: [
        Stack(alignment: Alignment.bottomRight, children: [
          CircleAvatar(
            radius: 42,
            backgroundColor: Colors.white.withValues(alpha: 0.2),
            child: Text(_initials, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold, color: Colors.white)),
          ),
          Container(
            padding: const EdgeInsets.all(6),
            decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
            child: const Icon(Icons.edit, size: 14, color: AppTheme.primaryColor),
          ),
        ]),
        const SizedBox(height: 12),
        Text(
          _fullNameCtrl.text.trim().isEmpty ? 'My Profile' : _fullNameCtrl.text.trim(),
          style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
        ),
        if (_employee != null) ...[
          const SizedBox(height: 4),
          Text('${_employee!['designation'] ?? ''} • ${_employee!['department'] ?? ''}',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
        ],
        if (_currentSalCtrl.text.isNotEmpty || _expectedSalCtrl.text.isNotEmpty) ...[
          const SizedBox(height: 6),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            if (_currentSalCtrl.text.isNotEmpty)
              _infoBadge(Icons.currency_rupee, 'Current: ${_currentSalCtrl.text}'),
            if (_currentSalCtrl.text.isNotEmpty && _expectedSalCtrl.text.isNotEmpty)
              const SizedBox(width: 8),
            if (_expectedSalCtrl.text.isNotEmpty)
              _infoBadge(Icons.trending_up, 'Expected: ${_expectedSalCtrl.text}'),
          ]),
        ],
        const SizedBox(height: 8),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          if (_employee?['employeeCode'] != null) _infoBadge(Icons.badge_outlined, _employee!['employeeCode']),
          if (role.isNotEmpty) ...[
            const SizedBox(width: 8),
            _infoBadge(Icons.shield_outlined, _roleLabel(role)),
          ],
        ]),
      ]),
    );
  }

  Widget _infoBadge(IconData icon, String text) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: Colors.white),
      const SizedBox(width: 5),
      Text(text, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w500)),
    ]),
  );

  String _roleLabel(String role) {
    switch (role) {
      case 'company_admin': return 'Admin';
      case 'hr_admin':      return 'HR Admin';
      case 'manager':       return 'Manager';
      case 'employee':      return 'Employee';
      default:              return role;
    }
  }

  // ── Employee info card (read-only) ────────────────────────────────────────
  Widget _buildEmployeeInfoCard() {
    final emp = _employee!;
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _sectionHeader('Employment Details', Icons.business_center_outlined, const Color(0xFF0694A2)),
        Padding(
          padding: const EdgeInsets.all(14),
          child: Column(children: [
            Row(children: [
              Expanded(child: _infoTile(Icons.badge_outlined, 'Employee Code', emp['employeeCode'] ?? '—')),
              Expanded(child: _infoTile(Icons.work_outline, 'Type', emp['employmentType'] ?? '—')),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _infoTile(Icons.corporate_fare, 'Department', emp['department'] ?? '—')),
              Expanded(child: _infoTile(Icons.work_history_outlined, 'Designation', emp['designation'] ?? '—')),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _infoTile(Icons.location_on_outlined, 'Location', emp['location'] ?? '—')),
              Expanded(child: _infoTile(Icons.calendar_today_outlined, 'Joined', emp['dateOfJoining'] ?? '—')),
            ]),
          ]),
        ),
      ]),
    );
  }

  Widget _infoTile(IconData icon, String label, String value) => Container(
    padding: const EdgeInsets.all(10),
    margin: const EdgeInsets.symmetric(horizontal: 3),
    decoration: BoxDecoration(color: const Color(0xFFF5F7FA), borderRadius: BorderRadius.circular(10)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(icon, size: 13, color: AppTheme.primaryColor),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 10, color: Colors.grey.shade600)),
      ]),
      const SizedBox(height: 4),
      Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary), maxLines: 1, overflow: TextOverflow.ellipsis),
    ]),
  );

  // ── Experience card ───────────────────────────────────────────────────────
  Widget _buildExperienceCard() {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: _sectionHeader('Work Experience', Icons.history_edu_outlined, const Color(0xFFE91E63))),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: TextButton.icon(
              onPressed: _openAddExperience,
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Add', style: TextStyle(fontSize: 13)),
              style: TextButton.styleFrom(foregroundColor: const Color(0xFFE91E63)),
            ),
          ),
        ]),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          child: _experiences.isEmpty
              ? Center(child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Column(children: [
                    Icon(Icons.work_off_outlined, size: 36, color: Colors.grey.shade300),
                    const SizedBox(height: 8),
                    Text('No experience added yet', style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _openAddExperience,
                      icon: const Icon(Icons.add, size: 16),
                      label: const Text('Add Experience'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFE91E63),
                        side: const BorderSide(color: Color(0xFFE91E63)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ]),
                ))
              : Column(children: _experiences.map(_experienceItem).toList()),
        ),
      ]),
    );
  }

  Widget _experienceItem(dynamic rawExp) {
    final exp = rawExp as Map<String, dynamic>;
    final hasResp = (exp['jobResponsibilities'] ?? '').toString().trim().isNotEmpty;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8F9FF),
        border: Border.all(color: Colors.grey.shade200),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Header row
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 4, 0),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(color: AppTheme.primaryColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
              child: const Icon(Icons.business, color: AppTheme.primaryColor, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(exp['organizationName'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              Text(exp['postHeld'] ?? '', style: TextStyle(color: Colors.grey.shade700, fontSize: 12, fontWeight: FontWeight.w500)),
              const SizedBox(height: 2),
              Text('${exp['dateOfJoining'] ?? ''} - ${exp['dateOfLeaving'] ?? 'Present'}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
            ])),
            IconButton(
              icon: const Icon(Icons.delete_outline, size: 18, color: AppTheme.errorColor),
              onPressed: () async {
                try {
                  final id = exp['id'] ?? '';
                  if (id.isNotEmpty) {
                    await _api.dio.delete('/api/mobile/previous-experiences/$id');
                    _loadProfile();
                  }
                } catch (_) {}
              },
            ),
          ]),
        ),
        // Salary + Reason chips
        if ((exp['ctc'] ?? '').toString().isNotEmpty || (exp['reasonOfLeaving'] ?? '').toString().isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Wrap(spacing: 8, children: [
              if ((exp['ctc'] ?? '').toString().isNotEmpty)
                _chip(Icons.currency_rupee, 'CTC: ${exp['ctc']}', AppTheme.accentColor),
              if ((exp['reasonOfLeaving'] ?? '').toString().isNotEmpty)
                _chip(Icons.logout_outlined, exp['reasonOfLeaving'], Colors.orange.shade700),
            ]),
          ),
        // Job Responsibilities
        if (hasResp)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(Icons.checklist_outlined, size: 13, color: Colors.grey.shade600),
                const SizedBox(width: 4),
                Text('Responsibilities', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey.shade700)),
              ]),
              const SizedBox(height: 4),
              Text(exp['jobResponsibilities'], style: TextStyle(fontSize: 12, color: Colors.grey.shade700, height: 1.5)),
            ]),
          ),
        const SizedBox(height: 12),
      ]),
    );
  }

  Widget _chip(IconData icon, String text, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(20)),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 11, color: color),
      const SizedBox(width: 4),
      Text(text, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w500)),
    ]),
  );

  // ── Section helpers ───────────────────────────────────────────────────────
  Widget _section(String title, IconData icon, Color color, List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _sectionHeader(title, icon, color),
        Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: _withSpacing(children)),
        ),
      ]),
    );
  }

  BoxDecoration _cardDeco() => BoxDecoration(
    color: Colors.white,
    borderRadius: BorderRadius.circular(16),
    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
  );

  Widget _sectionHeader(String title, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        borderRadius: const BorderRadius.only(topLeft: Radius.circular(16), topRight: Radius.circular(16)),
        border: Border(bottom: BorderSide(color: color.withValues(alpha: 0.12))),
      ),
      child: Row(children: [
        Container(padding: const EdgeInsets.all(6), decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)), child: Icon(icon, color: color, size: 18)),
        const SizedBox(width: 10),
        Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: color)),
      ]),
    );
  }

  List<Widget> _withSpacing(List<Widget> widgets, {double spacing = 12}) {
    final result = <Widget>[];
    for (int i = 0; i < widgets.length; i++) {
      result.add(widgets[i]);
      if (i < widgets.length - 1) result.add(SizedBox(height: spacing));
    }
    return result;
  }

  Widget _row(List<Widget> children) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: children.expand((w) => [Expanded(child: w), const SizedBox(width: 10)]).toList()..removeLast(),
  );

  Widget _field(TextEditingController ctrl, String label, IconData icon, {
    TextInputType keyboardType = TextInputType.text,
    int maxLength = 0, int maxLines = 1, bool required = false,
    bool enabled = true, String? hint, void Function(String)? onChanged,
  }) {
    return TextFormField(
      controller: ctrl,
      keyboardType: keyboardType,
      maxLength: maxLength > 0 ? maxLength : null,
      maxLines: maxLines,
      enabled: enabled,
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon, size: 20, color: AppTheme.primaryColor),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primaryColor, width: 1.5)),
        disabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
        filled: true,
        fillColor: enabled ? Colors.white : Colors.grey.shade50,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        counterText: '',
      ),
    );
  }

  Widget _genderDropdown() {
    return DropdownButtonFormField<String>(
      value: _gender.isEmpty ? null : _gender,
      decoration: InputDecoration(
        labelText: 'Gender',
        prefixIcon: const Icon(Icons.wc_outlined, size: 20, color: AppTheme.primaryColor),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primaryColor, width: 1.5)),
        filled: true, fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      ),
      items: const [
        DropdownMenuItem(value: 'male',   child: Text('Male')),
        DropdownMenuItem(value: 'female', child: Text('Female')),
        DropdownMenuItem(value: 'other',  child: Text('Other')),
      ],
      onChanged: (v) => setState(() => _gender = v ?? ''),
    );
  }

  Widget _stateDropdown() {
    const states = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh'];
    return DropdownButtonFormField<String>(
      value: _addressState.isEmpty ? null : (states.contains(_addressState) ? _addressState : null),
      isExpanded: true,
      decoration: InputDecoration(
        labelText: 'State',
        prefixIcon: const Icon(Icons.map_outlined, size: 20, color: Color(0xFFE3770C)),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE3770C), width: 1.5)),
        filled: true, fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      ),
      items: states.map((s) => DropdownMenuItem(value: s, child: Text(s, overflow: TextOverflow.ellipsis))).toList(),
      onChanged: (v) => setState(() { _addressState = v ?? ''; _addressDistrict = ''; }),
    );
  }

  Widget _districtField() => TextFormField(
    initialValue: _addressDistrict,
    decoration: InputDecoration(
      labelText: 'District',
      prefixIcon: const Icon(Icons.location_city_outlined, size: 20, color: Color(0xFFE3770C)),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE3770C), width: 1.5)),
      filled: true, fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
    ),
    onChanged: (v) => _addressDistrict = v,
  );

  Widget _dobTile() => GestureDetector(
    onTap: _pickDob,
    child: AbsorbPointer(
      child: TextFormField(
        controller: _dobCtrl,
        decoration: InputDecoration(
          labelText: 'Date of Birth',
          hintText: 'Tap to select date',
          prefixIcon: const Icon(Icons.cake_outlined, size: 20, color: AppTheme.primaryColor),
          suffixIcon: const Icon(Icons.calendar_today, size: 16),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
          filled: true, fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        ),
      ),
    ),
  );
}
