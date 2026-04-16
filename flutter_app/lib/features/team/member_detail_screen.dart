import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme.dart';

class MemberDetailScreen extends StatelessWidget {
  final Map<String, dynamic> employee;
  const MemberDetailScreen({super.key, required this.employee});

  @override
  Widget build(BuildContext context) {
    final emp = employee;
    final initials =
        '${(emp['firstName'] ?? '').isNotEmpty ? emp['firstName'][0] : ''}${(emp['lastName'] ?? '').isNotEmpty ? emp['lastName'][0] : ''}'
            .toUpperCase();
    final fullName = '${emp['firstName'] ?? ''} ${emp['lastName'] ?? ''}'.trim();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Team Member'),
        backgroundColor: AppTheme.primaryColor,
        iconTheme: const IconThemeData(color: Colors.white),
        titleTextStyle: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 32),
              decoration: const BoxDecoration(
                color: AppTheme.primaryColor,
                borderRadius: BorderRadius.only(
                  bottomLeft: Radius.circular(32),
                  bottomRight: Radius.circular(32),
                ),
              ),
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 45,
                    backgroundColor: Colors.white.withValues(alpha: 0.25),
                    child: Text(initials, style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(height: 12),
                  Text(fullName, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                  if ((emp['designation'] ?? '').toString().isNotEmpty)
                    Text(emp['designation'], style: const TextStyle(color: Colors.white70, fontSize: 14)),
                  if ((emp['department'] ?? '').toString().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(emp['department'], style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w500)),
                    ),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Employee Details', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                          const SizedBox(height: 12),
                          _tile(Icons.badge, 'Employee Code', emp['employeeCode'] ?? '-'),
                          _tile(Icons.business, 'Department', emp['department'] ?? '-'),
                          _tile(Icons.work, 'Designation', emp['designation'] ?? '-'),
                          _tile(Icons.calendar_today, 'Date of Joining', emp['dateOfJoining'] ?? '-'),
                          if (emp['dateOfBirth'] != null)
                            _tile(Icons.cake, 'Date of Birth', emp['dateOfBirth']),
                        ],
                      ),
                    ),
                  ),
                  if (emp['mobileNumber'] != null || emp['personalEmail'] != null) ...[
                    const SizedBox(height: 12),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Contact', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                            const SizedBox(height: 12),
                            if (emp['mobileNumber'] != null && emp['mobileNumber'].toString().isNotEmpty)
                              _contactTile(context, Icons.phone, 'Mobile', emp['mobileNumber'].toString(), AppTheme.accentColor),
                            if (emp['personalEmail'] != null && emp['personalEmail'].toString().isNotEmpty)
                              _contactTile(context, Icons.email, 'Email', emp['personalEmail'].toString(), AppTheme.primaryColor),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tile(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppTheme.primaryColor),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(fontSize: 11, color: Colors.grey[500], fontWeight: FontWeight.w500)),
                const SizedBox(height: 2),
                Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _contactTile(BuildContext context, IconData icon, String label, String value, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: () {
          Clipboard.setData(ClipboardData(text: value));
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$label copied to clipboard'), backgroundColor: color));
        },
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: color.withValues(alpha: 0.2)),
          ),
          child: Row(
            children: [
              Icon(icon, size: 20, color: color),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: TextStyle(fontSize: 11, color: Colors.grey[500])),
                    Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: color)),
                  ],
                ),
              ),
              Icon(Icons.copy, size: 16, color: color.withValues(alpha: 0.5)),
            ],
          ),
        ),
      ),
    );
  }
}
