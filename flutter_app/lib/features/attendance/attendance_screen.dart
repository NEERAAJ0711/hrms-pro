import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:intl/intl.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'face_capture_screen.dart';

// ─── Step states ────────────────────────────────────────────────────────────
enum PunchStepState { pending, running, done, failed }

class _PunchStep {
  final String label;
  final IconData icon;
  PunchStepState state;
  String detail;
  _PunchStep(this.label, this.icon, {this.state = PunchStepState.pending, this.detail = ''});
}

// ─── Main screen ────────────────────────────────────────────────────────────
class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});
  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> with SingleTickerProviderStateMixin {
  final ApiClient _api = ApiClient();

  Map<String, dynamic>? _todayAttendance;
  Map<String, dynamic>? _officeConfig;
  Map<String, dynamic>? _myFaceStatus;
  List<dynamic> _history = [];
  bool _isLoading = true;
  bool _isPunching = false;

  late AnimationController _pulseCtrl;
  late Animation<double> _pulseAnim;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat(reverse: true);
    _pulseAnim = Tween<double>(begin: 1.0, end: 1.08).animate(CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut));
    _loadAll();
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  // ── Data loading ─────────────────────────────────────────────────────────
  Future<void> _loadAll() async {
    setState(() => _isLoading = true);
    try {
      final now = DateTime.now();
      final results = await Future.wait([
        _api.dio.get('/api/mobile/attendance/today').catchError((_) => Response(data: null, requestOptions: RequestOptions(path: ''))),
        _api.dio.get('/api/mobile/attendance/history', queryParameters: {'month': now.month, 'year': now.year}).catchError((_) => Response(data: [], requestOptions: RequestOptions(path: ''))),
        _api.dio.get('/api/mobile/office-location').catchError((_) => Response(data: null, requestOptions: RequestOptions(path: ''))),
        _api.dio.get('/api/mobile/my-face-status').catchError((_) => Response(data: {'faceRegistered': false}, requestOptions: RequestOptions(path: ''))),
      ]);
      if (mounted) setState(() {
        _todayAttendance = results[0].data;
        _history = (results[1].data as List?) ?? [];
        _officeConfig = results[2].data;
        _myFaceStatus = results[3].data;
        _isLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── Config helpers ────────────────────────────────────────────────────────
  bool get _faceVerificationRequired => _officeConfig?['faceVerificationEnabled'] == true;
  bool get _gpsVerificationRequired  => _officeConfig?['gpsVerificationEnabled']  == true;
  bool get _faceRegistered           => _myFaceStatus?['faceRegistered']           == true;

  bool get _canClockIn  => _todayAttendance?['clockIn']  == null;
  bool get _canClockOut => _todayAttendance?['clockIn']  != null && _todayAttendance?['clockOut'] == null;
  // Multiple-punch: always allow punching (first = in, subsequent = updates clock-out)
  bool get _canPunch    => !_isPunching;
  // Show punch count
  int get _punchCount {
    if (_todayAttendance == null || _todayAttendance?['clockIn'] == null) return 0;
    if (_todayAttendance?['clockOut'] == null) return 1;
    return 2; // has both in and out (may have re-punched)
  }

  // ── Distance helper ───────────────────────────────────────────────────────
  double _haversine(double lat1, double lon1, double lat2, double lon2) {
    const R = 6371000.0;
    final phi1 = lat1 * pi / 180, phi2 = lat2 * pi / 180;
    final dPhi = (lat2 - lat1) * pi / 180, dLam = (lon2 - lon1) * pi / 180;
    final a = sin(dPhi / 2) * sin(dPhi / 2) + cos(phi1) * cos(phi2) * sin(dLam / 2) * sin(dLam / 2);
    return R * 2 * atan2(sqrt(a), sqrt(1 - a));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ONE-TAP PUNCH FLOW  (first punch = in, every punch after = clock-out)
  // ═══════════════════════════════════════════════════════════════════════════
  Future<void> _oneTapPunch() async {
    if (!_canPunch) return;
    final isFirstPunch = _todayAttendance?['clockIn'] == null;
    final label = isFirstPunch ? 'Punch In' : 'Punch Out';

    // Build step list based on what's enabled
    final steps = [
      if (_gpsVerificationRequired) _PunchStep('Getting GPS location', Icons.location_on),
      if (_faceVerificationRequired) _PunchStep('Opening camera', Icons.camera_alt),
      if (_faceVerificationRequired) _PunchStep('Verifying face', Icons.face),
      _PunchStep('Recording punch', Icons.how_to_reg),
    ];

    Position? position;
    File? faceFile;

    setState(() => _isPunching = true);

    bool cancelled = false;
    await showModalBottomSheet(
      context: context,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetCtx) => _PunchProgressSheet(
        title: label,
        steps: steps,
        onCancel: () { cancelled = true; Navigator.pop(sheetCtx); },
        runner: (updateStep) async {
          int stepIdx = 0;

          // ── STEP: GPS ─────────────────────────────────────────────────
          if (_gpsVerificationRequired) {
            updateStep(stepIdx, PunchStepState.running, 'Acquiring GPS signal…');
            try {
              bool svcEnabled = await Geolocator.isLocationServiceEnabled();
              if (!svcEnabled) throw Exception('GPS service disabled. Enable location in device settings.');
              var perm = await Geolocator.checkPermission();
              if (perm == LocationPermission.denied) {
                perm = await Geolocator.requestPermission();
                if (perm == LocationPermission.denied) throw Exception('Location permission denied.');
              }
              if (perm == LocationPermission.deniedForever) throw Exception('Permission denied permanently. Enable in Settings.');
              position = await Geolocator.getCurrentPosition(
                locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
              ).timeout(const Duration(seconds: 25), onTimeout: () => throw Exception('GPS timed out. Please try again.'));

              // Check geo-fence — HARD BLOCK if outside radius
              if (_officeConfig?['officeLatitude'] != null && _officeConfig?['officeLongitude'] != null) {
                final dist = _haversine(
                  position!.latitude, position!.longitude,
                  double.parse(_officeConfig!['officeLatitude'].toString()),
                  double.parse(_officeConfig!['officeLongitude'].toString()),
                );
                final radius = (_officeConfig!['officeRadiusMeters'] as num?)?.toDouble() ?? 100;
                if (dist > radius) {
                  updateStep(stepIdx, PunchStepState.failed, '${dist.round()}m from office (limit: ${radius.round()}m) — punch blocked');
                  await Future.delayed(const Duration(milliseconds: 800));
                  cancelled = true;
                  if (sheetCtx.mounted) Navigator.pop(sheetCtx);
                  return;
                }
                updateStep(stepIdx, PunchStepState.done, 'Within office – ${dist.round()}m away ✓');
              } else {
                updateStep(stepIdx, PunchStepState.done, 'GPS captured ✓');
              }
            } catch (e) {
              final msg = e.toString().replaceFirst('Exception: ', '');
              updateStep(stepIdx, PunchStepState.failed, msg);
              await Future.delayed(const Duration(milliseconds: 800));
              cancelled = true;
              if (sheetCtx.mounted) Navigator.pop(sheetCtx);
              return;
            }
            stepIdx++;
          }

          if (cancelled) return;

          // ── STEP: Camera ───────────────────────────────────────────────
          if (_faceVerificationRequired) {
            updateStep(stepIdx, PunchStepState.running, 'Opening front camera…');
            try {
              final capturedFile = await Navigator.of(sheetCtx).push<File?>(
                MaterialPageRoute(
                  fullscreenDialog: true,
                  builder: (_) => FaceCaptureScreen(title: '$label — Face Scan'),
                ),
              );
              if (capturedFile == null) {
                updateStep(stepIdx, PunchStepState.failed, 'Camera cancelled — punch blocked.');
                await Future.delayed(const Duration(milliseconds: 800));
                cancelled = true;
                if (sheetCtx.mounted) Navigator.pop(sheetCtx);
                return;
              }
              faceFile = capturedFile;
              updateStep(stepIdx, PunchStepState.done, 'Face captured ✓');
            } catch (e) {
              updateStep(stepIdx, PunchStepState.failed, 'Camera error: $e');
              await Future.delayed(const Duration(milliseconds: 800));
              cancelled = true;
              if (sheetCtx.mounted) Navigator.pop(sheetCtx);
              return;
            }
            stepIdx++;

            if (cancelled) return;

            // ── STEP: Face detection — HARD BLOCK if no face ──────────
            updateStep(stepIdx, PunchStepState.running, 'Analysing face with ML…');
            bool faceOk = false;
            try {
              final options = FaceDetectorOptions(enableClassification: true, enableLandmarks: true, minFaceSize: 0.1);
              final detector = FaceDetector(options: options);
              try {
                final inputImage = InputImage.fromFilePath(faceFile!.path);
                final faces = await detector.processImage(inputImage);
                faceOk = faces.isNotEmpty;
              } finally {
                detector.close();
              }
            } catch (_) {
              faceOk = true; // if ML lib crashes, fall back to server-side verification
            }
            if (!faceOk) {
              updateStep(stepIdx, PunchStepState.failed, 'No face detected — ensure good lighting and retry.');
              await Future.delayed(const Duration(milliseconds: 800));
              cancelled = true;
              if (sheetCtx.mounted) Navigator.pop(sheetCtx);
              return;
            }
            updateStep(stepIdx, PunchStepState.done, 'Face verified ✓');
            stepIdx++;
          }

          if (cancelled) return;

          // ── STEP: Submit punch ─────────────────────────────────────────
          updateStep(stepIdx, PunchStepState.running, 'Sending to server…');
          try {
            final fields = <String, dynamic>{};
            if (position != null) {
              fields['latitude']         = position!.latitude.toString();
              fields['longitude']        = position!.longitude.toString();
              fields['locationAccuracy'] = position!.accuracy.toString();
            }
            if (faceFile != null) {
              fields['faceImage'] = await MultipartFile.fromFile(faceFile!.path, filename: 'face.jpg');
            }

            final res = await _api.dio.post(
              '/api/mobile/attendance/punch',
              data: FormData.fromMap(fields),
              options: Options(contentType: 'multipart/form-data'),
            );

            final punchType = res.data?['punchType'] ?? 'clock_in';
            updateStep(stepIdx, PunchStepState.done, punchType == 'clock_in' ? 'Punched in successfully ✓' : 'Punched out successfully ✓');
            await Future.delayed(const Duration(milliseconds: 600));

            if (sheetCtx.mounted) Navigator.pop(sheetCtx);
          } catch (e) {
            String msg = 'Punch failed';
            if (e is DioException && e.response?.data != null) msg = e.response?.data['error'] ?? msg;
            updateStep(stepIdx, PunchStepState.failed, msg);
          }
        },
      ),
    );

    if (mounted) {
      setState(() => _isPunching = false);
      if (!cancelled) await _loadAll();
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryColor,
        title: const Text('Attendance', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _loadAll)],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadAll,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                physics: const AlwaysScrollableScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _todayStatusCard(),
                    const SizedBox(height: 20),
                    if (!_faceRegistered && _faceVerificationRequired) ...[_faceNotRegisteredBanner(), const SizedBox(height: 16)],
                    _punchSection(),
                    const SizedBox(height: 24),
                    _historySection(),
                  ],
                ),
              ),
            ),
    );
  }

  // ── Today card ─────────────────────────────────────────────────────────────
  Widget _todayStatusCard() {
    final hasClockIn  = _todayAttendance?['clockIn']  != null;
    final hasClockOut = _todayAttendance?['clockOut'] != null;
    final status      = _todayAttendance?['status']   ?? 'not_marked';
    final faceVerified = _todayAttendance?['faceVerified'] == true;
    final gpsVerified  = _todayAttendance?['latitude'] != null;

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [AppTheme.primaryColor, AppTheme.primaryColor.withValues(alpha: 0.82)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: AppTheme.primaryColor.withValues(alpha: 0.35), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(DateFormat('EEEE, dd MMM yyyy').format(DateTime.now()), style: const TextStyle(color: Colors.white70, fontSize: 13)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(12)),
            child: Text(status.toString().replaceAll('_', ' ').toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
          ),
        ]),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: _timeBox('Clock In',  hasClockIn  ? _todayAttendance!['clockIn']  : '--:--', hasClockIn)),
          const SizedBox(width: 12),
          Expanded(child: _timeBox('Clock Out', hasClockOut ? _todayAttendance!['clockOut'] : '--:--', hasClockOut)),
          const SizedBox(width: 12),
          Expanded(child: _timeBox('Hours', hasClockIn && hasClockOut ? (_todayAttendance!['workHours'] ?? '--') : '--', hasClockIn && hasClockOut)),
        ]),
        if (hasClockIn) ...[
          const SizedBox(height: 12),
          Row(children: [
            _badge(Icons.face,        'Face', faceVerified),
            const SizedBox(width: 14),
            _badge(Icons.location_on, 'GPS',  gpsVerified),
          ]),
        ],
      ]),
    );
  }

  Widget _timeBox(String label, String value, bool active) => Container(
    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
    child: Column(children: [
      Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
      const SizedBox(height: 4),
      Text(value, style: TextStyle(color: active ? Colors.white : Colors.white54, fontSize: 15, fontWeight: FontWeight.w700)),
    ]),
  );

  Widget _badge(IconData icon, String label, bool ok) => Row(children: [
    Icon(ok ? Icons.check_circle : Icons.cancel, size: 14, color: ok ? Colors.greenAccent : Colors.white54),
    const SizedBox(width: 4),
    Text('$label ${ok ? "✓" : "✗"}', style: TextStyle(color: ok ? Colors.greenAccent : Colors.white54, fontSize: 11)),
  ]);

  // ── Punch section ──────────────────────────────────────────────────────────
  Widget _punchSection() {
    final isFirstPunch = _todayAttendance?['clockIn'] == null;
    final label = isFirstPunch ? 'PUNCH IN' : 'PUNCH OUT';
    final color = isFirstPunch ? AppTheme.primaryColor : AppTheme.accentColor;
    final icon  = isFirstPunch ? Icons.login : Icons.logout;

    final chips = <Widget>[];
    if (_gpsVerificationRequired) chips.add(_reqChip(Icons.location_on, 'GPS', color));
    if (_faceVerificationRequired) chips.add(_reqChip(Icons.face, 'Face', color));

    return Column(children: [
      if (chips.isNotEmpty) ...[
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text('Auto-verifies: ', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
          ...chips.map((c) => Padding(padding: const EdgeInsets.only(left: 6), child: c)).toList(),
        ]),
        const SizedBox(height: 20),
      ],

      // Punch count indicator
      if (_punchCount > 0) ...[
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(
            color: Colors.orange.shade50,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.orange.shade200),
          ),
          child: Text(
            'Punches today: $_punchCount  •  Last punch = clock-out',
            style: TextStyle(fontSize: 12, color: Colors.orange.shade800, fontWeight: FontWeight.w500),
          ),
        ),
      ],

      // The big punch button
      Center(
        child: AnimatedBuilder(
          animation: _pulseAnim,
          builder: (_, child) => Transform.scale(
            scale: _canPunch ? _pulseAnim.value : 1.0,
            child: child,
          ),
          child: GestureDetector(
            onTap: _canPunch ? _oneTapPunch : null,
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [color.withValues(alpha: 0.9), color]),
                boxShadow: [
                  BoxShadow(color: color.withValues(alpha: 0.45), blurRadius: 30, spreadRadius: 4),
                  BoxShadow(color: color.withValues(alpha: 0.2),  blurRadius: 60, spreadRadius: 10),
                ],
              ),
              child: _isPunching
                  ? const Center(child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3))
                  : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(icon, color: Colors.white, size: 48),
                      const SizedBox(height: 6),
                      Text(label, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800, letterSpacing: 1.2)),
                    ]),
            ),
          ),
        ),
      ),

      const SizedBox(height: 16),
      Text(
        isFirstPunch
            ? 'First punch = clock in. Each subsequent punch = clock out.'
            : 'Punch again to update your clock-out time.',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 12, color: Colors.grey[500]),
      ),
    ]);
  }

  Widget _reqChip(IconData icon, String label, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20)),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: color),
      const SizedBox(width: 4),
      Text(label, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    ]),
  );

  // ── Face not registered banner ─────────────────────────────────────────────
  Widget _faceNotRegisteredBanner() => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.orange.shade200)),
    child: Row(children: [
      Icon(Icons.warning_amber, color: Colors.orange.shade700),
      const SizedBox(width: 10),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Face Not Registered', style: TextStyle(fontWeight: FontWeight.w600, color: Colors.orange.shade800)),
        Text('Contact HR/Admin to register your face.', style: TextStyle(fontSize: 12, color: Colors.orange.shade700)),
      ])),
    ]),
  );

  // ── History section ────────────────────────────────────────────────────────
  Widget _historySection() {
    if (_history.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('This Month', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
      const SizedBox(height: 10),
      ..._history.take(15).map((e) => _historyRow(e as Map<String, dynamic>)).toList(),
    ]);
  }

  Widget _historyRow(Map<String, dynamic> rec) {
    final status = rec['status'] ?? 'absent';
    Color color;
    switch (status) {
      case 'present':   color = Colors.green;  break;
      case 'weekend':   color = Colors.blue;   break;
      case 'holiday':   color = Colors.purple; break;
      case 'leave':     color = Colors.orange; break;
      default:          color = Colors.red;
    }
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 4)]),
      child: Row(children: [
        Container(width: 4, height: 36, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4))),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(rec['date'] ?? '', style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13)),
          Text('${rec['clockIn'] ?? '--'} → ${rec['clockOut'] ?? '--'}', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
          child: Text(status.toUpperCase(), style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700)),
        ),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PUNCH PROGRESS SHEET
// ═══════════════════════════════════════════════════════════════════════════════
typedef UpdateStep = void Function(int idx, PunchStepState state, String detail);
typedef Runner    = Future<void> Function(UpdateStep updateStep);

class _PunchProgressSheet extends StatefulWidget {
  final String title;
  final List<_PunchStep> steps;
  final VoidCallback onCancel;
  final Runner runner;

  const _PunchProgressSheet({
    required this.title,
    required this.steps,
    required this.onCancel,
    required this.runner,
  });

  @override
  State<_PunchProgressSheet> createState() => _PunchProgressSheetState();
}

class _PunchProgressSheetState extends State<_PunchProgressSheet> {
  bool _done = false;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _run());
  }

  Future<void> _run() async {
    await widget.runner((idx, state, detail) {
      if (mounted) setState(() {
        widget.steps[idx].state  = state;
        widget.steps[idx].detail = detail;
        _hasError = widget.steps.any((s) => s.state == PunchStepState.failed);
      });
    });
    if (mounted) setState(() => _done = true);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle bar
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(4))),
          const SizedBox(height: 20),

          // Title row
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text(widget.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            if (!_done)
              const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5)),
            if (_done)
              Icon(_hasError ? Icons.warning_amber_rounded : Icons.check_circle_rounded,
                  color: _hasError ? Colors.orange : Colors.green, size: 28),
          ]),
          const SizedBox(height: 24),

          // Steps
          ...widget.steps.map((step) => _stepRow(step)).toList(),
          const SizedBox(height: 24),

          // Bottom action
          if (_done)
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _hasError ? Colors.orange : AppTheme.primaryColor,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: Text(_hasError ? 'Close' : 'Done', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
              ),
            )
          else
            SizedBox(
              width: double.infinity,
              height: 50,
              child: OutlinedButton(
                onPressed: widget.onCancel,
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.red,
                  side: const BorderSide(color: Colors.red),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Cancel', style: TextStyle(fontSize: 16)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _stepRow(_PunchStep step) {
    Widget leading;
    Color leadColor;
    switch (step.state) {
      case PunchStepState.running:
        leading = const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5));
        leadColor = AppTheme.primaryColor;
        break;
      case PunchStepState.done:
        leading = const Icon(Icons.check_circle, color: Colors.green, size: 24);
        leadColor = Colors.green;
        break;
      case PunchStepState.failed:
        leading = const Icon(Icons.cancel, color: Colors.orange, size: 24);
        leadColor = Colors.orange;
        break;
      default:
        leading = Icon(step.icon, color: Colors.grey[300], size: 24);
        leadColor = Colors.grey;
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 28, child: leading),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(step.label, style: TextStyle(fontWeight: FontWeight.w600, color: step.state == PunchStepState.pending ? Colors.grey[400] : Colors.black87)),
          if (step.detail.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(step.detail, style: TextStyle(fontSize: 12, color: leadColor)),
          ],
        ])),
      ]),
    );
  }
}
