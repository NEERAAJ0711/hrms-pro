import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_provider.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../dashboard/dashboard_screen.dart';
import '../attendance/attendance_screen.dart';
import '../attendance/monthly_attendance_screen.dart';
import '../leave/leave_screen.dart';
import '../profile/profile_screen.dart';
import '../jobs/jobs_screen.dart';
import '../jobs/job_posting_screen.dart';
import '../holidays/holidays_screen.dart';
import '../payslip/payslip_screen.dart';
import '../leave_approval/leave_approval_screen.dart';
import '../team/team_screen.dart';
import '../team/birthday_screen.dart';
import '../salary/salary_structure_screen.dart';
import '../salary/salary_structure_form_screen.dart';
import '../quick_attendance/quick_attendance_screen.dart';
import '../employees/employee_registration_screen.dart';
import '../attendance/face_registration_screen.dart';
import '../admin/super_admin_screen.dart';
import '../geofence/geo_fence_screen.dart';
import '../leave/advance_request_screen.dart';
import '../notifications/notification_screen.dart';
import '../locations/locations_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);
    final role = auth.user?.role ?? '';
    final isSuperAdmin = role == 'super_admin';
    final hasCompany = auth.user?.hasCompany ?? false;

    final List<Widget> screens;
    final List<BottomNavigationBarItem> navItems;

    if (isSuperAdmin) {
      screens = [
        const SuperAdminScreen(),
        const _SuperAdminMoreScreen(),
        const ProfileScreen(),
      ];
      navItems = const [
        BottomNavigationBarItem(icon: Icon(Icons.admin_panel_settings), label: 'Admin'),
        BottomNavigationBarItem(icon: Icon(Icons.apps), label: 'Tools'),
        BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
      ];
    } else if (hasCompany) {
      screens = [
        const DashboardScreen(),
        const AttendanceScreen(),
        const LeaveScreen(),
        const _MoreScreen(),
      ];
      navItems = const [
        BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'Dashboard'),
        BottomNavigationBarItem(icon: Icon(Icons.access_time), label: 'Attendance'),
        BottomNavigationBarItem(icon: Icon(Icons.event_note), label: 'Leave'),
        BottomNavigationBarItem(icon: Icon(Icons.apps), label: 'More'),
      ];
    } else {
      screens = [
        const JobsScreen(),
        const ProfileScreen(),
      ];
      navItems = const [
        BottomNavigationBarItem(icon: Icon(Icons.work), label: 'Jobs'),
        BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
      ];
    }

    if (_currentIndex >= screens.length) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _currentIndex = 0);
      });
    }

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.primaryColor,
        title: Row(children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
            child: const Icon(Icons.business_center, color: Colors.white, size: 20),
          ),
          const SizedBox(width: 10),
          const Text('HRMS Pro', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ]),
        actions: [
          if (auth.user?.role != null)
            Container(
              margin: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
              child: Text(_roleBadge(role), style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
            ),
          _NotificationBellButton(),
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: () async => await auth.logout(),
            tooltip: 'Logout',
          ),
        ],
      ),
      body: IndexedStack(
        index: _currentIndex.clamp(0, screens.length - 1),
        children: screens,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex.clamp(0, navItems.length - 1),
        onTap: (index) => setState(() => _currentIndex = index),
        selectedItemColor: AppTheme.primaryColor,
        unselectedItemColor: AppTheme.textSecondary,
        type: BottomNavigationBarType.fixed,
        items: navItems,
      ),
    );
  }

  String _roleBadge(String role) {
    switch (role) {
      case 'super_admin': return 'SUPER ADMIN';
      case 'company_admin': return 'ADMIN';
      case 'hr_admin': return 'HR';
      case 'manager': return 'MANAGER';
      case 'employee': return 'EMPLOYEE';
      default: return role.toUpperCase();
    }
  }
}

class _NotificationBellButton extends StatefulWidget {
  @override
  State<_NotificationBellButton> createState() => _NotificationBellButtonState();
}

class _NotificationBellButtonState extends State<_NotificationBellButton> {
  final _api = ApiClient();
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _fetchCount();
  }

  Future<void> _fetchCount() async {
    try {
      final res = await _api.get('/api/notifications/unread-count');
      if (mounted) setState(() => _unread = res.data['count'] ?? 0);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        IconButton(
          icon: const Icon(Icons.notifications_outlined, color: Colors.white),
          onPressed: () async {
            await Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationScreen()));
            _fetchCount();
          },
          tooltip: 'Notifications',
        ),
        if (_unread > 0)
          Positioned(
            right: 8,
            top: 8,
            child: Container(
              width: 16,
              height: 16,
              decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
              child: Center(
                child: Text(
                  _unread > 9 ? '9+' : '$_unread',
                  style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _SuperAdminMoreScreen extends StatelessWidget {
  const _SuperAdminMoreScreen();

  @override
  Widget build(BuildContext context) {
    final tools = [
      _MenuItem(icon: Icons.person_add_alt_1, title: 'Register Employee', subtitle: 'Add new employee', color: const Color(0xFF3F51B5), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const EmployeeRegistrationScreen()))),
      _MenuItem(icon: Icons.face_retouching_natural, title: 'Face Registration', subtitle: 'Register employee faces', color: const Color(0xFF6366F1), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FaceRegistrationScreen()))),
      _MenuItem(icon: Icons.radar, title: 'Geo-Fence Setup', subtitle: 'Office location & radius', color: const Color(0xFF0288D1), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const GeoFenceScreen()))),
      _MenuItem(icon: Icons.approval, title: 'Leave Approval', subtitle: 'Approve/reject leaves', color: const Color(0xFF4CAF50), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LeaveApprovalScreen()))),
      _MenuItem(icon: Icons.edit_calendar, title: 'Quick Attendance', subtitle: 'Single day entry', color: const Color(0xFF795548), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const QuickAttendanceScreen()))),
      _MenuItem(icon: Icons.calendar_view_month, title: 'Monthly Attendance', subtitle: 'Monthly pay days', color: const Color(0xFF607D8B), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MonthlyAttendanceScreen()))),
      _MenuItem(icon: Icons.account_balance_wallet_outlined, title: 'Salary Setup', subtitle: 'Create/update salary', color: const Color(0xFF009688), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SalaryStructureFormScreen()))),
      _MenuItem(icon: Icons.post_add, title: 'Job Postings', subtitle: 'Manage job posts', color: const Color(0xFFE91E63), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const JobPostingManageScreen()))),
      _MenuItem(icon: Icons.work_outline, title: 'Job Board', subtitle: 'Browse positions', color: const Color(0xFF00BCD4), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const JobsScreen(showAppBar: true)))),
      _MenuItem(icon: Icons.location_on_outlined, title: 'Locations', subtitle: 'Manage office branches', color: const Color(0xFF43A047), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LocationsScreen()))),
      _MenuItem(icon: Icons.person, title: 'My Profile', subtitle: 'Personal details', color: AppTheme.primaryColor, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen(showAppBar: true)))),
    ];
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          padding: const EdgeInsets.all(14),
          margin: const EdgeInsets.only(bottom: 20),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [AppTheme.primaryColor.withValues(alpha: 0.08), AppTheme.primaryColor.withValues(alpha: 0.03)]),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppTheme.primaryColor.withValues(alpha: 0.15)),
          ),
          child: Row(children: [
            Icon(Icons.admin_panel_settings, color: AppTheme.primaryColor, size: 28),
            const SizedBox(width: 12),
            const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Super Admin Tools', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppTheme.textPrimary)),
              Text('Full access to all system features and management tools', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
            ])),
          ]),
        ),
        const Text('Administration', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: 0.95,
          children: tools.map((item) => _menuTile(item)).toList(),
        ),
      ]),
    );
  }

  Widget _menuTile(_MenuItem item) {
    return Builder(builder: (context) {
      return GestureDetector(
        onTap: item.onTap,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey[200]!),
            boxShadow: [BoxShadow(color: Colors.grey.withValues(alpha: 0.08), blurRadius: 4, offset: const Offset(0, 2))],
          ),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: item.color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)), child: Icon(item.icon, color: item.color, size: 24)),
            const SizedBox(height: 8),
            Text(item.title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
            Text(item.subtitle, style: TextStyle(fontSize: 9, color: Colors.grey[500]), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
          ]),
        ),
      );
    });
  }
}

class _MoreScreen extends StatelessWidget {
  const _MoreScreen();

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);
    final isManager = ['super_admin', 'company_admin', 'hr_admin', 'manager'].contains(auth.user?.role);
    final hasCompany = auth.user?.hasCompany ?? false;

    final List<_MenuItem> items = [];

    if (hasCompany) {
      items.add(_MenuItem(icon: Icons.person, title: 'My Profile', subtitle: 'Personal & financial details', color: AppTheme.primaryColor, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen(showAppBar: true)))));
      items.add(_MenuItem(icon: Icons.receipt_long, title: 'Pay Slips', subtitle: 'View & download payslips', color: AppTheme.accentColor, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PayslipScreen()))));
      items.add(_MenuItem(icon: Icons.account_balance_wallet, title: 'Salary Structure', subtitle: 'View your salary breakup', color: const Color(0xFF9C27B0), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SalaryStructureScreen()))));
      items.add(_MenuItem(icon: Icons.calendar_month, title: 'Holiday Calendar', subtitle: 'Company holiday list', color: AppTheme.warningColor, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HolidaysScreen()))));
      items.add(_MenuItem(icon: Icons.work_outline, title: 'Job Board', subtitle: 'Browse & apply for positions', color: const Color(0xFF00BCD4), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const JobsScreen(showAppBar: true)))));
      items.add(_MenuItem(icon: Icons.cake, title: 'Birthday List', subtitle: 'Team birthdays this month', color: const Color(0xFFFF9800), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const BirthdayScreen()))));
      items.add(_MenuItem(icon: Icons.account_balance_wallet, title: 'Advance & Loan', subtitle: 'Request salary advance or loan', color: const Color(0xFF43A047), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdvanceRequestScreen()))));
    }

    if (isManager) {
      items.add(_MenuItem(icon: Icons.approval, title: 'Leave Approval', subtitle: 'Approve/reject leave requests', color: const Color(0xFF4CAF50), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LeaveApprovalScreen()))));
      items.add(_MenuItem(icon: Icons.group, title: 'My Team', subtitle: 'View team members', color: AppTheme.primaryDark, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TeamScreen()))));
      items.add(_MenuItem(icon: Icons.edit_calendar, title: 'Quick Attendance', subtitle: 'Single day entry for team', color: const Color(0xFF795548), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const QuickAttendanceScreen()))));
      items.add(_MenuItem(icon: Icons.calendar_view_month, title: 'Monthly Attendance', subtitle: 'Monthly entry with Pay Days', color: const Color(0xFF607D8B), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MonthlyAttendanceScreen()))));
      items.add(_MenuItem(icon: Icons.person_add_alt_1, title: 'Register Employee', subtitle: 'Add new employee', color: const Color(0xFF3F51B5), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const EmployeeRegistrationScreen()))));
      items.add(_MenuItem(icon: Icons.face_retouching_natural, title: 'Face Registration', subtitle: 'Register employee faces', color: const Color(0xFF6366F1), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FaceRegistrationScreen()))));
      items.add(_MenuItem(icon: Icons.radar, title: 'Geo-Fence Setup', subtitle: 'Office location & radius', color: const Color(0xFF0288D1), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const GeoFenceScreen()))));
      items.add(_MenuItem(icon: Icons.account_balance_wallet_outlined, title: 'Salary Setup', subtitle: 'Create/update salary structure', color: const Color(0xFF009688), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SalaryStructureFormScreen()))));
      items.add(_MenuItem(icon: Icons.post_add, title: 'Job Postings', subtitle: 'Create & manage job posts', color: const Color(0xFFE91E63), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const JobPostingManageScreen()))));
      items.add(_MenuItem(icon: Icons.location_on_outlined, title: 'Locations', subtitle: 'Manage office branches', color: const Color(0xFF43A047), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LocationsScreen()))));
    }

    const managerTitles = ['Leave Approval', 'My Team', 'Quick Attendance', 'Monthly Attendance', 'Register Employee', 'Face Registration', 'Geo-Fence Setup', 'Salary Setup', 'Job Postings', 'Locations'];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (hasCompany) ...[
          const Text('Employee Services', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 0.95,
            children: items.where((i) => !managerTitles.contains(i.title)).map((item) => _menuTile(item)).toList(),
          ),
        ],
        if (isManager) ...[
          const SizedBox(height: 20),
          const Text('Manager Tools', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 0.95,
            children: items.where((i) => managerTitles.contains(i.title)).map((item) => _menuTile(item)).toList(),
          ),
        ],
      ]),
    );
  }

  Widget _menuTile(_MenuItem item) {
    return GestureDetector(
      onTap: item.onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey[200]!),
          boxShadow: [BoxShadow(color: Colors.grey.withValues(alpha: 0.08), blurRadius: 4, offset: const Offset(0, 2))],
        ),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: item.color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)), child: Icon(item.icon, color: item.color, size: 24)),
          const SizedBox(height: 8),
          Text(item.title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
          Text(item.subtitle, style: TextStyle(fontSize: 9, color: Colors.grey[500]), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
        ]),
      ),
    );
  }
}

class _MenuItem {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;
  _MenuItem({required this.icon, required this.title, required this.subtitle, required this.color, required this.onTap});
}
