import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api_client.dart';
import '../../core/auth_provider.dart';
import '../../core/theme.dart';
import '../employees/employee_registration_screen.dart';
import '../attendance/face_registration_screen.dart';
import '../quick_attendance/quick_attendance_screen.dart';
import '../attendance/monthly_attendance_screen.dart';
import '../leave_approval/leave_approval_screen.dart';
import '../salary/salary_structure_form_screen.dart';
import '../jobs/job_posting_screen.dart';
import '../geofence/geo_fence_screen.dart';

class SuperAdminScreen extends StatefulWidget {
  const SuperAdminScreen({super.key});

  @override
  State<SuperAdminScreen> createState() => _SuperAdminScreenState();
}

class _SuperAdminScreenState extends State<SuperAdminScreen> {
  final ApiClient _api = ApiClient();
  Map<String, dynamic>? _stats;
  List<dynamic> _companies = [];
  List<dynamic> _recentEmployees = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _api.dio.get('/api/mobile/dashboard').catchError((_) => Response(data: {}, requestOptions: RequestOptions(path: ''))),
        _api.dio.get('/api/mobile/companies').catchError((_) => Response(data: [], requestOptions: RequestOptions(path: ''))),
        _api.dio.get('/api/mobile/employees').catchError((_) => Response(data: [], requestOptions: RequestOptions(path: ''))),
      ]);
      setState(() {
        _stats = results[0].data ?? {};
        _companies = (results[1].data as List?) ?? [];
        final allEmp = (results[2].data as List?) ?? [];
        _recentEmployees = allEmp.take(5).toList();
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);
    final user = auth.user;

    return RefreshIndicator(
      onRefresh: _loadData,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _welcomeCard(user),
            const SizedBox(height: 16),
            _statsRow(),
            const SizedBox(height: 20),
            _sectionTitle('Quick Actions'),
            const SizedBox(height: 12),
            _quickActionsGrid(context),
            const SizedBox(height: 20),
            _sectionTitle('Companies (${_companies.length})'),
            const SizedBox(height: 12),
            _companiesList(),
            const SizedBox(height: 20),
            _sectionTitle('Recent Employees'),
            const SizedBox(height: 12),
            _recentEmployeesList(),
          ],
        ),
      ),
    );
  }

  Widget _welcomeCard(UserData? user) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [AppTheme.primaryColor, AppTheme.primaryDark], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: AppTheme.primaryColor.withValues(alpha: 0.3), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      padding: const EdgeInsets.all(20),
      child: Row(children: [
        CircleAvatar(
          radius: 28,
          backgroundColor: Colors.white.withValues(alpha: 0.2),
          child: Text(
            '${user?.firstName.isNotEmpty == true ? user!.firstName[0] : 'S'}${user?.lastName.isNotEmpty == true ? user!.lastName[0] : 'A'}',
            style: const TextStyle(fontSize: 20, color: Colors.white, fontWeight: FontWeight.bold),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Welcome back,', style: TextStyle(color: Colors.white70, fontSize: 13)),
          Text('${user?.firstName ?? ''} ${user?.lastName ?? ''}', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          Container(
            margin: const EdgeInsets.only(top: 6),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(20)),
            child: const Text('SUPER ADMINISTRATOR', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
          ),
        ])),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
          child: const Icon(Icons.admin_panel_settings, color: Colors.white, size: 28),
        ),
      ]),
    );
  }

  Widget _statsRow() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    final empCount = _recentEmployees.length;
    final compCount = _companies.length;
    final pending = _stats?['pendingLeaves'] ?? 0;
    final jobApps = _stats?['jobApplications'] ?? 0;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.6,
      children: [
        _statCard('Companies', '$compCount', Icons.business, AppTheme.primaryColor),
        _statCard('Employees', '$empCount+', Icons.people, AppTheme.accentColor),
        _statCard('Pending Leaves', '$pending', Icons.event_note, AppTheme.warningColor),
        _statCard('Job Applications', '$jobApps', Icons.work_outline, const Color(0xFF9C27B0)),
      ],
    );
  }

  Widget _statCard(String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.15)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
        Row(children: [
          Container(padding: const EdgeInsets.all(6), decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)), child: Icon(icon, color: color, size: 18)),
          const Spacer(),
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: color)),
        ]),
        const SizedBox(height: 6),
        Text(title, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
      ]),
    );
  }

  Widget _sectionTitle(String title) => Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary));

  Widget _quickActionsGrid(BuildContext context) {
    final actions = [
      _ActionItem(Icons.person_add_alt_1, 'Register\nEmployee', const Color(0xFF3F51B5), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const EmployeeRegistrationScreen()))),
      _ActionItem(Icons.face_retouching_natural, 'Face\nRegistration', const Color(0xFF6366F1), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FaceRegistrationScreen()))),
      _ActionItem(Icons.radar, 'Geo-Fence\nSetup', const Color(0xFF0288D1), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const GeoFenceScreen()))),
      _ActionItem(Icons.approval, 'Leave\nApproval', const Color(0xFF4CAF50), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LeaveApprovalScreen()))),
      _ActionItem(Icons.edit_calendar, 'Quick\nAttendance', const Color(0xFF795548), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const QuickAttendanceScreen()))),
      _ActionItem(Icons.calendar_view_month, 'Monthly\nAttendance', const Color(0xFF607D8B), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MonthlyAttendanceScreen()))),
      _ActionItem(Icons.account_balance_wallet_outlined, 'Salary\nSetup', const Color(0xFF009688), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SalaryStructureFormScreen()))),
      _ActionItem(Icons.post_add, 'Job\nPostings', const Color(0xFFE91E63), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const JobPostingManageScreen()))),
      _ActionItem(Icons.group, 'All\nEmployees', AppTheme.primaryColor, () => Navigator.push(context, MaterialPageRoute(builder: (_) => const _AllEmployeesScreen()))),
    ];
    return GridView.count(
      crossAxisCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 0.85,
      children: actions.map((a) => _actionTile(a)).toList(),
    );
  }

  Widget _actionTile(_ActionItem a) {
    return GestureDetector(
      onTap: a.onTap,
      child: Container(
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))]),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: a.color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)), child: Icon(a.icon, color: a.color, size: 22)),
          const SizedBox(height: 6),
          Text(a.label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600), textAlign: TextAlign.center, maxLines: 2),
        ]),
      ),
    );
  }

  Widget _companiesList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_companies.isEmpty) return _emptyState('No companies found', Icons.business_outlined);
    return Column(children: _companies.take(5).map((c) => _companyCard(c as Map<String, dynamic>)).toList());
  }

  Widget _companyCard(Map<String, dynamic> c) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 6)],
      ),
      child: Row(children: [
        Container(
          width: 44, height: 44,
          decoration: BoxDecoration(color: AppTheme.primaryColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
          child: const Icon(Icons.business, color: AppTheme.primaryColor, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(c['companyName'] ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          if (c['city'] != null || c['state'] != null)
            Text('${c['city'] ?? ''} ${c['state'] != null ? ', ${c['state']}' : ''}', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(color: AppTheme.accentColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
          child: Text(c['status'] ?? 'active', style: TextStyle(fontSize: 11, color: AppTheme.accentColor, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }

  Widget _recentEmployeesList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_recentEmployees.isEmpty) return _emptyState('No employees found', Icons.people_outlined);
    return Column(children: _recentEmployees.map((e) => _employeeCard(e as Map<String, dynamic>)).toList());
  }

  Widget _employeeCard(Map<String, dynamic> e) {
    final name = '${e['firstName'] ?? ''} ${e['lastName'] ?? ''}';
    final dept = e['department'] ?? 'No Department';
    final code = e['employeeCode'] ?? '';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.grey.shade200)),
      child: Row(children: [
        CircleAvatar(
          radius: 20,
          backgroundColor: AppTheme.accentColor.withValues(alpha: 0.15),
          child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.accentColor)),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name.trim(), style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14)),
          Text('$code • $dept', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: Colors.blue.shade50, borderRadius: BorderRadius.circular(6)),
          child: Text(e['status'] ?? 'active', style: TextStyle(fontSize: 11, color: Colors.blue.shade700, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }

  Widget _emptyState(String msg, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
      child: Center(child: Column(children: [
        Icon(icon, color: Colors.grey.shade400, size: 36),
        const SizedBox(height: 8),
        Text(msg, style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
      ])),
    );
  }
}

class _ActionItem {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  _ActionItem(this.icon, this.label, this.color, this.onTap);
}

class _AllEmployeesScreen extends StatefulWidget {
  const _AllEmployeesScreen();
  @override
  State<_AllEmployeesScreen> createState() => _AllEmployeesScreenState();
}

class _AllEmployeesScreenState extends State<_AllEmployeesScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _employees = [];
  List<dynamic> _filtered = [];
  bool _isLoading = true;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.dio.get('/api/mobile/employees');
      final list = (res.data as List?) ?? [];
      setState(() { _employees = list; _filtered = list; _isLoading = false; });
    } catch (_) {
      setState(() => _isLoading = false);
    }
  }

  void _filter(String q) {
    final query = q.toLowerCase();
    setState(() {
      _filtered = _employees.where((e) {
        final name = '${e['firstName']} ${e['lastName']}'.toLowerCase();
        final code = (e['employeeCode'] ?? '').toLowerCase();
        final dept = (e['department'] ?? '').toLowerCase();
        return name.contains(query) || code.contains(query) || dept.contains(query);
      }).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryColor,
        title: const Text('All Employees', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _load)],
      ),
      body: Column(children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: _searchController,
            onChanged: _filter,
            decoration: InputDecoration(
              hintText: 'Search by name, code, department...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searchController.text.isNotEmpty ? IconButton(icon: const Icon(Icons.clear), onPressed: () { _searchController.clear(); _filter(''); }) : null,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
            ),
          ),
        ),
        if (_isLoading)
          const Expanded(child: Center(child: CircularProgressIndicator()))
        else
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: _filtered.length,
              itemBuilder: (_, i) {
                final e = _filtered[i] as Map<String, dynamic>;
                final name = '${e['firstName'] ?? ''} ${e['lastName'] ?? ''}';
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.grey.shade200)),
                  child: Row(children: [
                    CircleAvatar(
                      radius: 22,
                      backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.12),
                      child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(name.trim(), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                      Text('${e['employeeCode'] ?? ''} • ${e['department'] ?? 'No Dept'}', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                      if (e['designation'] != null) Text(e['designation'], style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                    ])),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: e['status'] == 'active' ? AppTheme.accentColor.withValues(alpha: 0.1) : Colors.red.shade50,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        e['status'] ?? 'active',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: e['status'] == 'active' ? AppTheme.accentColor : AppTheme.errorColor),
                      ),
                    ),
                  ]),
                );
              },
            ),
          ),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          color: Colors.white,
          child: Text('Showing ${_filtered.length} of ${_employees.length} employees', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
        ),
      ]),
    );
  }
}
