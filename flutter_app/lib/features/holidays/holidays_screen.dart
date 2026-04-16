import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class HolidaysScreen extends StatefulWidget {
  const HolidaysScreen({super.key});

  @override
  State<HolidaysScreen> createState() => _HolidaysScreenState();
}

class _HolidaysScreenState extends State<HolidaysScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _holidays = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadHolidays();
  }

  Future<void> _loadHolidays() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.dio.get('/api/mobile/holidays');
      setState(() {
        _holidays = res.data ?? [];
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Holiday Calendar')),
      body: RefreshIndicator(
        onRefresh: _loadHolidays,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _holidays.isEmpty
                ? const Center(child: Text('No holidays found', style: TextStyle(color: AppTheme.textSecondary)))
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _holidays.length,
                    itemBuilder: (context, index) => _holidayItem(_holidays[index]),
                  ),
      ),
    );
  }

  Widget _holidayItem(Map<String, dynamic> holiday) {
    final date = holiday['date'] ?? '';
    final name = holiday['name'] ?? '';
    final type = holiday['type'] ?? 'public';
    final now = DateTime.now();
    DateTime? holidayDate;
    bool isPast = false;
    bool isToday = false;
    String dayName = '';

    try {
      holidayDate = DateTime.parse(date);
      isPast = holidayDate.isBefore(DateTime(now.year, now.month, now.day));
      isToday = holidayDate.year == now.year && holidayDate.month == now.month && holidayDate.day == now.day;
      dayName = DateFormat('EEEE').format(holidayDate);
    } catch (_) {}

    Color typeColor;
    switch (type) {
      case 'restricted': typeColor = AppTheme.warningColor; break;
      case 'optional': typeColor = AppTheme.primaryColor; break;
      default: typeColor = AppTheme.accentColor;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: isToday ? AppTheme.primaryColor.withValues(alpha: 0.05) : Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: isToday ? AppTheme.primaryColor : Colors.grey[200]!),
      ),
      child: ListTile(
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: isPast ? Colors.grey[100] : typeColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(holidayDate != null ? DateFormat('dd').format(holidayDate) : '--',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: isPast ? Colors.grey : typeColor)),
              Text(holidayDate != null ? DateFormat('MMM').format(holidayDate) : '',
                  style: TextStyle(fontSize: 10, color: isPast ? Colors.grey : typeColor)),
            ],
          ),
        ),
        title: Text(name, style: TextStyle(fontWeight: FontWeight.w600, color: isPast ? Colors.grey : AppTheme.textPrimary)),
        subtitle: Text('$dayName • ${type.toString().toUpperCase()}',
            style: TextStyle(fontSize: 12, color: isPast ? Colors.grey[400] : Colors.grey[600])),
        trailing: isToday
            ? Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: AppTheme.primaryColor, borderRadius: BorderRadius.circular(10)),
                child: const Text('TODAY', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
              )
            : null,
      ),
    );
  }
}
