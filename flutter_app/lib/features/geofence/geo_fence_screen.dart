import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:dio/dio.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class GeoFenceScreen extends StatefulWidget {
  const GeoFenceScreen({super.key});
  @override
  State<GeoFenceScreen> createState() => _GeoFenceScreenState();
}

class _GeoFenceScreenState extends State<GeoFenceScreen> with SingleTickerProviderStateMixin {
  final ApiClient _api = ApiClient();

  // ── Form controllers ──────────────────────────────────────────────────────
  final _latCtrl = TextEditingController();
  final _lngCtrl = TextEditingController();

  // ── State ─────────────────────────────────────────────────────────────────
  bool _isLoading       = true;
  bool _isSaving        = false;
  bool _isGpsCapturing  = false;

  double _radius           = 100;
  bool   _gpsEnabled       = true;
  bool   _faceEnabled      = true;
  bool   _locationSet      = false;

  String _companyName  = '';
  String _savedAddress = '';

  // ── Animation ─────────────────────────────────────────────────────────────
  late AnimationController _pulseCtrl;
  late Animation<double>   _pulseAnim;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat(reverse: true);
    _pulseAnim = Tween<double>(begin: 0.85, end: 1.0).animate(CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut));
    _loadSettings();
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    _latCtrl.dispose();
    _lngCtrl.dispose();
    super.dispose();
  }

  // ── Load current settings ─────────────────────────────────────────────────
  Future<void> _loadSettings() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.dio.get('/api/mobile/office-location');
      final data = res.data as Map<String, dynamic>;
      setState(() {
        _companyName = data['companyName'] ?? '';
        if (data['officeLatitude'] != null && data['officeLongitude'] != null) {
          _latCtrl.text = data['officeLatitude'].toString();
          _lngCtrl.text = data['officeLongitude'].toString();
          _locationSet  = true;
        }
        _radius      = ((data['officeRadiusMeters'] as num?)?.toDouble() ?? 100).clamp(50, 2000);
        _gpsEnabled  = data['gpsVerificationEnabled']  ?? true;
        _faceEnabled = data['faceVerificationEnabled'] ?? true;
        _isLoading   = false;
      });
    } catch (_) {
      setState(() => _isLoading = false);
    }
  }

  // ── Use current GPS position as office location ───────────────────────────
  Future<void> _useMyLocation() async {
    setState(() => _isGpsCapturing = true);
    try {
      bool svcEnabled = await Geolocator.isLocationServiceEnabled();
      if (!svcEnabled) { _snack('GPS service disabled. Enable in settings.', error: true); return; }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
        if (perm == LocationPermission.denied) { _snack('Location permission denied.', error: true); return; }
      }
      if (perm == LocationPermission.deniedForever) { _snack('Enable location in device Settings.', error: true); return; }

      _snack('Acquiring GPS signal…');
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      ).timeout(const Duration(seconds: 25), onTimeout: () => throw Exception('GPS timed out after 25 seconds.'));

      setState(() {
        _latCtrl.text = position.latitude.toStringAsFixed(7);
        _lngCtrl.text = position.longitude.toStringAsFixed(7);
        _locationSet  = true;
      });
      _snack('Location captured: ${position.latitude.toStringAsFixed(5)}, ${position.longitude.toStringAsFixed(5)}');
    } catch (e) {
      _snack('Failed to get location: $e', error: true);
    }
    if (mounted) setState(() => _isGpsCapturing = false);
  }

  // ── Clear location ────────────────────────────────────────────────────────
  void _clearLocation() {
    setState(() {
      _latCtrl.clear();
      _lngCtrl.clear();
      _locationSet = false;
    });
  }

  // ── Save settings ─────────────────────────────────────────────────────────
  Future<void> _save() async {
    final latText = _latCtrl.text.trim();
    final lngText = _lngCtrl.text.trim();

    double? lat, lng;
    if (latText.isNotEmpty || lngText.isNotEmpty) {
      lat = double.tryParse(latText);
      lng = double.tryParse(lngText);
      if (lat == null || lng == null) { _snack('Invalid coordinates. Enter valid numbers.', error: true); return; }
      if (lat < -90 || lat > 90)     { _snack('Latitude must be between -90 and 90.',       error: true); return; }
      if (lng < -180 || lng > 180)   { _snack('Longitude must be between -180 and 180.',     error: true); return; }
    }

    setState(() => _isSaving = true);
    try {
      await _api.dio.patch('/api/mobile/office-location', data: {
        if (lat != null) 'officeLatitude':  lat,
        if (lng != null) 'officeLongitude': lng,
        if (lat == null && latText.isEmpty) 'officeLatitude':  null,
        if (lng == null && lngText.isEmpty) 'officeLongitude': null,
        'officeRadiusMeters':      _radius.round(),
        'faceVerificationEnabled': _faceEnabled,
        'gpsVerificationEnabled':  _gpsEnabled,
      });
      if (mounted) _snack('Geo-fence settings saved successfully ✓');
    } catch (e) {
      String msg = 'Failed to save settings';
      if (e is DioException && e.response?.data != null) msg = e.response!.data['error'] ?? msg;
      if (mounted) _snack(msg, error: true);
    }
    if (mounted) setState(() => _isSaving = false);
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

  // ── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryColor,
        title: const Text('Geo-Fence Setup', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _loadSettings)],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                _headerCard(),
                const SizedBox(height: 16),
                _geoFenceVisual(),
                const SizedBox(height: 16),
                _locationCard(),
                const SizedBox(height: 12),
                _radiusCard(),
                const SizedBox(height: 12),
                _verificationToggles(),
                const SizedBox(height: 20),
                _saveButton(),
                const SizedBox(height: 12),
              ]),
            ),
    );
  }

  // ── Header card ───────────────────────────────────────────────────────────
  Widget _headerCard() => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      gradient: LinearGradient(colors: [AppTheme.primaryColor, AppTheme.primaryColor.withValues(alpha: 0.8)], begin: Alignment.topLeft, end: Alignment.bottomRight),
      borderRadius: BorderRadius.circular(14),
      boxShadow: [BoxShadow(color: AppTheme.primaryColor.withValues(alpha: 0.3), blurRadius: 10, offset: const Offset(0, 4))],
    ),
    child: Row(children: [
      Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle),
          child: const Icon(Icons.location_city, color: Colors.white, size: 28)),
      const SizedBox(width: 14),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(_companyName.isNotEmpty ? _companyName : 'Office Geo-Fence', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 2),
        Text('Define office boundary for attendance tracking', style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 12)),
      ])),
    ]),
  );

  // ── Visual geo-fence radar ────────────────────────────────────────────────
  Widget _geoFenceVisual() {
    final hasLoc = _locationSet && _latCtrl.text.isNotEmpty && _lngCtrl.text.isNotEmpty;
    return Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))]),
      padding: const EdgeInsets.all(16),
      child: Column(children: [
        const Text('Geo-Fence Preview', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        const SizedBox(height: 12),
        SizedBox(
          height: 200,
          child: AnimatedBuilder(
            animation: _pulseAnim,
            builder: (_, __) => CustomPaint(
              painter: _GeoFencePainter(
                hasLocation: hasLoc,
                radiusLabel: '${_radius.round()}m',
                pulseScale: _pulseAnim.value,
                gpsEnabled: _gpsEnabled,
              ),
              child: Container(),
            ),
          ),
        ),
        const SizedBox(height: 8),
        if (hasLoc) ...[
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Icon(Icons.location_on, size: 14, color: Colors.red),
            const SizedBox(width: 4),
            Text(
              '${double.parse(_latCtrl.text).toStringAsFixed(5)}, ${double.parse(_lngCtrl.text).toStringAsFixed(5)}',
              style: TextStyle(fontSize: 12, color: Colors.grey[700], fontWeight: FontWeight.w500),
            ),
          ]),
        ] else
          Text('No office location set', style: TextStyle(fontSize: 12, color: Colors.grey[500])),
      ]),
    );
  }

  // ── Location card ─────────────────────────────────────────────────────────
  Widget _locationCard() => _card(
    title: 'Office Location',
    icon: Icons.pin_drop,
    iconColor: Colors.red,
    child: Column(children: [
      // GPS capture button
      SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: _isGpsCapturing ? null : _useMyLocation,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primaryColor,
            padding: const EdgeInsets.symmetric(vertical: 13),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          icon: _isGpsCapturing
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.my_location, color: Colors.white, size: 20),
          label: Text(
            _isGpsCapturing ? 'Getting Location…' : 'Use My Current Location',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          ),
        ),
      ),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: const Divider()),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 10), child: Text('or enter manually', style: TextStyle(fontSize: 12, color: Colors.grey[500]))),
        Expanded(child: const Divider()),
      ]),
      const SizedBox(height: 12),
      // Manual coordinate fields
      Row(children: [
        Expanded(child: _coordField(_latCtrl, 'Latitude', 'e.g. 28.61390')),
        const SizedBox(width: 10),
        Expanded(child: _coordField(_lngCtrl, 'Longitude', 'e.g. 77.20900')),
      ]),
      const SizedBox(height: 10),
      // Validate & preview button
      Row(children: [
        Expanded(child: OutlinedButton.icon(
          onPressed: () {
            final lat = double.tryParse(_latCtrl.text);
            final lng = double.tryParse(_lngCtrl.text);
            if (lat != null && lng != null) {
              setState(() => _locationSet = true);
              _snack('Coordinates set ✓');
            } else {
              _snack('Enter valid latitude and longitude first.', error: true);
            }
          },
          style: OutlinedButton.styleFrom(
            foregroundColor: AppTheme.primaryColor,
            side: BorderSide(color: AppTheme.primaryColor),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            padding: const EdgeInsets.symmetric(vertical: 11),
          ),
          icon: const Icon(Icons.check_circle_outline, size: 18),
          label: const Text('Set Location', style: TextStyle(fontWeight: FontWeight.w600)),
        )),
        const SizedBox(width: 10),
        OutlinedButton.icon(
          onPressed: _clearLocation,
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.red,
            side: const BorderSide(color: Colors.red),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 14),
          ),
          icon: const Icon(Icons.clear, size: 18),
          label: const Text('Clear'),
        ),
      ]),
    ]),
  );

  Widget _coordField(TextEditingController ctrl, String label, String hint) {
    return TextField(
      controller: ctrl,
      keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[-0-9.]'))],
      onChanged: (_) => setState(() => _locationSet = false),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        hintStyle: TextStyle(fontSize: 11, color: Colors.grey[400]),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        isDense: true,
      ),
    );
  }

  // ── Radius card ───────────────────────────────────────────────────────────
  Widget _radiusCard() => _card(
    title: 'Geo-Fence Radius',
    icon: Icons.radar,
    iconColor: Colors.blue,
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text('Radius', style: TextStyle(color: Colors.grey[600], fontSize: 13)),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
          decoration: BoxDecoration(color: AppTheme.primaryColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20)),
          child: Text('${_radius.round()} m', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppTheme.primaryColor)),
        ),
      ]),
      const SizedBox(height: 8),
      SliderTheme(
        data: SliderTheme.of(context).copyWith(
          activeTrackColor: AppTheme.primaryColor,
          thumbColor: AppTheme.primaryColor,
          overlayColor: AppTheme.primaryColor.withValues(alpha: 0.1),
          inactiveTrackColor: Colors.grey[200],
          trackHeight: 5,
          thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 10),
        ),
        child: Slider(
          value: _radius,
          min: 50,
          max: 2000,
          divisions: 78,  // steps of ~25m
          onChanged: (v) => setState(() => _radius = v.roundToDouble()),
        ),
      ),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text('50m', style: TextStyle(fontSize: 11, color: Colors.grey[500])),
        Text('500m', style: TextStyle(fontSize: 11, color: Colors.grey[500])),
        Text('1000m', style: TextStyle(fontSize: 11, color: Colors.grey[500])),
        Text('2000m', style: TextStyle(fontSize: 11, color: Colors.grey[500])),
      ]),
      const SizedBox(height: 8),
      // Quick presets
      Wrap(spacing: 8, children: [50, 100, 200, 500, 1000].map((v) {
        final selected = _radius.round() == v;
        return ChoiceChip(
          label: Text('${v}m'),
          selected: selected,
          onSelected: (_) => setState(() => _radius = v.toDouble()),
          selectedColor: AppTheme.primaryColor,
          labelStyle: TextStyle(color: selected ? Colors.white : Colors.black87, fontSize: 12, fontWeight: FontWeight.w600),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
        );
      }).toList()),
    ]),
  );

  // ── Verification toggles ──────────────────────────────────────────────────
  Widget _verificationToggles() => _card(
    title: 'Verification Settings',
    icon: Icons.verified_user,
    iconColor: Colors.green,
    child: Column(children: [
      _toggle(
        icon: Icons.location_on,
        iconColor: Colors.blue,
        title: 'GPS Geo-Fence Verification',
        subtitle: 'Employees must be within radius to clock in/out',
        value: _gpsEnabled,
        onChanged: (v) => setState(() => _gpsEnabled = v),
      ),
      const Divider(height: 20),
      _toggle(
        icon: Icons.face,
        iconColor: Colors.purple,
        title: 'Face Verification',
        subtitle: 'Camera opens automatically on punch',
        value: _faceEnabled,
        onChanged: (v) => setState(() => _faceEnabled = v),
      ),
      if (!_gpsEnabled && !_faceEnabled) ...[
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.orange.shade200)),
          child: Row(children: [
            Icon(Icons.warning_amber, color: Colors.orange.shade700, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text('Both verifications disabled — attendance can be marked without checks.', style: TextStyle(fontSize: 12, color: Colors.orange.shade800))),
          ]),
        ),
      ],
    ]),
  );

  Widget _toggle({required IconData icon, required Color iconColor, required String title, required String subtitle, required bool value, required ValueChanged<bool> onChanged}) {
    return Row(children: [
      Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: iconColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, color: iconColor, size: 20)),
      const SizedBox(width: 12),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        Text(subtitle, style: TextStyle(fontSize: 11, color: Colors.grey[600])),
      ])),
      Switch(
        value: value,
        onChanged: onChanged,
        activeColor: AppTheme.primaryColor,
      ),
    ]);
  }

  // ── Save button ───────────────────────────────────────────────────────────
  Widget _saveButton() => SizedBox(
    height: 52,
    child: ElevatedButton.icon(
      onPressed: _isSaving ? null : _save,
      style: ElevatedButton.styleFrom(
        backgroundColor: AppTheme.accentColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
        elevation: 2,
      ),
      icon: _isSaving
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
          : const Icon(Icons.save_alt_rounded, color: Colors.white),
      label: Text(
        _isSaving ? 'Saving…' : 'Save Geo-Fence Settings',
        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
  );

  // ── Reusable card ─────────────────────────────────────────────────────────
  Widget _card({required String title, required IconData icon, required Color iconColor, required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))]),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(padding: const EdgeInsets.all(6), decoration: BoxDecoration(color: iconColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
              child: Icon(icon, color: iconColor, size: 18)),
          const SizedBox(width: 10),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        ]),
        const SizedBox(height: 14),
        child,
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GEO-FENCE VISUAL PAINTER
// ═══════════════════════════════════════════════════════════════════════════════
class _GeoFencePainter extends CustomPainter {
  final bool   hasLocation;
  final String radiusLabel;
  final double pulseScale;
  final bool   gpsEnabled;

  const _GeoFencePainter({
    required this.hasLocation,
    required this.radiusLabel,
    required this.pulseScale,
    required this.gpsEnabled,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final cx  = size.width  / 2;
    final cy  = size.height / 2;
    final maxR = min(cx, cy) - 10;

    // ── Grid rings ─────────────────────────────────────────────────────────
    final gridPaint = Paint()
      ..color = Colors.grey.shade200
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    for (int i = 1; i <= 4; i++) {
      canvas.drawCircle(Offset(cx, cy), maxR * i / 4, gridPaint);
    }
    canvas.drawLine(Offset(0, cy),         Offset(size.width, cy), gridPaint);
    canvas.drawLine(Offset(cx, 0),         Offset(cx, size.height), gridPaint);

    if (!hasLocation) {
      final tp = TextPainter(
        text: const TextSpan(text: 'No office location set', style: TextStyle(color: Colors.grey, fontSize: 13)),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(cx - tp.width / 2, cy - tp.height / 2));
      return;
    }

    final fenceR      = maxR * 0.65;
    final borderColor = gpsEnabled ? const Color(0xFF1565C0) : Colors.grey;

    // ── Pulse ring ─────────────────────────────────────────────────────────
    if (gpsEnabled) {
      canvas.drawCircle(Offset(cx, cy), fenceR * pulseScale,
          Paint()..color = borderColor.withValues(alpha: 0.07)..style = PaintingStyle.fill);
    }

    // ── Geo-fence fill ──────────────────────────────────────────────────────
    canvas.drawCircle(Offset(cx, cy), fenceR,
        Paint()..color = borderColor.withValues(alpha: 0.07)..style = PaintingStyle.fill);

    // ── Dashed border (manual) ──────────────────────────────────────────────
    _drawDashedCircle(canvas, Offset(cx, cy), fenceR, borderColor.withValues(alpha: 0.7), 2, 10, 6);

    // ── Office pin background ──────────────────────────────────────────────
    canvas.drawCircle(Offset(cx, cy), 18, Paint()..color = Colors.white..style = PaintingStyle.fill);
    canvas.drawCircle(Offset(cx, cy), 18, Paint()..color = Colors.red..style = PaintingStyle.stroke..strokeWidth = 2);

    // ── Simple building icon ───────────────────────────────────────────────
    final bPaint = Paint()..color = Colors.red..style = PaintingStyle.fill;
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(cx, cy + 3), width: 14, height: 11), const Radius.circular(1)), bPaint);
    canvas.drawPath(Path()..moveTo(cx - 9, cy - 3)..lineTo(cx, cy - 11)..lineTo(cx + 9, cy - 3)..close(), bPaint);
    canvas.drawRect(Rect.fromCenter(center: Offset(cx, cy + 6), width: 4, height: 5), Paint()..color = Colors.white..style = PaintingStyle.fill);

    // ── Radius label ────────────────────────────────────────────────────────
    final lp = TextPainter(
      text: TextSpan(text: ' $radiusLabel ', style: TextStyle(color: borderColor, fontSize: 11, fontWeight: FontWeight.bold)),
      textDirection: TextDirection.ltr,
    )..layout();
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(cx + fenceR + 4, cy - lp.height / 2, lp.width, lp.height), const Radius.circular(3)),
      Paint()..color = Colors.white..style = PaintingStyle.fill,
    );
    lp.paint(canvas, Offset(cx + fenceR + 4, cy - lp.height / 2));

    // ── Cardinal labels ─────────────────────────────────────────────────────
    _label(canvas, 'N', Offset(cx, cy - maxR + 6));
    _label(canvas, 'S', Offset(cx, cy + maxR - 6));
    _label(canvas, 'E', Offset(cx + maxR - 6, cy));
    _label(canvas, 'W', Offset(cx - maxR + 6, cy));
  }

  void _drawDashedCircle(Canvas canvas, Offset center, double radius, Color color, double strokeWidth, double dashLen, double gapLen) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = strokeWidth
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final circumference = 2 * pi * radius;
    final total         = dashLen + gapLen;
    final count         = (circumference / total).floor();
    final step          = 2 * pi / count;
    final dashAngle     = (dashLen / circumference) * 2 * pi;

    for (int i = 0; i < count; i++) {
      final startAngle = i * step - pi / 2;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle, dashAngle, false, paint,
      );
    }
  }

  void _label(Canvas canvas, String text, Offset pos) {
    final p = TextPainter(
      text: TextSpan(text: text, style: TextStyle(color: Colors.grey.shade500, fontSize: 10, fontWeight: FontWeight.w500)),
      textDirection: TextDirection.ltr,
    )..layout();
    p.paint(canvas, pos - Offset(p.width / 2, p.height / 2));
  }

  @override
  bool shouldRepaint(_GeoFencePainter old) =>
      old.hasLocation != hasLocation || old.pulseScale != pulseScale ||
      old.gpsEnabled  != gpsEnabled  || old.radiusLabel != radiusLabel;
}
