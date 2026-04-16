import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'apply_job_screen.dart';
import 'negotiate_offer_screen.dart';

class JobsScreen extends StatefulWidget {
  final bool showAppBar;
  const JobsScreen({super.key, this.showAppBar = false});

  @override
  State<JobsScreen> createState() => _JobsScreenState();
}

class _JobsScreenState extends State<JobsScreen> with SingleTickerProviderStateMixin {
  final ApiClient _api = ApiClient();
  late TabController _tabController;
  List<dynamic> _jobPostings = [];
  List<dynamic> _myApplications = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final postingsRes = await _api.dio.get('/api/mobile/job-postings');
      final appsRes = await _api.dio.get('/api/mobile/job-applications');
      setState(() {
        _jobPostings = postingsRes.data ?? [];
        _myApplications = appsRes.data ?? [];
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _openApplyScreen(Map<String, dynamic> job) async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => ApplyJobScreen(job: job)),
    );
    if (result == true) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Application submitted!'), backgroundColor: AppTheme.accentColor));
      _loadData();
    }
  }

  Future<void> _respondToApplication(String appId, String action, {String? counterOfferNote}) async {
    try {
      await _api.dio.put('/api/mobile/job-applications/$appId/respond', data: {
        'action': action,
        if (counterOfferNote != null) 'counterOfferNote': counterOfferNote,
      });
      final actionLabels = {'accept': 'Offer accepted', 'decline': 'Offer declined', 'negotiate': 'Counter-offer sent', 'withdraw': 'Application withdrawn'};
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(actionLabels[action] ?? 'Updated'), backgroundColor: AppTheme.accentColor));
      }
      _loadData();
    } catch (e) {
      String msg = 'Action failed';
      if (e is DioException) msg = e.response?.data?['error'] ?? msg;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor));
      }
    }
  }

  Future<void> _openNegotiateScreen(String appId, Map<String, dynamic> app) async {
    final note = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => NegotiateOfferScreen(applicationId: appId, offerDetails: app)),
    );
    if (note != null && note.isNotEmpty) {
      _respondToApplication(appId, 'negotiate', counterOfferNote: note);
    }
  }

  void _confirmAction(String appId, String action, String title, String message) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              _respondToApplication(appId, action);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: action == 'accept' ? AppTheme.accentColor : AppTheme.errorColor,
            ),
            child: Text(action == 'accept' ? 'Accept' : action == 'withdraw' ? 'Withdraw' : 'Decline'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final body = Column(
      children: [
        TabBar(
          controller: _tabController,
          labelColor: AppTheme.primaryColor,
          unselectedLabelColor: AppTheme.textSecondary,
          indicatorColor: AppTheme.primaryColor,
          tabs: const [
            Tab(text: 'Open Positions'),
            Tab(text: 'My Applications'),
          ],
        ),
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildPostingsTab(),
                    _buildApplicationsTab(),
                  ],
                ),
        ),
      ],
    );

    if (widget.showAppBar) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Job Board'),
          backgroundColor: AppTheme.primaryColor,
          iconTheme: const IconThemeData(color: Colors.white),
          titleTextStyle: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
        ),
        body: body,
      );
    }
    return body;
  }

  Widget _buildPostingsTab() {
    if (_jobPostings.isEmpty) {
      return const Center(child: Text('No open positions available', style: TextStyle(color: AppTheme.textSecondary)));
    }
    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _jobPostings.length,
        itemBuilder: (context, index) {
          final job = _jobPostings[index];
          final alreadyApplied = _myApplications.any((a) => a['jobPostingId'] == job['id']);
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(job['title'] ?? '', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text(job['companyName'] ?? '', style: TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 8),
                  if (job['location'] != null) _chip(Icons.location_on, job['location']),
                  if (job['employmentType'] != null) _chip(Icons.work_outline, job['employmentType']),
                  if (job['salaryRange'] != null) _chip(Icons.currency_rupee, job['salaryRange']),
                  const SizedBox(height: 8),
                  if (job['description'] != null)
                    Text(job['description'], maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: Colors.grey[600])),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: alreadyApplied ? null : () => _openApplyScreen(job),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: alreadyApplied ? Colors.grey : AppTheme.primaryColor,
                      ),
                      child: Text(alreadyApplied ? 'Already Applied' : 'Apply Now'),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildApplicationsTab() {
    if (_myApplications.isEmpty) {
      return const Center(child: Text('No applications yet', style: TextStyle(color: AppTheme.textSecondary)));
    }
    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _myApplications.length,
        itemBuilder: (context, index) {
          final app = _myApplications[index];
          return _applicationCard(app);
        },
      ),
    );
  }

  Widget _applicationCard(Map<String, dynamic> app) {
    final status = app['status'] ?? 'applied';
    final appId = app['id']?.toString() ?? '';
    Color statusColor;
    switch (status) {
      case 'hired': case 'offer_accepted': statusColor = AppTheme.accentColor; break;
      case 'rejected': case 'offer_rejected': case 'withdrawn': statusColor = AppTheme.errorColor; break;
      case 'offered': case 'shortlisted': case 'interview_scheduled': statusColor = AppTheme.primaryColor; break;
      default: statusColor = AppTheme.warningColor;
    }

    final canWithdraw = ['applied', 'shortlisted', 'interview_scheduled', 'interviewed', 'offered', 'offer_negotiated'].contains(status);
    final canRespondToOffer = status == 'offered';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(child: Text(app['jobTitle'] ?? 'Unknown Position', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                  child: Text(status.toString().replaceAll('_', ' ').toUpperCase(),
                      style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(app['companyName'] ?? '', style: TextStyle(color: Colors.grey[600])),
            if (app['appliedAt'] != null)
              Text('Applied: ${app['appliedAt'].toString().split('T')[0]}', style: TextStyle(fontSize: 12, color: Colors.grey[500])),

            if (app['interviewDate'] != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: AppTheme.primaryColor.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(8)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Interview Details', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    const SizedBox(height: 4),
                    _chip(Icons.calendar_today, 'Date: ${app['interviewDate']}'),
                    if (app['interviewTime'] != null) _chip(Icons.access_time, 'Time: ${app['interviewTime']}'),
                    if (app['interviewLocation'] != null) _chip(Icons.location_on, 'Location: ${app['interviewLocation']}'),
                    if (app['interviewNotes'] != null)
                      Text('Notes: ${app['interviewNotes']}', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                  ],
                ),
              ),
            ],

            if (app['offerSalary'] != null || app['offerDesignation'] != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: AppTheme.accentColor.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(8)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Offer Details', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    const SizedBox(height: 4),
                    if (app['offerDesignation'] != null) _chip(Icons.badge, 'Designation: ${app['offerDesignation']}'),
                    if (app['offerSalary'] != null) _chip(Icons.currency_rupee, 'Salary: ${app['offerSalary']}'),
                    if (app['offerTerms'] != null)
                      Text('Terms: ${app['offerTerms']}', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                    if (app['offerExpiryDate'] != null)
                      _chip(Icons.event, 'Expires: ${app['offerExpiryDate']}'),
                  ],
                ),
              ),
            ],

            if (canRespondToOffer) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _confirmAction(appId, 'accept', 'Accept Offer', 'Are you sure you want to accept this offer?'),
                      style: ElevatedButton.styleFrom(backgroundColor: AppTheme.accentColor, padding: const EdgeInsets.symmetric(vertical: 10)),
                      child: const Text('Accept', style: TextStyle(fontSize: 13)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _openNegotiateScreen(appId, app),
                      style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 10)),
                      child: const Text('Negotiate', style: TextStyle(fontSize: 13)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _confirmAction(appId, 'decline', 'Decline Offer', 'Are you sure you want to decline this offer?'),
                      style: ElevatedButton.styleFrom(backgroundColor: AppTheme.errorColor, padding: const EdgeInsets.symmetric(vertical: 10)),
                      child: const Text('Decline', style: TextStyle(fontSize: 13)),
                    ),
                  ),
                ],
              ),
            ],

            if (canWithdraw && !canRespondToOffer) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => _confirmAction(appId, 'withdraw', 'Withdraw Application', 'Are you sure you want to withdraw this application?'),
                  icon: const Icon(Icons.cancel_outlined, size: 16),
                  label: const Text('Withdraw Application'),
                  style: OutlinedButton.styleFrom(foregroundColor: AppTheme.errorColor, side: const BorderSide(color: AppTheme.errorColor)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _chip(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Icon(icon, size: 14, color: Colors.grey[600]),
          const SizedBox(width: 4),
          Expanded(child: Text(text, style: TextStyle(fontSize: 12, color: Colors.grey[600]))),
        ],
      ),
    );
  }
}
