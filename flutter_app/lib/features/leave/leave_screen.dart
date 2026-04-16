import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'apply_leave_screen.dart';

class LeaveScreen extends StatefulWidget {
  const LeaveScreen({super.key});

  @override
  State<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends State<LeaveScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _leaveTypes = [];
  List<dynamic> _leaveRequests = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final typesRes = await _api.dio.get('/api/mobile/leave-types');
      final reqsRes = await _api.dio.get('/api/mobile/leave-requests');
      setState(() {
        _leaveTypes = typesRes.data ?? [];
        _leaveRequests = reqsRes.data ?? [];
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _openApplyScreen() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => ApplyLeaveScreen(leaveTypes: _leaveTypes)),
    );
    if (result == true) _loadData();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _loadData,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Leave Balance', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _leaveTypes.map((type) {
                        return Container(
                          width: (MediaQuery.of(context).size.width - 48) / 2,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.grey[200]!),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(type['code'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.primaryColor)),
                              Text(type['name'] ?? '', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                              Text('${type['daysPerYear'] ?? 0} days/year', style: const TextStyle(fontSize: 12)),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 24),
                    const Text('My Leave Requests', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    if (_leaveRequests.isEmpty)
                      Card(child: Padding(padding: const EdgeInsets.all(20), child: Center(child: Text('No leave requests yet', style: TextStyle(color: Colors.grey[600])))))
                    else
                      ..._leaveRequests.map((req) => _leaveCard(req)).toList(),
                  ],
                ),
              ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openApplyScreen,
        icon: const Icon(Icons.add),
        label: const Text('Apply Leave'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
      ),
    );
  }

  Widget _leaveCard(Map<String, dynamic> req) {
    final status = req['status'] ?? 'pending';
    Color statusColor;
    switch (status) {
      case 'approved': statusColor = AppTheme.accentColor; break;
      case 'rejected': statusColor = AppTheme.errorColor; break;
      default: statusColor = AppTheme.warningColor;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('${req['startDate']} - ${req['endDate']}', style: const TextStyle(fontWeight: FontWeight.w500)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                  child: Text(status.toString().toUpperCase(), style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text('${req['days'] ?? 0} day(s)', style: TextStyle(fontSize: 13, color: Colors.grey[600])),
            if (req['reason'] != null && req['reason'].toString().isNotEmpty)
              Text(req['reason'], style: TextStyle(fontSize: 13, color: Colors.grey[600])),
          ],
        ),
      ),
    );
  }
}
