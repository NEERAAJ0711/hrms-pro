import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class JobPostingManageScreen extends StatefulWidget {
  const JobPostingManageScreen({super.key});

  @override
  State<JobPostingManageScreen> createState() => _JobPostingManageScreenState();
}

class _JobPostingManageScreenState extends State<JobPostingManageScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _postings = [];
  bool _isLoading = true;
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _loadPostings();
  }

  Future<void> _loadPostings() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.dio.get('/api/mobile/job-postings/manage');
      setState(() { _postings = res.data ?? []; _isLoading = false; });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _deletePosting(String id) async {
    try {
      await _api.dio.delete('/api/mobile/job-postings/$id');
      _loadPostings();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Job posting deleted'), backgroundColor: AppTheme.accentColor));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to delete'), backgroundColor: AppTheme.errorColor));
    }
  }

  Future<void> _updateStatus(String id, String status) async {
    try {
      await _api.dio.put('/api/mobile/job-postings/$id', data: {'status': status});
      _loadPostings();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to update status'), backgroundColor: AppTheme.errorColor));
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filter == 'all' ? _postings : _postings.where((p) => p['status'] == _filter).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Manage Job Postings')),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final result = await Navigator.push(context, MaterialPageRoute(builder: (_) => const JobPostingFormScreen()));
          if (result == true) _loadPostings();
        },
        child: const Icon(Icons.add),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                _filterChip('All', 'all'),
                const SizedBox(width: 8),
                _filterChip('Draft', 'draft'),
                const SizedBox(width: 8),
                _filterChip('Open', 'open'),
                const SizedBox(width: 8),
                _filterChip('On Hold', 'on_hold'),
                const SizedBox(width: 8),
                _filterChip('Closed', 'closed'),
              ]),
            ),
          ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? const Center(child: Text('No job postings found', style: TextStyle(color: AppTheme.textSecondary)))
                    : RefreshIndicator(
                        onRefresh: _loadPostings,
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: filtered.length,
                          itemBuilder: (ctx, i) => _postingCard(filtered[i]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _filterChip(String label, String value) {
    final isSelected = _filter == value;
    return GestureDetector(
      onTap: () => setState(() => _filter = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(color: isSelected ? AppTheme.primaryColor : Colors.grey[100], borderRadius: BorderRadius.circular(20)),
        child: Text(label, style: TextStyle(color: isSelected ? Colors.white : Colors.grey[700], fontSize: 13, fontWeight: FontWeight.w500)),
      ),
    );
  }

  Widget _postingCard(Map<String, dynamic> posting) {
    final status = posting['status'] ?? 'draft';
    final apps = posting['applicationCount'] ?? 0;
    Color statusColor;
    switch (status) {
      case 'open': statusColor = AppTheme.accentColor; break;
      case 'closed': statusColor = AppTheme.errorColor; break;
      case 'on_hold': statusColor = AppTheme.warningColor; break;
      default: statusColor = Colors.grey;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(posting['title'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                  child: Text(status.toUpperCase(), style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                if (posting['department'] != null) ...[
                  Icon(Icons.business, size: 14, color: Colors.grey[500]),
                  const SizedBox(width: 4),
                  Text(posting['department'], style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                  const SizedBox(width: 12),
                ],
                if (posting['location'] != null) ...[
                  Icon(Icons.location_on, size: 14, color: Colors.grey[500]),
                  const SizedBox(width: 4),
                  Text(posting['location'], style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                ],
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                if (posting['employmentType'] != null) ...[
                  Text(posting['employmentType'].toString().replaceAll('_', ' ').toUpperCase(),
                      style: TextStyle(fontSize: 11, color: AppTheme.primaryColor, fontWeight: FontWeight.w500)),
                  const SizedBox(width: 12),
                ],
                if (posting['vacancies'] != null) Text('${posting['vacancies']} vacancy', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                const Spacer(),
                Icon(Icons.people, size: 14, color: Colors.grey[500]),
                const SizedBox(width: 4),
                Text('$apps applications', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
              ],
            ),
            if (posting['salaryRange'] != null && posting['salaryRange'].toString().isNotEmpty) ...[
              const SizedBox(height: 4),
              Text('Salary: ${posting['salaryRange']}', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
            ],
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (status == 'draft')
                  _actionBtn('Publish', Icons.publish, AppTheme.accentColor, () => _updateStatus(posting['id'], 'open')),
                if (status == 'open')
                  _actionBtn('Hold', Icons.pause, AppTheme.warningColor, () => _updateStatus(posting['id'], 'on_hold')),
                if (status == 'open')
                  _actionBtn('Close', Icons.close, AppTheme.errorColor, () => _updateStatus(posting['id'], 'closed')),
                if (status == 'on_hold')
                  _actionBtn('Reopen', Icons.play_arrow, AppTheme.accentColor, () => _updateStatus(posting['id'], 'open')),
                if (status == 'closed')
                  _actionBtn('Reopen', Icons.refresh, AppTheme.accentColor, () => _updateStatus(posting['id'], 'open')),
                const SizedBox(width: 4),
                _actionBtn('Edit', Icons.edit, AppTheme.primaryColor, () async {
                  final result = await Navigator.push(context, MaterialPageRoute(builder: (_) => JobPostingFormScreen(existing: posting)));
                  if (result == true) _loadPostings();
                }),
                const SizedBox(width: 4),
                _actionBtn('Delete', Icons.delete, AppTheme.errorColor, () {
                  showDialog(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Delete Job Posting?'),
                      content: const Text('This action cannot be undone.'),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                        ElevatedButton(onPressed: () { Navigator.pop(ctx); _deletePosting(posting['id']); },
                          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.errorColor), child: const Text('Delete')),
                      ],
                    ),
                  );
                }),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _actionBtn(String label, IconData icon, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 3),
            Text(label, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}

class JobPostingFormScreen extends StatefulWidget {
  final Map<String, dynamic>? existing;
  const JobPostingFormScreen({super.key, this.existing});

  @override
  State<JobPostingFormScreen> createState() => _JobPostingFormScreenState();
}

class _JobPostingFormScreenState extends State<JobPostingFormScreen> {
  final ApiClient _api = ApiClient();
  final _formKey = GlobalKey<FormState>();
  bool _isSaving = false;
  bool get isEditing => widget.existing != null;

  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _reqCtrl = TextEditingController();
  final _salaryCtrl = TextEditingController();
  final _vacanciesCtrl = TextEditingController(text: '1');
  String? _department;
  String? _location;
  String _employmentType = 'full_time';
  String _status = 'draft';
  DateTime? _closingDate;

  List<dynamic> _departments = [];
  List<dynamic> _locations = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadMasterData();
    if (isEditing) {
      final e = widget.existing!;
      _titleCtrl.text = e['title'] ?? '';
      _descCtrl.text = e['description'] ?? '';
      _reqCtrl.text = e['requirements'] ?? '';
      _salaryCtrl.text = e['salaryRange'] ?? '';
      _vacanciesCtrl.text = (e['vacancies'] ?? 1).toString();
      _department = e['department'];
      _location = e['location'];
      _employmentType = e['employmentType'] ?? 'full_time';
      _status = e['status'] ?? 'draft';
      if (e['closingDate'] != null) try { _closingDate = DateTime.parse(e['closingDate']); } catch (_) {}
    }
  }

  Future<void> _loadMasterData() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _api.dio.get('/api/mobile/departments'),
        _api.dio.get('/api/mobile/locations'),
      ]);
      setState(() { _departments = results[0].data ?? []; _locations = results[1].data ?? []; _isLoading = false; });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  String _formatDate(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSaving = true);
    try {
      final data = {
        'title': _titleCtrl.text.trim(),
        'description': _descCtrl.text.trim(),
        'requirements': _reqCtrl.text.trim().isNotEmpty ? _reqCtrl.text.trim() : null,
        'department': _department,
        'location': _location,
        'employmentType': _employmentType,
        'salaryRange': _salaryCtrl.text.trim().isNotEmpty ? _salaryCtrl.text.trim() : null,
        'vacancies': int.tryParse(_vacanciesCtrl.text) ?? 1,
        'status': _status,
        'closingDate': _closingDate != null ? _formatDate(_closingDate!) : null,
      };

      if (isEditing) {
        await _api.dio.put('/api/mobile/job-postings/${widget.existing!['id']}', data: data);
      } else {
        await _api.dio.post('/api/mobile/job-postings', data: data);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Job posting ${isEditing ? "updated" : "created"} successfully!'), backgroundColor: AppTheme.accentColor),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      String msg = 'Failed to save';
      if (e is DioException) msg = e.response?.data?['error'] ?? msg;
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor));
    }
    setState(() => _isSaving = false);
  }

  @override
  void dispose() {
    _titleCtrl.dispose(); _descCtrl.dispose(); _reqCtrl.dispose();
    _salaryCtrl.dispose(); _vacanciesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(isEditing ? 'Edit Job Posting' : 'Create Job Posting')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Job Details', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _titleCtrl,
                              decoration: const InputDecoration(labelText: 'Job Title *', border: OutlineInputBorder()),
                              validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _descCtrl,
                              decoration: const InputDecoration(labelText: 'Description *', border: OutlineInputBorder(), alignLabelWithHint: true),
                              maxLines: 4,
                              validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _reqCtrl,
                              decoration: const InputDecoration(labelText: 'Requirements', border: OutlineInputBorder(), alignLabelWithHint: true),
                              maxLines: 3,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Position Details', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                            const SizedBox(height: 12),
                            if (_departments.isNotEmpty)
                              DropdownButtonFormField<String>(
                                value: _department,
                                decoration: const InputDecoration(labelText: 'Department', border: OutlineInputBorder()),
                                isExpanded: true,
                                items: _departments.map<DropdownMenuItem<String>>((d) => DropdownMenuItem(value: d['name'].toString(), child: Text(d['name'].toString()))).toList(),
                                onChanged: (v) => setState(() => _department = v),
                              ),
                            if (_departments.isNotEmpty) const SizedBox(height: 12),
                            if (_locations.isNotEmpty)
                              DropdownButtonFormField<String>(
                                value: _location,
                                decoration: const InputDecoration(labelText: 'Location', border: OutlineInputBorder()),
                                isExpanded: true,
                                items: _locations.map<DropdownMenuItem<String>>((l) => DropdownMenuItem(value: l['name'].toString(), child: Text(l['name'].toString()))).toList(),
                                onChanged: (v) => setState(() => _location = v),
                              ),
                            if (_locations.isNotEmpty) const SizedBox(height: 12),
                            DropdownButtonFormField<String>(
                              value: _employmentType,
                              decoration: const InputDecoration(labelText: 'Employment Type', border: OutlineInputBorder()),
                              items: const [
                                DropdownMenuItem(value: 'full_time', child: Text('Full Time')),
                                DropdownMenuItem(value: 'part_time', child: Text('Part Time')),
                                DropdownMenuItem(value: 'contract', child: Text('Contract')),
                                DropdownMenuItem(value: 'intern', child: Text('Intern')),
                              ],
                              onChanged: (v) => setState(() => _employmentType = v ?? 'full_time'),
                            ),
                            const SizedBox(height: 12),
                            Row(children: [
                              Expanded(child: TextFormField(controller: _salaryCtrl, decoration: const InputDecoration(labelText: 'Salary Range', border: OutlineInputBorder(), hintText: 'e.g. 5-8 LPA'))),
                              const SizedBox(width: 12),
                              Expanded(child: TextFormField(controller: _vacanciesCtrl, decoration: const InputDecoration(labelText: 'Vacancies', border: OutlineInputBorder()), keyboardType: TextInputType.number)),
                            ]),
                            const SizedBox(height: 12),
                            DropdownButtonFormField<String>(
                              value: _status,
                              decoration: const InputDecoration(labelText: 'Status', border: OutlineInputBorder()),
                              items: const [
                                DropdownMenuItem(value: 'draft', child: Text('Draft')),
                                DropdownMenuItem(value: 'open', child: Text('Open')),
                                DropdownMenuItem(value: 'on_hold', child: Text('On Hold')),
                                DropdownMenuItem(value: 'closed', child: Text('Closed')),
                              ],
                              onChanged: (v) => setState(() => _status = v ?? 'draft'),
                            ),
                            const SizedBox(height: 12),
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text('Closing Date: ${_closingDate != null ? _formatDate(_closingDate!) : "Not set"}'),
                              trailing: const Icon(Icons.calendar_today, color: AppTheme.primaryColor),
                              onTap: () async {
                                final date = await showDatePicker(context: context, initialDate: _closingDate ?? DateTime.now().add(const Duration(days: 30)), firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)));
                                if (date != null) setState(() => _closingDate = date);
                              },
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity, height: 50,
                      child: ElevatedButton.icon(
                        onPressed: _isSaving ? null : _save,
                        icon: _isSaving
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.save),
                        label: Text(_isSaving ? 'Saving...' : (isEditing ? 'Update Posting' : 'Create Posting')),
                        style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryColor),
                      ),
                    ),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
    );
  }
}
