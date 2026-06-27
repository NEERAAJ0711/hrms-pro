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

class CompanyAdminScreen extends StatefulWidget {
  const CompanyAdminScreen({super.key});

  @override
  State<CompanyAdminScreen> createState() => _CompanyAdminScreenState();
}

class _CompanyAdminScreenState extends State<CompanyAdminScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _employees = [];
  List<dynamic> _pendingLeaves = [];
  Map<String, dynamic>? _company;
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
        _api.dio.get('/api/mobile/employees').catchError((_) => Response(data: [], requestOptions: RequestOptions(path: ''))),
        _api.dio.get('/api/mobile/team-leave-requests').catchError((_) => Response(data: [], requestOptions: RequestOptions(path: ''))),
        _api.dio.get('/api/mobile/companies').catchError((_) => Response(data: [], requestOptions: RequestOptions(path: ''))),
      ]);
      final emps = (results[0].data as List?) ?? [];
      final leaves = (results[1].data as List?) ?? [];
      final companies = (results[2].data as List?) ?? [];
      setState(() {
        _employees = emps;
        _pendingLeaves = leaves.where((l) => (l['status'] ?? '') == 'pending').toList();
        _company = companies.isNotEmpty ? companies.first as Map<String, dynamic> : null;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  int get _activeCount => _employees.where((e) => (e['status'] ?? 'active') == 'active').length;

  int get _departmentCount {
    final depts = _employees
        .map((e) => (e['department'] ?? '').toString().trim())
        .where((d) => d.isNotEmpty)
        .toSet();
    return depts.length;
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
            _headerCard(user),
            const SizedBox(height: 16),
            _sectionTitle('Company Overview'),
            const SizedBox(height: 12),
            _statsGrid(),
            const SizedBox(height: 20),
            _sectionTitle('Quick Actions'),
            const SizedBox(height: 12),
            _quickActionsGrid(context),
            const SizedBox(height: 20),
            _pendingApprovalsHeader(context),
            const SizedBox(height: 12),
            _pendingApprovalsList(),
            const SizedBox(height: 20),
            _sectionTitle('Recent Employees'),
            const SizedBox(height: 12),
            _recentEmployeesList(context),
          ],
        ),
      ),
    );
  }

  Widget _headerCard(UserData? user) {
    final companyName = _company?['companyName'] ?? 'Your Company';
    final now = DateTime.now();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final dateStr = '${now.day} ${months[now.month - 1]} ${now.year}';
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [AppTheme.primaryColor, AppTheme.primaryDark], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: AppTheme.primaryColor.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.apartment, color: Colors.white, size: 26),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(companyName, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold), maxLines: 2, overflow: TextOverflow.ellipsis),
                Container(
                  margin: const EdgeInsets.only(top: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(20)),
                  child: const Text('COMPANY ADMIN', style: TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                ),
              ]),
            ),
          ]),
          const SizedBox(height: 16),
          Divider(color: Colors.white.withOpacity(0.2), height: 1),
          const SizedBox(height: 14),
          Row(children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: Colors.white.withOpacity(0.2),
              child: Text(
                '${user?.firstName.isNotEmpty == true ? user!.firstName[0] : 'A'}${user?.lastName.isNotEmpty == true ? user!.lastName[0] : ''}',
                style: const TextStyle(fontSize: 14, color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Welcome back, ${user?.firstName ?? ''}', style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
                Text(dateStr, style: const TextStyle(color: Colors.white70, fontSize: 12)),
              ]),
            ),
          ]),
        ],
      ),
    );
  }

  Widget _statsGrid() {
    if (_isLoading) return const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()));
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.6,
      children: [
        _statCard('Total Employees', '${_employees.length}', Icons.people, AppTheme.primaryColor),
        _statCard('Active', '$_activeCount', Icons.verified_user, AppTheme.accentColor),
        _statCard('Pending Approvals', '${_pendingLeaves.length}', Icons.pending_actions, AppTheme.warningColor),
        _statCard('Departments', '$_departmentCount', Icons.account_tree, const Color(0xFF9C27B0)),
      ],
    );
  }

  Widget _statCard(String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.15)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
        Row(children: [
          Container(padding: const EdgeInsets.all(6), decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: Icon(icon, color: color, size: 18)),
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
      _ActionItem(Icons.approval, 'Leave\nApproval', const Color(0xFF4CAF50), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LeaveApprovalScreen()))),
      _ActionItem(Icons.edit_calendar, 'Quick\nAttendance', const Color(0xFF795548), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const QuickAttendanceScreen()))),
      _ActionItem(Icons.calendar_view_month, 'Monthly\nAttendance', const Color(0xFF607D8B), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MonthlyAttendanceScreen()))),
      _ActionItem(Icons.account_balance_wallet_outlined, 'Salary\nSetup', const Color(0xFF009688), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SalaryStructureFormScreen()))),
      _ActionItem(Icons.face_retouching_natural, 'Face\nRegistration', const Color(0xFF6366F1), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FaceRegistrationScreen()))),
      _ActionItem(Icons.radar, 'Geo-Fence\nSetup', const Color(0xFF0288D1), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const GeoFenceScreen()))),
      _ActionItem(Icons.post_add, 'Job\nPostings', const Color(0xFFE91E63), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const JobPostingManageScreen()))),
      _ActionItem(Icons.group, 'All\nEmployees', AppTheme.primaryColor, () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CompanyEmployeesScreen()))),
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
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6, offset: const Offset(0, 2))]),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: a.color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)), child: Icon(a.icon, color: a.color, size: 22)),
          const SizedBox(height: 6),
          Text(a.label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600), textAlign: TextAlign.center, maxLines: 2),
        ]),
      ),
    );
  }

  Widget _pendingApprovalsHeader(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _sectionTitle('Pending Approvals'),
        if (_pendingLeaves.isNotEmpty)
          TextButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LeaveApprovalScreen())),
            child: const Text('View all'),
          ),
      ],
    );
  }

  Widget _pendingApprovalsList() {
    if (_isLoading) return const SizedBox.shrink();
    if (_pendingLeaves.isEmpty) return _emptyState('No pending leave approvals', Icons.check_circle_outline);
    return Column(children: _pendingLeaves.take(3).map((l) => _approvalCard(l as Map<String, dynamic>)).toList());
  }

  Widget _approvalCard(Map<String, dynamic> l) {
    final name = l['employeeName'] ?? 'Employee';
    final type = l['leaveTypeName'] ?? 'Leave';
    final from = (l['startDate'] ?? l['fromDate'] ?? '').toString();
    final to = (l['endDate'] ?? l['toDate'] ?? '').toString();
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6)],
      ),
      child: Row(children: [
        Container(
          width: 42, height: 42,
          decoration: BoxDecoration(color: AppTheme.warningColor.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
          child: const Icon(Icons.event_note, color: AppTheme.warningColor, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          Text('$type${from.isNotEmpty ? ' • $from${to.isNotEmpty ? ' → $to' : ''}' : ''}', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary), maxLines: 1, overflow: TextOverflow.ellipsis),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(color: AppTheme.warningColor.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
          child: const Text('Pending', style: TextStyle(fontSize: 11, color: Color(0xFFB45309), fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }

  Widget _recentEmployeesList(BuildContext context) {
    if (_isLoading) return const SizedBox.shrink();
    if (_employees.isEmpty) return _emptyState('No employees found', Icons.people_outline);
    return Column(children: _employees.take(5).map((e) => _employeeCard(e as Map<String, dynamic>)).toList());
  }

  Widget _employeeCard(Map<String, dynamic> e) {
    final name = '${e['firstName'] ?? ''} ${e['lastName'] ?? ''}';
    final dept = e['department'] ?? 'No Department';
    final code = e['employeeCode'] ?? '';
    final active = (e['status'] ?? 'active') == 'active';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.grey.shade200)),
      child: Row(children: [
        CircleAvatar(
          radius: 20,
          backgroundColor: AppTheme.primaryColor.withOpacity(0.12),
          child: Text(name.trim().isNotEmpty ? name.trim()[0].toUpperCase() : '?', style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name.trim(), style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14)),
          Text('$code • $dept', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: active ? AppTheme.accentColor.withOpacity(0.1) : Colors.red.shade50, borderRadius: BorderRadius.circular(6)),
          child: Text(e['status'] ?? 'active', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: active ? AppTheme.accentColor : AppTheme.errorColor)),
        ),
      ]),
    );
  }

  Widget _emptyState(String msg, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: Center(child: Column(children: [
        Icon(icon, color: Colors.grey.shade400, size: 36),
        const SizedBox(height: 8),
        Text(msg, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
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

class CompanyEmployeesScreen extends StatefulWidget {
  const CompanyEmployeesScreen({super.key});
  @override
  State<CompanyEmployeesScreen> createState() => _CompanyEmployeesScreenState();
}

class _CompanyEmployeesScreenState extends State<CompanyEmployeesScreen> {
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
                      backgroundColor: AppTheme.primaryColor.withOpacity(0.12),
                      child: Text(name.trim().isNotEmpty ? name.trim()[0].toUpperCase() : '?', style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(name.trim(), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                      Text('${e['employeeCode'] ?? ''} • ${e['department'] ?? 'No Dept'}', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                      if (e['designation'] != null) Text(e['designation'], style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                    ])),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: e['status'] == 'active' ? AppTheme.accentColor.withOpacity(0.1) : Colors.red.shade50,
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
          child: Text('Showing ${_filtered.length} of ${_employees.length} employees', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
        ),
      ]),
    );
  }
}
