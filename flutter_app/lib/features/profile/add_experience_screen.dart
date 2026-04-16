import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class AddExperienceScreen extends StatefulWidget {
  final bool isEmployee;
  const AddExperienceScreen({super.key, required this.isEmployee});

  @override
  State<AddExperienceScreen> createState() => _AddExperienceScreenState();
}

class _AddExperienceScreenState extends State<AddExperienceScreen> {
  final ApiClient _api = ApiClient();
  final _formKey = GlobalKey<FormState>();
  final _orgCtrl = TextEditingController();
  final _postCtrl = TextEditingController();
  final _dojCtrl = TextEditingController();
  final _dolCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();
  final _ctcCtrl = TextEditingController();
  final _responsibilitiesCtrl = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _orgCtrl.dispose();
    _postCtrl.dispose();
    _dojCtrl.dispose();
    _dolCtrl.dispose();
    _reasonCtrl.dispose();
    _ctcCtrl.dispose();
    _responsibilitiesCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate(TextEditingController ctrl) async {
    DateTime initial = DateTime(2020);
    try { if (ctrl.text.isNotEmpty) initial = DateTime.parse(ctrl.text); } catch (_) {}
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1980),
      lastDate: DateTime.now(),
    );
    if (date != null) {
      ctrl.text = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSubmitting = true);
    try {
      await _api.dio.post('/api/mobile/previous-experiences', data: {
        'organizationName': _orgCtrl.text.trim(),
        'postHeld': _postCtrl.text.trim(),
        'dateOfJoining': _dojCtrl.text.trim(),
        'dateOfLeaving': _dolCtrl.text.trim(),
        'reasonOfLeaving': _reasonCtrl.text.trim(),
        'ctc': _ctcCtrl.text.trim(),
        'jobResponsibilities': _responsibilitiesCtrl.text.trim(),
        'targetType': widget.isEmployee ? 'employee' : 'candidate',
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Experience added successfully'), backgroundColor: AppTheme.accentColor));
        Navigator.pop(context, true);
      }
    } catch (e) {
      String msg = 'Failed to add experience';
      if (e is DioException) msg = e.response?.data?['error'] ?? msg;
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor));
    }
    if (mounted) setState(() => _isSubmitting = false);
  }

  InputDecoration _dec(String label, IconData icon, {String? hint}) => InputDecoration(
    labelText: label,
    hintText: hint,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primaryColor, width: 1.5)),
    prefixIcon: Icon(icon, color: AppTheme.primaryColor, size: 20),
    filled: true,
    fillColor: Colors.white,
  );

  Widget _dateTile(String label, IconData icon, TextEditingController ctrl) => GestureDetector(
    onTap: () => _pickDate(ctrl),
    child: AbsorbPointer(
      child: TextFormField(
        controller: ctrl,
        decoration: _dec(label, icon, hint: 'YYYY-MM-DD'),
        validator: (v) => (v == null || v.trim().isEmpty) ? '$label is required' : null,
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text('Add Work Experience'),
        backgroundColor: AppTheme.primaryColor,
        iconTheme: const IconThemeData(color: Colors.white),
        titleTextStyle: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
        elevation: 0,
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Organisation & Role
              _card(
                title: 'Organisation & Role',
                icon: Icons.business_center_outlined,
                color: AppTheme.primaryColor,
                children: [
                  TextFormField(
                    controller: _orgCtrl,
                    decoration: _dec('Organization / Company Name *', Icons.business_outlined),
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Organization name is required' : null,
                    textCapitalization: TextCapitalization.words,
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _postCtrl,
                    decoration: _dec('Post / Designation Held *', Icons.badge_outlined),
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Post held is required' : null,
                    textCapitalization: TextCapitalization.words,
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Dates
              _card(
                title: 'Period of Employment',
                icon: Icons.calendar_month_outlined,
                color: const Color(0xFF0694A2),
                children: [
                  _dateTile('Date of Joining *', Icons.calendar_today_outlined, _dojCtrl),
                  const SizedBox(height: 14),
                  _dateTile('Date of Leaving *', Icons.event_available_outlined, _dolCtrl),
                ],
              ),
              const SizedBox(height: 14),

              // Salary & Reason
              _card(
                title: 'Salary & Reason for Leaving',
                icon: Icons.currency_rupee_outlined,
                color: const Color(0xFF059669),
                children: [
                  TextFormField(
                    controller: _ctcCtrl,
                    decoration: _dec('Last CTC / Annual Salary', Icons.currency_rupee_outlined, hint: 'e.g. 360000'),
                    keyboardType: TextInputType.number,
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _reasonCtrl,
                    decoration: _dec('Reason for Leaving', Icons.notes_outlined, hint: 'e.g. Better opportunity'),
                    maxLines: 2,
                    textCapitalization: TextCapitalization.sentences,
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Job Responsibilities
              _card(
                title: 'Job Responsibilities',
                icon: Icons.checklist_outlined,
                color: const Color(0xFFE91E63),
                children: [
                  TextFormField(
                    controller: _responsibilitiesCtrl,
                    decoration: InputDecoration(
                      labelText: 'Key Responsibilities & Achievements',
                      hintText: 'Describe your daily tasks, key responsibilities, and any major achievements in this role...',
                      hintStyle: TextStyle(fontSize: 12, color: Colors.grey.shade400),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE91E63), width: 1.5)),
                      filled: true,
                      fillColor: Colors.white,
                      alignLabelWithHint: true,
                    ),
                    maxLines: 5,
                    textCapitalization: TextCapitalization.sentences,
                  ),
                ],
              ),
              const SizedBox(height: 24),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: _isSubmitting ? null : _submit,
                  icon: _isSubmitting
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.add_circle_outline),
                  label: Text(_isSubmitting ? 'Adding...' : 'Add Experience',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 2,
                  ),
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _card({required String title, required IconData icon, required Color color, required List<Widget> children}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
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
          ),
          Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children)),
        ],
      ),
    );
  }
}
