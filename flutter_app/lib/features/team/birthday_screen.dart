import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class BirthdayScreen extends StatefulWidget {
  const BirthdayScreen({super.key});

  @override
  State<BirthdayScreen> createState() => _BirthdayScreenState();
}

class _BirthdayScreenState extends State<BirthdayScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _birthdays = [];
  bool _isLoading = true;
  int _selectedMonth = DateTime.now().month;

  final List<String> _months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  @override
  void initState() {
    super.initState();
    _loadBirthdays();
  }

  Future<void> _loadBirthdays() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.dio.get('/api/mobile/birthdays', queryParameters: {'month': _selectedMonth});
      setState(() {
        _birthdays = res.data ?? [];
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final todayBirthdays = _birthdays.where((b) => b['isToday'] == true).toList();
    final upcomingBirthdays = _birthdays.where((b) => b['isToday'] != true && b['upcoming'] == true).toList();
    final pastBirthdays = _birthdays.where((b) => b['isToday'] != true && b['upcoming'] != true).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Birthday List')),
      body: Column(
        children: [
          Container(
            height: 50,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: 12,
              itemBuilder: (context, index) {
                final month = index + 1;
                final isSelected = month == _selectedMonth;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                  child: GestureDetector(
                    onTap: () { setState(() => _selectedMonth = month); _loadBirthdays(); },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: isSelected ? AppTheme.primaryColor : Colors.grey[100],
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(_months[index].substring(0, 3), style: TextStyle(color: isSelected ? Colors.white : Colors.grey[700], fontWeight: FontWeight.w500)),
                    ),
                  ),
                );
              },
            ),
          ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _birthdays.isEmpty
                    ? Center(child: Text('No birthdays in ${_months[_selectedMonth - 1]}', style: const TextStyle(color: AppTheme.textSecondary)))
                    : RefreshIndicator(
                        onRefresh: _loadBirthdays,
                        child: ListView(
                          padding: const EdgeInsets.all(16),
                          children: [
                            if (todayBirthdays.isNotEmpty) ...[
                              const Text("Today's Birthdays", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                              const SizedBox(height: 8),
                              ...todayBirthdays.map((b) => _birthdayCard(b, isToday: true)).toList(),
                              const SizedBox(height: 16),
                            ],
                            if (upcomingBirthdays.isNotEmpty) ...[
                              const Text('Upcoming Birthdays', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                              const SizedBox(height: 8),
                              ...upcomingBirthdays.map((b) => _birthdayCard(b)).toList(),
                              const SizedBox(height: 16),
                            ],
                            if (pastBirthdays.isNotEmpty) ...[
                              Text('Past Birthdays (${_months[_selectedMonth - 1]})', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textSecondary)),
                              const SizedBox(height: 8),
                              ...pastBirthdays.map((b) => _birthdayCard(b, isPast: true)).toList(),
                            ],
                          ],
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _birthdayCard(Map<String, dynamic> b, {bool isToday = false, bool isPast = false}) {
    DateTime? dob;
    String dateStr = '';
    try {
      dob = DateTime.parse(b['dateOfBirth']);
      dateStr = DateFormat('dd MMM').format(dob);
    } catch (_) {}

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: isToday ? AppTheme.primaryColor.withValues(alpha: 0.05) : null,
      child: ListTile(
        leading: Container(
          width: 48, height: 48,
          decoration: BoxDecoration(
            color: isToday ? AppTheme.warningColor.withValues(alpha: 0.2) : isPast ? Colors.grey[100] : AppTheme.primaryColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(Icons.cake, color: isToday ? AppTheme.warningColor : isPast ? Colors.grey : AppTheme.primaryColor, size: 24),
        ),
        title: Text('${b['firstName']} ${b['lastName']}', style: TextStyle(fontWeight: FontWeight.w600, color: isPast ? Colors.grey : null)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${b['employeeCode'] ?? ""} • ${b['designation'] ?? ""}', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
            Text(dateStr, style: TextStyle(fontSize: 12, color: isToday ? AppTheme.primaryColor : Colors.grey[500])),
          ],
        ),
        trailing: isToday
            ? Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: AppTheme.warningColor, borderRadius: BorderRadius.circular(10)),
                child: const Text('TODAY', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
              )
            : null,
        isThreeLine: true,
      ),
    );
  }
}
