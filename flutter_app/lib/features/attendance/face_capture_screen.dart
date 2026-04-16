import 'dart:io';
import 'dart:typed_data';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

/// A full-screen front-camera view that:
/// 1. Continuously runs ML Kit face detection on the live feed
/// 2. Auto-captures once a face is stably centred for [_holdSeconds] seconds
/// 3. Returns a [File] via [Navigator.pop]
class FaceCaptureScreen extends StatefulWidget {
  final String title;
  const FaceCaptureScreen({super.key, this.title = 'Face Verification'});

  @override
  State<FaceCaptureScreen> createState() => _FaceCaptureScreenState();
}

class _FaceCaptureScreenState extends State<FaceCaptureScreen>
    with WidgetsBindingObserver {
  // ── Camera ────────────────────────────────────────────────────────────────
  CameraController? _ctrl;
  bool _cameraReady = false;
  String? _initError;

  // ── Face detection ────────────────────────────────────────────────────────
  final FaceDetector _detector = FaceDetector(
    options: FaceDetectorOptions(
      enableClassification: true,
      enableLandmarks: false,
      minFaceSize: 0.20,
      performanceMode: FaceDetectorMode.fast,
    ),
  );
  bool _processing = false;

  // ── Auto-capture logic ────────────────────────────────────────────────────
  static const int _holdSeconds = 2;
  int _faceOkCount = 0; // consecutive frames with a good face
  static const int _framesNeeded = 6; // ~2s at ~3fps processing
  bool _captured = false;
  bool _capturing = false;

  // ── UI state ──────────────────────────────────────────────────────────────
  String _statusMsg = 'Position your face in the oval';
  Color _ovalColor = Colors.white54;
  double _progressFraction = 0.0; // 0..1 for the countdown arc

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initCamera();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ctrl?.stopImageStream().catchError((_) {});
    _ctrl?.dispose();
    _detector.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_ctrl == null || !_ctrl!.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      _ctrl?.stopImageStream().catchError((_) {});
      _ctrl?.dispose();
    } else if (state == AppLifecycleState.resumed) {
      _initCamera();
    }
  }

  // ── Camera initialisation ─────────────────────────────────────────────────
  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      final front = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );
      final ctrl = CameraController(
        front,
        ResolutionPreset.medium, // 720p – good balance for face detection
        enableAudio: false,
        imageFormatGroup: Platform.isAndroid
            ? ImageFormatGroup.nv21
            : ImageFormatGroup.bgra8888,
      );
      await ctrl.initialize();
      if (!mounted) { ctrl.dispose(); return; }
      await ctrl.startImageStream(_onFrame);
      setState(() {
        _ctrl = ctrl;
        _cameraReady = true;
        _initError = null;
      });
    } catch (e) {
      if (mounted) setState(() => _initError = e.toString());
    }
  }

  // ── Per-frame face detection ───────────────────────────────────────────────
  Future<void> _onFrame(CameraImage image) async {
    if (_processing || _captured || _capturing) return;
    _processing = true;
    try {
      final inputImage = _toInputImage(image);
      if (inputImage == null) { _processing = false; return; }
      final faces = await _detector.processImage(inputImage);
      if (!mounted || _captured) { _processing = false; return; }

      if (faces.isEmpty) {
        _faceOkCount = 0;
        setState(() {
          _statusMsg = 'Position your face in the oval';
          _ovalColor = Colors.white54;
          _progressFraction = 0;
        });
      } else {
        final face = faces.first;
        final isCentred = _isFaceCentred(face, image);
        if (isCentred) {
          _faceOkCount++;
          final pct = (_faceOkCount / _framesNeeded).clamp(0.0, 1.0);
          final remaining = (_holdSeconds - (_holdSeconds * pct)).ceil();
          setState(() {
            _ovalColor = Colors.greenAccent;
            _progressFraction = pct;
            _statusMsg = pct < 1.0
                ? 'Hold still… $remaining'
                : 'Capturing…';
          });
          if (_faceOkCount >= _framesNeeded) {
            await _autoCapture();
          }
        } else {
          _faceOkCount = 0;
          setState(() {
            _statusMsg = 'Centre your face in the oval';
            _ovalColor = Colors.orangeAccent;
            _progressFraction = 0;
          });
        }
      }
    } catch (_) {
      _faceOkCount = 0;
    } finally {
      _processing = false;
    }
  }

  bool _isFaceCentred(Face face, CameraImage image) {
    final fw = image.width.toDouble();
    final fh = image.height.toDouble();
    final bb = face.boundingBox;
    final cx = (bb.left + bb.right) / 2 / fw;
    final cy = (bb.top + bb.bottom) / 2 / fh;
    final faceW = bb.width / fw;
    // Face centre within middle 50%, face width between 20%–70%
    return cx > 0.25 && cx < 0.75 &&
        cy > 0.20 && cy < 0.80 &&
        faceW > 0.20 && faceW < 0.80;
  }

  // ── Convert CameraImage → InputImage for ML Kit ───────────────────────────
  InputImage? _toInputImage(CameraImage image) {
    if (_ctrl == null) return null;
    final sensor = _ctrl!.description.sensorOrientation;
    InputImageRotation rotation;
    switch (sensor) {
      case 90:  rotation = InputImageRotation.rotation90deg; break;
      case 180: rotation = InputImageRotation.rotation180deg; break;
      case 270: rotation = InputImageRotation.rotation270deg; break;
      default:  rotation = InputImageRotation.rotation0deg;
    }

    if (Platform.isAndroid) {
      // NV21: concatenate all plane bytes
      final totalBytes = image.planes.fold(0, (sum, p) => sum + p.bytes.length);
      final bytes = Uint8List(totalBytes);
      int offset = 0;
      for (final plane in image.planes) {
        bytes.setAll(offset, plane.bytes);
        offset += plane.bytes.length;
      }
      return InputImage.fromBytes(
        bytes: bytes,
        metadata: InputImageMetadata(
          size: Size(image.width.toDouble(), image.height.toDouble()),
          rotation: rotation,
          format: InputImageFormat.nv21,
          bytesPerRow: image.planes[0].bytesPerRow,
        ),
      );
    } else {
      // iOS BGRA8888: single plane
      final plane = image.planes.first;
      return InputImage.fromBytes(
        bytes: plane.bytes,
        metadata: InputImageMetadata(
          size: Size(image.width.toDouble(), image.height.toDouble()),
          rotation: rotation,
          format: InputImageFormat.bgra8888,
          bytesPerRow: plane.bytesPerRow,
        ),
      );
    }
  }

  // ── Auto-capture ──────────────────────────────────────────────────────────
  Future<void> _autoCapture() async {
    if (_captured || _capturing || _ctrl == null) return;
    _capturing = true;
    try {
      // Stop stream first so takePicture can work
      await _ctrl!.stopImageStream();
      await Future.delayed(const Duration(milliseconds: 150));

      final xFile = await _ctrl!.takePicture();
      _captured = true;

      if (mounted) {
        Navigator.of(context).pop(File(xFile.path));
      }
    } catch (e) {
      // If capture fails, restart stream and let user try again
      _capturing = false;
      _faceOkCount = 0;
      _captured = false;
      try {
        await _ctrl?.startImageStream(_onFrame);
      } catch (_) {}
      if (mounted) {
        setState(() {
          _statusMsg = 'Capture failed — try again';
          _ovalColor = Colors.redAccent;
          _progressFraction = 0;
        });
      }
    }
  }

  // ── Manual capture fallback ───────────────────────────────────────────────
  Future<void> _manualCapture() async {
    if (_captured || _capturing || _ctrl == null) return;
    _capturing = true;
    setState(() => _statusMsg = 'Capturing…');
    try {
      await _ctrl!.stopImageStream();
      await Future.delayed(const Duration(milliseconds: 100));
      final xFile = await _ctrl!.takePicture();
      _captured = true;
      if (mounted) Navigator.of(context).pop(File(xFile.path));
    } catch (e) {
      _capturing = false;
      _captured = false;
      try { await _ctrl?.startImageStream(_onFrame); } catch (_) {}
      if (mounted) setState(() { _statusMsg = 'Capture failed'; _ovalColor = Colors.redAccent; });
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Camera preview
          if (_cameraReady && _ctrl != null)
            _buildPreview()
          else if (_initError != null)
            _buildError()
          else
            const Center(child: CircularProgressIndicator(color: Colors.white)),

          // Top bar
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: Colors.white),
                    onPressed: () => Navigator.of(context).pop(null),
                  ),
                  const SizedBox(width: 8),
                  Text(widget.title,
                      style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),

          // Status + countdown arc (bottom)
          Positioned(
            left: 0, right: 0, bottom: 0,
            child: Container(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 40),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [Colors.black87, Colors.transparent],
                ),
              ),
              child: Column(
                children: [
                  Text(_statusMsg,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: _ovalColor == Colors.greenAccent
                            ? Colors.greenAccent
                            : Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      )),
                  const SizedBox(height: 16),
                  // Manual capture button (fallback)
                  TextButton.icon(
                    onPressed: _manualCapture,
                    icon: const Icon(Icons.camera_alt, color: Colors.white70),
                    label: const Text('Capture manually',
                        style: TextStyle(color: Colors.white70, fontSize: 13)),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPreview() {
    return LayoutBuilder(builder: (ctx, constraints) {
      final screenW = constraints.maxWidth;
      final screenH = constraints.maxHeight;
      final ovalW = screenW * 0.68;
      final ovalH = ovalW * 1.28;
      final ovalTop = (screenH - ovalH) / 2 - 20;

      return Stack(
        fit: StackFit.expand,
        children: [
          // Camera preview (mirrored for front cam — natural selfie feel)
          Transform(
            alignment: Alignment.center,
            transform: Matrix4.rotationY(Platform.isAndroid ? 3.14159 : 0),
            child: CameraPreview(_ctrl!),
          ),

          // Frosted oval cutout overlay
          CustomPaint(
            painter: _OvalOverlayPainter(
              ovalRect: Rect.fromLTWH(
                (screenW - ovalW) / 2, ovalTop, ovalW, ovalH),
              ovalColor: _ovalColor,
              progress: _progressFraction,
            ),
          ),

          // Instruction above oval
          Positioned(
            top: ovalTop - 48,
            left: 0, right: 0,
            child: Text(
              'Look straight at the camera',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.85),
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      );
    });
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Icon(Icons.camera_alt, color: Colors.white54, size: 56),
          const SizedBox(height: 16),
          Text('Camera error:\n$_initError',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70)),
          const SizedBox(height: 20),
          ElevatedButton(onPressed: _initCamera, child: const Text('Retry')),
        ]),
      ),
    );
  }
}

// ── Oval overlay painter ─────────────────────────────────────────────────────
class _OvalOverlayPainter extends CustomPainter {
  final Rect ovalRect;
  final Color ovalColor;
  final double progress;

  const _OvalOverlayPainter({
    required this.ovalRect,
    required this.ovalColor,
    required this.progress,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // Dim overlay everywhere except inside the oval
    final path = Path()
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addOval(ovalRect)
      ..fillType = PathFillType.evenOdd;

    canvas.drawPath(path, Paint()..color = Colors.black.withValues(alpha: 0.55));

    // Oval border
    canvas.drawOval(
      ovalRect,
      Paint()
        ..color = ovalColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.5,
    );

    // Progress arc (sweeps clockwise from top)
    if (progress > 0) {
      const sweepStart = -3.14159 / 2; // start at top
      canvas.drawArc(
        ovalRect,
        sweepStart,
        2 * 3.14159 * progress,
        false,
        Paint()
          ..color = Colors.greenAccent
          ..style = PaintingStyle.stroke
          ..strokeWidth = 5
          ..strokeCap = StrokeCap.round,
      );
    }

    // Corner guide marks inside oval
    final guidePaint = Paint()
      ..color = ovalColor.withValues(alpha: 0.6)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    const cornerLen = 18.0;
    final cx = ovalRect.center.dx;
    final cy = ovalRect.center.dy;
    final rx = ovalRect.width / 2;
    final ry = ovalRect.height / 2;

    // top-left guide
    canvas.drawLine(Offset(cx - rx + 10, cy - ry + cornerLen + 10), Offset(cx - rx + 10, cy - ry + 10), guidePaint);
    canvas.drawLine(Offset(cx - rx + 10, cy - ry + 10), Offset(cx - rx + cornerLen + 10, cy - ry + 10), guidePaint);
    // top-right guide
    canvas.drawLine(Offset(cx + rx - 10, cy - ry + cornerLen + 10), Offset(cx + rx - 10, cy - ry + 10), guidePaint);
    canvas.drawLine(Offset(cx + rx - 10, cy - ry + 10), Offset(cx + rx - cornerLen - 10, cy - ry + 10), guidePaint);
    // bottom-left guide
    canvas.drawLine(Offset(cx - rx + 10, cy + ry - cornerLen - 10), Offset(cx - rx + 10, cy + ry - 10), guidePaint);
    canvas.drawLine(Offset(cx - rx + 10, cy + ry - 10), Offset(cx - rx + cornerLen + 10, cy + ry - 10), guidePaint);
    // bottom-right guide
    canvas.drawLine(Offset(cx + rx - 10, cy + ry - cornerLen - 10), Offset(cx + rx - 10, cy + ry - 10), guidePaint);
    canvas.drawLine(Offset(cx + rx - 10, cy + ry - 10), Offset(cx + rx - cornerLen - 10, cy + ry - 10), guidePaint);
  }

  @override
  bool shouldRepaint(_OvalOverlayPainter old) =>
      old.ovalColor != ovalColor || old.progress != progress;
}
