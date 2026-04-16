import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class LocationsScreen extends StatefulWidget {
  const LocationsScreen({super.key});

  @override
  State<LocationsScreen> createState() => _LocationsScreenState();
}

class _LocationsScreenState extends State<LocationsScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _locations = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      final res = await _api.dio.get('/api/mobile/locations');
      setState(() { _locations = res.data ?? []; _isLoading = false; });
    } catch (e) {
      setState(() { _isLoading = false; _error = 'Failed to load locations. Please try again.'; });
    }
  }

  Future<void> _delete(String id, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Delete Location'),
        content: Text('Are you sure you want to delete "$name"? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.errorColor),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _api.dio.delete('/api/mobile/locations/$id');
      _snack('Location deleted');
      _load();
    } catch (e) {
      String msg = 'Failed to delete';
      if (e is DioException) msg = e.response?.data?['error'] ?? msg;
      _snack(msg, error: true);
    }
  }

  void _snack(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? AppTheme.errorColor : AppTheme.accentColor,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ));
  }

  Future<void> _openForm({Map<String, dynamic>? existing}) async {
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => _LocationFormScreen(existing: existing)),
    );
    if (result == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text('Office Locations'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        titleTextStyle: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _load, tooltip: 'Refresh'),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openForm(),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_location_alt_rounded),
        label: const Text('Add Location', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.error_outline, color: AppTheme.errorColor, size: 52),
            const SizedBox(height: 12),
            Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: AppTheme.textSecondary)),
            const SizedBox(height: 16),
            ElevatedButton.icon(onPressed: _load, icon: const Icon(Icons.refresh), label: const Text('Retry')),
          ]),
        ),
      );
    }

    if (_locations.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(color: AppTheme.primaryColor.withValues(alpha: 0.08), shape: BoxShape.circle),
              child: const Icon(Icons.location_off_outlined, size: 40, color: AppTheme.primaryColor),
            ),
            const SizedBox(height: 20),
            const Text('No Locations Found', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
            const SizedBox(height: 8),
            const Text(
              'Add office/branch locations to assign employees and track attendance by location.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () => _openForm(),
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryColor, foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
              icon: const Icon(Icons.add_location_alt_rounded),
              label: const Text('Add First Location'),
            ),
          ]),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
        itemCount: _locations.length,
        itemBuilder: (_, i) => _locationCard(_locations[i]),
      ),
    );
  }

  Widget _locationCard(Map<String, dynamic> loc) {
    final status = loc['status'] ?? 'active';
    final isActive = status == 'active';

    // Build subtitle from address parts
    final parts = <String>[
      if ((loc['city'] ?? '').isNotEmpty) loc['city'],
      if ((loc['state'] ?? '').isNotEmpty) loc['state'],
    ];
    final subtitle = parts.join(', ');

    final hasCoords = (loc['latitude'] ?? '').isNotEmpty && (loc['longitude'] ?? '').isNotEmpty;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        children: [
          // ── Card header ─────────────────────────────────────────
          Container(
            padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
            decoration: BoxDecoration(
              color: isActive ? AppTheme.primaryColor.withValues(alpha: 0.04) : Colors.grey.shade50,
              borderRadius: const BorderRadius.only(topLeft: Radius.circular(16), topRight: Radius.circular(16)),
              border: Border(bottom: BorderSide(color: Colors.grey.shade100)),
            ),
            child: Row(
              children: [
                Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    color: isActive ? AppTheme.primaryColor : Colors.grey,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: Text(
                      (loc['name'] ?? 'L').substring(0, 1).toUpperCase(),
                      style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(loc['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppTheme.textPrimary)),
                      if ((loc['code'] ?? '').isNotEmpty)
                        Text('Code: ${loc['code']}', style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isActive ? AppTheme.accentColor.withValues(alpha: 0.1) : Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    status.toUpperCase(),
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: isActive ? AppTheme.accentColor : Colors.grey.shade600),
                  ),
                ),
              ],
            ),
          ),
          // ── Details ─────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                if ((loc['address'] ?? '').isNotEmpty)
                  _detailRow(Icons.home_outlined, 'Address', loc['address']),
                if (subtitle.isNotEmpty)
                  _detailRow(Icons.location_city_outlined, 'City / State', subtitle),
                if ((loc['country'] ?? '').isNotEmpty)
                  _detailRow(Icons.flag_outlined, 'Country', loc['country']),
                if (hasCoords)
                  _detailRow(Icons.gps_fixed, 'Coordinates',
                    '${double.parse(loc['latitude']).toStringAsFixed(5)}, ${double.parse(loc['longitude']).toStringAsFixed(5)}'),

                const SizedBox(height: 10),
                Row(
                  children: [
                    if (hasCoords)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.gps_fixed, size: 12, color: Colors.green.shade700),
                          const SizedBox(width: 4),
                          Text('GPS Mapped', style: TextStyle(fontSize: 10, color: Colors.green.shade700, fontWeight: FontWeight.w600)),
                        ]),
                      )
                    else
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(8)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.gps_off, size: 12, color: Colors.orange.shade700),
                          const SizedBox(width: 4),
                          Text('No GPS', style: TextStyle(fontSize: 10, color: Colors.orange.shade700, fontWeight: FontWeight.w600)),
                        ]),
                      ),
                    const Spacer(),
                    // Edit
                    IconButton(
                      onPressed: () => _openForm(existing: loc),
                      icon: const Icon(Icons.edit_outlined, size: 20, color: AppTheme.primaryColor),
                      tooltip: 'Edit',
                      padding: const EdgeInsets.all(6),
                      constraints: const BoxConstraints(),
                    ),
                    const SizedBox(width: 4),
                    // Delete
                    IconButton(
                      onPressed: () => _delete(loc['id'], loc['name'] ?? ''),
                      icon: const Icon(Icons.delete_outline, size: 20, color: AppTheme.errorColor),
                      tooltip: 'Delete',
                      padding: const EdgeInsets.all(6),
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _detailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: AppTheme.primaryColor),
          const SizedBox(width: 8),
          Expanded(
            child: RichText(
              text: TextSpan(
                children: [
                  TextSpan(text: '$label: ', style: TextStyle(fontSize: 12, color: Colors.grey.shade600, fontFamily: 'Roboto')),
                  TextSpan(text: value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppTheme.textPrimary, fontFamily: 'Roboto')),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCATION FORM SCREEN (Add / Edit)
// ═══════════════════════════════════════════════════════════════════════════════
class _LocationFormScreen extends StatefulWidget {
  final Map<String, dynamic>? existing;
  const _LocationFormScreen({this.existing});

  @override
  State<_LocationFormScreen> createState() => _LocationFormScreenState();
}

class _LocationFormScreenState extends State<_LocationFormScreen> {
  final ApiClient _api = ApiClient();
  final _formKey = GlobalKey<FormState>();
  bool _isSaving = false;

  bool get _isEditing => widget.existing != null;

  final _nameCtrl     = TextEditingController();
  final _codeCtrl     = TextEditingController();
  final _addressCtrl  = TextEditingController();
  final _cityCtrl     = TextEditingController();
  final _districtCtrl = TextEditingController();
  final _latCtrl      = TextEditingController();
  final _lngCtrl      = TextEditingController();
  String _state   = '';
  String _country = 'India';
  String _status  = 'active';

  static const _indianStates = [
    'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
    'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
    'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
    'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
    'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
    'Andaman and Nicobar Islands','Chandigarh','Dadra & Nagar Haveli','Daman & Diu',
    'Delhi','Jammu & Kashmir','Ladakh','Lakshadweep','Puducherry',
  ];

  @override
  void initState() {
    super.initState();
    if (_isEditing) {
      final e = widget.existing!;
      _nameCtrl.text     = e['name'] ?? '';
      _codeCtrl.text     = e['code'] ?? '';
      _addressCtrl.text  = e['address'] ?? '';
      _cityCtrl.text     = e['city'] ?? '';
      _districtCtrl.text = e['district'] ?? '';
      _latCtrl.text      = e['latitude'] ?? '';
      _lngCtrl.text      = e['longitude'] ?? '';
      _state             = e['state'] ?? '';
      _country           = e['country'] ?? 'India';
      _status            = e['status'] ?? 'active';
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose(); _codeCtrl.dispose(); _addressCtrl.dispose();
    _cityCtrl.dispose(); _districtCtrl.dispose(); _latCtrl.dispose();
    _lngCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSaving = true);
    try {
      final data = {
        'name': _nameCtrl.text.trim(),
        'code': _codeCtrl.text.trim().isNotEmpty ? _codeCtrl.text.trim() : null,
        'address': _addressCtrl.text.trim().isNotEmpty ? _addressCtrl.text.trim() : null,
        'city': _cityCtrl.text.trim().isNotEmpty ? _cityCtrl.text.trim() : null,
        'district': _districtCtrl.text.trim().isNotEmpty ? _districtCtrl.text.trim() : null,
        'state': _state.isNotEmpty ? _state : null,
        'country': _country,
        'latitude': _latCtrl.text.trim().isNotEmpty ? _latCtrl.text.trim() : null,
        'longitude': _lngCtrl.text.trim().isNotEmpty ? _lngCtrl.text.trim() : null,
        'status': _status,
      };
      if (_isEditing) {
        await _api.dio.put('/api/mobile/locations/${widget.existing!['id']}', data: data);
      } else {
        await _api.dio.post('/api/mobile/locations', data: data);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Location ${_isEditing ? "updated" : "created"} successfully!'),
          backgroundColor: AppTheme.accentColor,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ));
        Navigator.pop(context, true);
      }
    } catch (e) {
      String msg = 'Failed to save';
      if (e is DioException) msg = e.response?.data?['error'] ?? msg;
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppTheme.errorColor,
        behavior: SnackBarBehavior.floating,
      ));
    }
    if (mounted) setState(() => _isSaving = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: Text(_isEditing ? 'Edit Location' : 'Add Location'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        titleTextStyle: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              // ── Basic Details ──────────────────────────────────
              _card('Basic Details', Icons.location_on_outlined, AppTheme.primaryColor, [
                _field(_nameCtrl, 'Location Name *', Icons.business_outlined, required: true),
                _field(_codeCtrl, 'Location Code', Icons.tag_outlined),
                _dropdown('Status', Icons.toggle_on_outlined, [
                  const DropdownMenuItem(value: 'active', child: Text('Active')),
                  const DropdownMenuItem(value: 'inactive', child: Text('Inactive')),
                ], _status, (v) => setState(() => _status = v ?? 'active')),
              ]),

              // ── Address ───────────────────────────────────────
              _card('Address', Icons.home_outlined, const Color(0xFF0694A2), [
                _field(_addressCtrl, 'Street Address', Icons.streetview_outlined, maxLines: 2),
                _field(_cityCtrl, 'City', Icons.location_city_outlined),
                _field(_districtCtrl, 'District', Icons.map_outlined),
                DropdownButtonFormField<String>(
                  value: _state.isEmpty ? null : _state,
                  isExpanded: true,
                  decoration: _inputDeco('State', Icons.flag_outlined),
                  items: _indianStates.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                  onChanged: (v) => setState(() => _state = v ?? ''),
                ),
                TextFormField(
                  initialValue: _country,
                  onChanged: (v) => _country = v,
                  decoration: _inputDeco('Country', Icons.public_outlined),
                ),
              ]),

              // ── GPS Coordinates ───────────────────────────────
              _card('GPS Coordinates', Icons.gps_fixed, const Color(0xFF4CAF50), [
                Container(
                  padding: const EdgeInsets.all(10),
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.blue.shade100),
                  ),
                  child: Row(children: [
                    Icon(Icons.info_outline, size: 16, color: Colors.blue.shade700),
                    const SizedBox(width: 8),
                    Expanded(child: Text('Optional — enter coordinates if this location needs GPS-based attendance tracking.',
                        style: TextStyle(fontSize: 12, color: Colors.blue.shade800))),
                  ]),
                ),
                Row(children: [
                  Expanded(child: _coordField(_latCtrl, 'Latitude', 'e.g. 28.6139')),
                  const SizedBox(width: 10),
                  Expanded(child: _coordField(_lngCtrl, 'Longitude', 'e.g. 77.2090')),
                ]),
              ]),

              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: _isSaving ? null : _save,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 2,
                  ),
                  icon: _isSaving
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Icon(_isEditing ? Icons.save_rounded : Icons.add_location_alt_rounded),
                  label: Text(_isSaving ? 'Saving…' : (_isEditing ? 'Update Location' : 'Create Location'),
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _card(String title, IconData icon, Color color, List<Widget> children) {
    final spaced = <Widget>[];
    for (int i = 0; i < children.length; i++) {
      spaced.add(children[i]);
      if (i < children.length - 1) spaced.add(const SizedBox(height: 12));
    }
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
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
              Container(padding: const EdgeInsets.all(6), decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
                  child: Icon(icon, color: color, size: 18)),
              const SizedBox(width: 10),
              Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: color)),
            ]),
          ),
          Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: spaced)),
        ],
      ),
    );
  }

  InputDecoration _inputDeco(String label, IconData icon) => InputDecoration(
    labelText: label,
    prefixIcon: Icon(icon, size: 20, color: AppTheme.primaryColor),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primaryColor, width: 1.5)),
    filled: true, fillColor: Colors.grey.shade50,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
  );

  Widget _field(TextEditingController ctrl, String label, IconData icon, {
    TextInputType? keyboardType, int maxLines = 1, bool required = false,
    String? initialValue, ValueChanged<String>? onChanged,
  }) {
    if (initialValue != null && ctrl.text != initialValue) ctrl.text = initialValue;
    return TextFormField(
      controller: ctrl,
      keyboardType: keyboardType,
      maxLines: maxLines,
      onChanged: onChanged,
      decoration: _inputDeco(label, icon),
      validator: required ? (v) => (v == null || v.trim().isEmpty) ? '$label is required' : null : null,
    );
  }

  Widget _coordField(TextEditingController ctrl, String label, String hint) {
    return TextFormField(
      controller: ctrl,
      keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
      decoration: _inputDeco(label, Icons.gps_fixed).copyWith(hintText: hint),
      validator: (v) {
        if (v == null || v.trim().isEmpty) return null;
        if (double.tryParse(v.trim()) == null) return 'Invalid number';
        return null;
      },
    );
  }

  Widget _dropdown(String label, IconData icon, List<DropdownMenuItem<String>> items, String value, ValueChanged<String?> onChanged) {
    return DropdownButtonFormField<String>(
      value: value,
      isExpanded: true,
      decoration: _inputDeco(label, icon),
      items: items,
      onChanged: onChanged,
    );
  }
}
