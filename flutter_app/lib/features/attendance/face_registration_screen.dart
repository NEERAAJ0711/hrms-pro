import 'dart:io';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class FaceRegistrationScreen extends StatefulWidget {
  const FaceRegistrationScreen({super.key});

  @override
  State<FaceRegistrationScreen> createState() => _FaceRegistrationScreenState();
}

class _FaceRegistrationScreenState extends State<FaceRegistrationScreen> {
  final ApiClient _api = ApiClient();
  final TextEditingController _searchController = TextEditingController();
  List<dynamic> _employees = [];
  List<dynamic> _filtered = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadEmployees();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadEmployees() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      final res = await _api.dio.get('/api/mobile/employees');
      final list = (res.data as List?) ?? [];
      // registeredFaceImage is already included in the employee list —
      // no need for individual face-status calls which cause N+1 slowdowns.
      final enriched = list.map((e) {
        final map = Map<String, dynamic>.from(e as Map);
        map['faceRegistered'] = map['registeredFaceImage'] != null && (map['registeredFaceImage'] as String).isNotEmpty;
        return map;
      }).toList();
      setState(() {
        _employees = enriched;
        _filtered = enriched;
        _isLoading = false;
      });
    } catch (e) {
      setState(() { _error = 'Failed to load employees: ${e.toString()}'; _isLoading = false; });
    }
  }

  void _filterEmployees(String q) {
    final query = q.toLowerCase();
    setState(() {
      _filtered = _employees.where((e) {
        final name = '${e['firstName']} ${e['lastName']}'.toLowerCase();
        final code = (e['employeeCode'] ?? '').toLowerCase();
        return name.contains(query) || code.contains(query);
      }).toList();
    });
  }

  Future<void> _registerFace(Map<String, dynamic> employee) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Register Face for ${employee['firstName']} ${employee['lastName']}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (employee['faceRegistered'] == true)
              Container(
                padding: const EdgeInsets.all(8),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.orange.shade200)),
                child: Row(children: [
                  Icon(Icons.warning_amber, color: Colors.orange.shade700, size: 18),
                  const SizedBox(width: 8),
                  Expanded(child: Text('A face is already registered. This will replace it.', style: TextStyle(color: Colors.orange.shade700, fontSize: 13))),
                ]),
              ),
            const Text('Please capture a clear front-facing photo of the employee.\n\nEnsure:\n• Good lighting\n• Face clearly visible\n• No mask or glasses'),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryColor),
            child: const Text('Open Camera', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      final picker = ImagePicker();
      final image = await picker.pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.front,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 85,
      );
      if (image == null) return;

      if (!mounted) return;
      _showProgress('Detecting face...');

      final detected = await _detectFace(image.path);
      if (!mounted) return;
      Navigator.of(context).pop();

      if (!detected) {
        _showError('No face detected in the photo.\nPlease retake with the employee\'s face clearly visible.');
        return;
      }

      if (!mounted) return;
      _showProgress('Registering face...');

      final formData = FormData.fromMap({
        'faceImage': await MultipartFile.fromFile(image.path, filename: 'face_register.jpg'),
      });
      await _api.dio.post('/api/mobile/employees/${employee['id']}/register-face', data: formData,
          options: Options(contentType: 'multipart/form-data'));

      if (!mounted) return;
      Navigator.of(context).pop();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Face registered for ${employee['firstName']} ${employee['lastName']}'), backgroundColor: AppTheme.accentColor),
      );
      await _loadEmployees();
    } catch (e) {
      if (mounted) {
        try { Navigator.of(context).pop(); } catch (_) {}
        String msg = 'Failed to register face';
        if (e is DioException && e.response?.data != null) msg = e.response?.data['error'] ?? msg;
        _showError(msg);
      }
    }
  }

  Future<bool> _detectFace(String imagePath) async {
    final options = FaceDetectorOptions(enableClassification: true, minFaceSize: 0.15);
    final detector = FaceDetector(options: options);
    try {
      final inputImage = InputImage.fromFilePath(imagePath);
      final faces = await detector.processImage(inputImage);
      return faces.isNotEmpty;
    } catch (_) {
      return true;
    } finally {
      detector.close();
    }
  }

  Future<void> _removeFace(Map<String, dynamic> employee) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove Face Registration'),
        content: Text('Remove registered face for ${employee['firstName']} ${employee['lastName']}? They will not be able to mark attendance until re-registered.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.errorColor),
            child: const Text('Remove', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await _api.dio.delete('/api/mobile/employees/${employee['id']}/registered-face');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Face registration removed for ${employee['firstName']} ${employee['lastName']}'), backgroundColor: AppTheme.warningColor),
        );
      }
      await _loadEmployees();
    } catch (e) {
      _showError('Failed to remove face registration');
    }
  }

  void _showProgress(String message) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(children: [
            const CircularProgressIndicator(),
            const SizedBox(width: 16),
            Text(message),
          ]),
        ),
      ),
    );
  }

  void _showError(String message) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Error'),
        content: Text(message),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK'))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryColor,
        title: const Text('Face Registration', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _loadEmployees),
        ],
      ),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: AppTheme.primaryColor.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10), border: Border.all(color: AppTheme.primaryColor.withValues(alpha: 0.2))),
                  child: Row(children: [
                    Icon(Icons.face, color: AppTheme.primaryColor, size: 20),
                    const SizedBox(width: 10),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Register Employee Faces', style: TextStyle(fontWeight: FontWeight.w600, color: AppTheme.primaryColor)),
                      const SizedBox(height: 2),
                      Text('Capture a clear front-facing photo to enable face verification on attendance.', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                    ])),
                  ]),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _searchController,
                  onChanged: _filterEmployees,
                  decoration: InputDecoration(
                    hintText: 'Search by name or employee code...',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _searchController.text.isNotEmpty ? IconButton(icon: const Icon(Icons.clear), onPressed: () { _searchController.clear(); _filterEmployees(''); }) : null,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    contentPadding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                ),
              ],
            ),
          ),
          if (_isLoading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (_error != null)
            Expanded(child: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.error_outline, color: AppTheme.errorColor, size: 48),
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: AppTheme.errorColor)),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: _loadEmployees, child: const Text('Retry')),
            ])))
          else
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _filtered.length,
                itemBuilder: (ctx, i) => _employeeCard(_filtered[i]),
              ),
            ),
        ],
      ),
    );
  }

  Widget _employeeCard(Map<String, dynamic> emp) {
    final faceRegistered = emp['faceRegistered'] == true;
    final name = '${emp['firstName']} ${emp['lastName']}';
    final code = emp['employeeCode'] ?? '';
    final dept = emp['department'] ?? 'No Department';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: faceRegistered ? Colors.green.shade200 : Colors.grey.shade200),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Stack(
          children: [
            CircleAvatar(
              backgroundColor: faceRegistered ? Colors.green.shade100 : Colors.grey.shade100,
              radius: 26,
              child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: TextStyle(fontWeight: FontWeight.bold, color: faceRegistered ? Colors.green.shade700 : Colors.grey.shade600, fontSize: 18)),
            ),
            Positioned(
              bottom: 0, right: 0,
              child: Container(
                width: 16, height: 16,
                decoration: BoxDecoration(
                  color: faceRegistered ? Colors.green : Colors.orange,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 2),
                ),
                child: Icon(faceRegistered ? Icons.check : Icons.warning_amber, color: Colors.white, size: 9),
              ),
            ),
          ],
        ),
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$code • $dept', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: faceRegistered ? Colors.green.shade50 : Colors.orange.shade50,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                faceRegistered ? 'Face Registered' : 'Not Registered',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: faceRegistered ? Colors.green.shade700 : Colors.orange.shade700),
              ),
            ),
          ],
        ),
        trailing: PopupMenuButton<String>(
          icon: const Icon(Icons.more_vert),
          onSelected: (val) {
            if (val == 'register') _registerFace(emp);
            if (val == 'remove') _removeFace(emp);
          },
          itemBuilder: (_) => [
            PopupMenuItem(
              value: 'register',
              child: Row(children: [
                Icon(Icons.camera_alt, color: AppTheme.primaryColor, size: 18),
                const SizedBox(width: 8),
                Text(faceRegistered ? 'Re-register Face' : 'Register Face'),
              ]),
            ),
            if (faceRegistered) PopupMenuItem(
              value: 'remove',
              child: Row(children: [
                Icon(Icons.delete_outline, color: AppTheme.errorColor, size: 18),
                const SizedBox(width: 8),
                const Text('Remove Registration'),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}
