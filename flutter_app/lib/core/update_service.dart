import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api_client.dart';

class UpdateService {
  static final ApiClient _api = ApiClient();

  /// Checks for update silently. Shows a dialog only if a newer version is
  /// available. Pass [force] = true to show the dialog even when up-to-date
  /// (useful for a manual "Check for updates" action).
  static Future<void> checkForUpdate(BuildContext context, {bool force = false}) async {
    try {
      final info = await PackageInfo.fromPlatform();
      final currentBuild = int.tryParse(info.buildNumber) ?? 0;

      final res = await _api.get('/api/mobile/app-version');
      final data = res.data as Map<String, dynamic>;

      final latestBuild = (data['buildNumber'] as num?)?.toInt() ?? 0;
      final latestVersion = data['version']?.toString() ?? '';
      final downloadUrl = data['downloadUrl']?.toString() ?? '';
      final releaseNotes = data['releaseNotes']?.toString() ?? 'Bug fixes and improvements';
      final mandatory = data['mandatory'] == true;

      if (!context.mounted) return;

      if (latestBuild > currentBuild) {
        _showUpdateDialog(
          context,
          currentVersion: info.version,
          latestVersion: latestVersion,
          downloadUrl: downloadUrl,
          releaseNotes: releaseNotes,
          mandatory: mandatory,
        );
      } else if (force) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('You are already on the latest version.'),
            backgroundColor: Color(0xFF22C55E),
          ),
        );
      }
    } catch (e) {
      // Silent failure — don't bother the user if the check fails
      debugPrint('[UpdateService] Check failed: $e');
    }
  }

  static void _showUpdateDialog(
    BuildContext context, {
    required String currentVersion,
    required String latestVersion,
    required String downloadUrl,
    required String releaseNotes,
    required bool mandatory,
  }) {
    showDialog(
      context: context,
      barrierDismissible: !mandatory,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        contentPadding: EdgeInsets.zero,
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 20),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFF4285F4), Color(0xFF1A56DB)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.only(topLeft: Radius.circular(16), topRight: Radius.circular(16)),
              ),
              child: Column(children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), shape: BoxShape.circle),
                  child: const Icon(Icons.system_update, color: Colors.white, size: 32),
                ),
                const SizedBox(height: 10),
                const Text('Update Available', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text('Version $latestVersion is ready', style: const TextStyle(color: Colors.white70, fontSize: 13)),
              ]),
            ),
            // Body
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  _versionBadge('Current', currentVersion, const Color(0xFF94A3B8)),
                  const Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Icon(Icons.arrow_forward, size: 16, color: Color(0xFF94A3B8))),
                  _versionBadge('Latest', latestVersion, const Color(0xFF22C55E)),
                ]),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(10)),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Icon(Icons.info_outline, size: 16, color: Color(0xFF64748B)),
                    const SizedBox(width: 8),
                    Expanded(child: Text(releaseNotes, style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)))),
                  ]),
                ),
                if (mandatory) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(8)),
                    child: const Row(children: [
                      Icon(Icons.warning_amber_rounded, size: 14, color: Color(0xFFEF4444)),
                      SizedBox(width: 6),
                      Text('This update is required to continue', style: TextStyle(fontSize: 12, color: Color(0xFFEF4444), fontWeight: FontWeight.w500)),
                    ]),
                  ),
                ],
              ]),
            ),
          ],
        ),
        actionsPadding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        actions: [
          if (!mandatory)
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Later', style: TextStyle(color: Color(0xFF94A3B8))),
            ),
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () async {
                final uri = Uri.tryParse(downloadUrl);
                if (uri != null && await canLaunchUrl(uri)) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                }
                if (ctx.mounted && !mandatory) Navigator.pop(ctx);
              },
              icon: const Icon(Icons.download, size: 18),
              label: const Text('Download & Install'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF4285F4),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _versionBadge(String label, String version, Color color) {
    return Column(children: [
      Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
      const SizedBox(height: 2),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withOpacity(0.3))),
        child: Text(version, style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: color)),
      ),
    ]);
  }
}
