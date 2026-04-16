import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api_client.dart';
import '../../core/auth_provider.dart';
import '../../core/theme.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final ApiClient _api = ApiClient();
  Map<String, dynamic>? _dashboardData;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() => _isLoading = true);
    try {
      final response = await _api.dio.get('/api/mobile/dashboard');
      setState(() {
        _dashboardData = response.data;
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
      onRefresh: _loadDashboard,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundColor: AppTheme.primaryColor,
                      child: Text(
                        '${user?.firstName.isNotEmpty == true ? user!.firstName[0] : ''}${user?.lastName.isNotEmpty == true ? user!.lastName[0] : ''}',
                        style: const TextStyle(fontSize: 20, color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Welcome back,', style: TextStyle(fontSize: 14, color: Colors.grey[600])),
                          Text('${user?.firstName ?? ''} ${user?.lastName ?? ''}',
                              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                          if (_dashboardData?['employee'] != null)
                            Text(
                              '${_dashboardData!['employee']['designation'] ?? ''} • ${_dashboardData!['employee']['department'] ?? ''}',
                              style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (_isLoading)
              const Center(child: CircularProgressIndicator())
            else ...[
              _buildStatusCards(),
              const SizedBox(height: 16),
              _buildTodayAttendance(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildStatusCards() {
    final attendance = _dashboardData?['todayAttendance'];
    final pendingLeaves = _dashboardData?['pendingLeaves'] ?? 0;
    final jobApps = _dashboardData?['jobApplications'] ?? 0;

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.5,
      children: [
        _statusCard('Today', attendance != null ? (attendance['clockIn'] != null ? 'Present' : 'Not Marked') : 'Not Marked',
            attendance != null && attendance['clockIn'] != null ? Icons.check_circle : Icons.cancel,
            attendance != null && attendance['clockIn'] != null ? AppTheme.accentColor : AppTheme.errorColor),
        _statusCard('Pending Leaves', '$pendingLeaves', Icons.event_note, AppTheme.warningColor),
        _statusCard('Job Applications', '$jobApps', Icons.work_outline, AppTheme.primaryColor),
        _statusCard('Employee Code', _dashboardData?['employee']?['employeeCode'] ?? 'N/A', Icons.badge, AppTheme.primaryDark),
      ],
    );
  }

  Widget _statusCard(String title, String value, IconData icon, Color color) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 8),
            Text(title, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
            Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }

  Widget _buildTodayAttendance() {
    final attendance = _dashboardData?['todayAttendance'];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Today's Attendance", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            if (attendance == null)
              const Text('No attendance record for today', style: TextStyle(color: AppTheme.textSecondary))
            else ...[
              _infoRow('Clock In', attendance['clockIn'] ?? '-'),
              _infoRow('Clock Out', attendance['clockOut'] ?? '-'),
              _infoRow('Work Hours', attendance['workHours'] ?? '-'),
              _infoRow('Status', attendance['status'] ?? '-'),
              if (attendance['faceVerified'] == true)
                _infoRow('Face Verified', 'Yes', color: AppTheme.accentColor),
              if (attendance['latitude'] != null)
                _infoRow('Location', '${attendance['latitude']}, ${attendance['longitude']}'),
            ],
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value, {Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey[600])),
          Text(value, style: TextStyle(fontWeight: FontWeight.w500, color: color)),
        ],
      ),
    );
  }
}
