import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class MyAttendanceScreen extends StatefulWidget {
  const MyAttendanceScreen({super.key});

  @override
  State<MyAttendanceScreen> createState() => _MyAttendanceScreenState();
}

class _MyAttendanceScreenState extends State<MyAttendanceScreen> {
  final ApiClient _api = ApiClient();

  int _month = DateTime.now().month;
  int _year = DateTime.now().year;
  bool _isLoading = false;
  List<dynamic> _records = [];

  static const _months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.get('/api/mobile/attendance/history?month=$_month&year=$_year');
      setState(() => _records = res.data is List ? res.data : []);
    } catch (_) {
      setState(() => _records = []);
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _prevMonth() {
    setState(() {
      if (_month == 1) { _month = 12; _year--; } else { _month--; }
    });
    _load();
  }

  void _nextMonth() {
    final now = DateTime.now();
    if (_year > now.year || (_year == now.year && _month >= now.month)) return;
    setState(() {
      if (_month == 12) { _month = 1; _year++; } else { _month++; }
    });
    _load();
  }

  // ── summary counts ────────────────────────────────────────────────────────
  int _count(String status) => _records.where((r) => r['status'] == status).length;

  double _totalOt() {
    double total = 0;
    for (final r in _records) {
      final v = double.tryParse(r['otHours']?.toString() ?? '');
      if (v != null) total += v;
    }
    return total;
  }

  // Approximate pay days: present + half_day*0.5 + on_leave + holiday + weekend
  double _payDays() {
    double pd = 0;
    for (final r in _records) {
      switch (r['status']) {
        case 'present':  pd += 1; break;
        case 'half_day': pd += 0.5; break;
        case 'on_leave': pd += 1; break;
        case 'holiday':  pd += 1; break;
        case 'weekend':  pd += 1; break;
      }
    }
    return pd;
  }

  // ── status helpers ─────────────────────────────────────────────────────────
  Color _statusColor(String? s) {
    switch (s) {
      case 'present':  return const Color(0xFF22C55E);
      case 'half_day': return const Color(0xFFF59E0B);
      case 'on_leave': return const Color(0xFF3B82F6);
      case 'holiday':  return const Color(0xFF8B5CF6);
      case 'weekend':  return const Color(0xFF94A3B8);
      case 'absent':   return const Color(0xFFEF4444);
      default:         return Colors.grey;
    }
  }

  String _statusLabel(String? s) {
    switch (s) {
      case 'present':  return 'P';
      case 'half_day': return 'HD';
      case 'on_leave': return 'L';
      case 'holiday':  return 'H';
      case 'weekend':  return 'WO';
      case 'absent':   return 'A';
      default:         return '-';
    }
  }

  String _statusFull(String? s) {
    switch (s) {
      case 'present':  return 'Present';
      case 'half_day': return 'Half Day';
      case 'on_leave': return 'On Leave';
      case 'holiday':  return 'Holiday';
      case 'weekend':  return 'Week Off';
      case 'absent':   return 'Absent';
      default:         return s ?? '-';
    }
  }

  // ── calendar helpers ───────────────────────────────────────────────────────
  Map<int, dynamic> _recordsByDay() {
    final map = <int, dynamic>{};
    for (final r in _records) {
      final d = DateTime.tryParse(r['date']?.toString() ?? '');
      if (d != null) map[d.day] = r;
    }
    return map;
  }

  // ── build ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        title: const Text('My Attendance'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildMonthNavigator(),
                    const SizedBox(height: 16),
                    _buildSummaryCards(),
                    const SizedBox(height: 16),
                    _buildCalendar(),
                    const SizedBox(height: 16),
                    _buildDailyList(),
                  ],
                ),
              ),
            ),
    );
  }

  // ── month navigator ────────────────────────────────────────────────────────
  Widget _buildMonthNavigator() {
    final now = DateTime.now();
    final isCurrentMonth = _year == now.year && _month == now.month;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left, color: AppTheme.primaryColor),
            onPressed: _prevMonth,
          ),
          Expanded(
            child: Text(
              '${_months[_month - 1]} $_year',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
            ),
          ),
          IconButton(
            icon: Icon(Icons.chevron_right, color: isCurrentMonth ? Colors.grey[300] : AppTheme.primaryColor),
            onPressed: isCurrentMonth ? null : _nextMonth,
          ),
        ],
      ),
    );
  }

  // ── summary cards ──────────────────────────────────────────────────────────
  Widget _buildSummaryCards() {
    final summaries = [
      _SummaryItem('Present',  '${_count('present')}',               const Color(0xFF22C55E), Icons.check_circle_outline),
      _SummaryItem('Absent',   '${_count('absent')}',                const Color(0xFFEF4444), Icons.cancel_outlined),
      _SummaryItem('Half Day', '${_count('half_day')}',              const Color(0xFFF59E0B), Icons.timelapse),
      _SummaryItem('On Leave', '${_count('on_leave')}',              const Color(0xFF3B82F6), Icons.beach_access),
      _SummaryItem('Week Off', '${_count('weekend')}',               const Color(0xFF94A3B8), Icons.weekend),
      _SummaryItem('Holidays', '${_count('holiday')}',               const Color(0xFF8B5CF6), Icons.celebration),
      _SummaryItem('Pay Days', _payDays() == _payDays().truncateToDouble() ? '${_payDays().toInt()}' : '${_payDays()}', AppTheme.primaryColor, Icons.payments_outlined),
      _SummaryItem('OT Hours', _totalOt() == 0 ? '0' : _totalOt().toStringAsFixed(1), const Color(0xFF0EA5E9), Icons.more_time),
    ];

    return GridView.count(
      crossAxisCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 8,
      mainAxisSpacing: 8,
      childAspectRatio: 0.85,
      children: summaries.map((s) => _summaryCard(s)).toList(),
    );
  }

  Widget _summaryCard(_SummaryItem s) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: s.color.withOpacity(0.2)),
      ),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Container(
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(color: s.color.withOpacity(0.1), shape: BoxShape.circle),
          child: Icon(s.icon, color: s.color, size: 18),
        ),
        const SizedBox(height: 6),
        Text(s.value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: s.color)),
        const SizedBox(height: 2),
        Text(s.label, style: const TextStyle(fontSize: 9, color: AppTheme.textSecondary), textAlign: TextAlign.center),
      ]),
    );
  }

  // ── calendar ───────────────────────────────────────────────────────────────
  Widget _buildCalendar() {
    final daysInMonth = DateTime(_year, _month + 1, 0).day;
    final firstWeekday = DateTime(_year, _month, 1).weekday % 7; // 0=Sun
    final today = DateTime.now();
    final byDay = _recordsByDay();

    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(children: [
        Row(children: dayNames.map((d) => Expanded(child: Center(child: Text(d, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.textSecondary))))).toList()),
        const SizedBox(height: 8),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
            childAspectRatio: 1,
            crossAxisSpacing: 3,
            mainAxisSpacing: 3,
          ),
          itemCount: firstWeekday + daysInMonth,
          itemBuilder: (_, i) {
            if (i < firstWeekday) return const SizedBox();
            final day = i - firstWeekday + 1;
            final rec = byDay[day];
            final isToday = today.year == _year && today.month == _month && today.day == day;
            final color = rec != null ? _statusColor(rec['status']) : null;
            return Container(
              decoration: BoxDecoration(
                color: color?.withOpacity(0.15) ?? Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                border: isToday ? Border.all(color: AppTheme.primaryColor, width: 2) : null,
              ),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Text('$day', style: TextStyle(fontSize: 11, fontWeight: isToday ? FontWeight.bold : FontWeight.normal, color: isToday ? AppTheme.primaryColor : AppTheme.textPrimary)),
                if (rec != null)
                  Text(_statusLabel(rec['status']), style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: color)),
              ]),
            );
          },
        ),
        const SizedBox(height: 12),
        _buildLegend(),
      ]),
    );
  }

  Widget _buildLegend() {
    final items = [
      ('P', const Color(0xFF22C55E), 'Present'),
      ('A', const Color(0xFFEF4444), 'Absent'),
      ('HD', const Color(0xFFF59E0B), 'Half Day'),
      ('L', const Color(0xFF3B82F6), 'Leave'),
      ('H', const Color(0xFF8B5CF6), 'Holiday'),
      ('WO', const Color(0xFF94A3B8), 'Week Off'),
    ];
    return Wrap(
      spacing: 12,
      runSpacing: 4,
      children: items.map((e) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 16, height: 16,
          decoration: BoxDecoration(color: e.$2.withOpacity(0.2), borderRadius: BorderRadius.circular(3), border: Border.all(color: e.$2.withOpacity(0.5))),
          child: Center(child: Text(e.$1, style: TextStyle(fontSize: 7, fontWeight: FontWeight.bold, color: e.$2))),
        ),
        const SizedBox(width: 4),
        Text(e.$3, style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary)),
      ])).toList(),
    );
  }

  // ── daily log list ─────────────────────────────────────────────────────────
  Widget _buildDailyList() {
    if (_records.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE2E8F0))),
        child: const Center(child: Column(children: [
          Icon(Icons.calendar_today_outlined, size: 40, color: AppTheme.textSecondary),
          SizedBox(height: 8),
          Text('No records for this month', style: TextStyle(color: AppTheme.textSecondary)),
        ])),
      );
    }

    final sorted = List<dynamic>.from(_records)
      ..sort((a, b) => (a['date']?.toString() ?? '').compareTo(b['date']?.toString() ?? ''));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Daily Log', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
        const SizedBox(height: 8),
        ...sorted.map((r) => _dailyTile(r)),
      ],
    );
  }

  Widget _dailyTile(dynamic r) {
    final date = DateTime.tryParse(r['date']?.toString() ?? '');
    final statusColor = _statusColor(r['status']);
    final today = DateTime.now();
    final isToday = date != null && date.year == today.year && date.month == today.month && date.day == today.day;

    String dateStr = '-';
    String dayStr = '';
    if (date != null) {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      dateStr = '${date.day.toString().padLeft(2, '0')} ${_months[date.month - 1].substring(0, 3)}';
      dayStr = days[date.weekday - 1];
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isToday ? AppTheme.primaryColor.withOpacity(0.05) : Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: isToday ? AppTheme.primaryColor.withOpacity(0.3) : const Color(0xFFE2E8F0)),
      ),
      child: Row(children: [
        // Date block
        SizedBox(
          width: 48,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(dateStr, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: isToday ? AppTheme.primaryColor : AppTheme.textPrimary)),
            Text(dayStr, style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary)),
          ]),
        ),
        const SizedBox(width: 8),
        // Status badge
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: statusColor.withOpacity(0.12), borderRadius: BorderRadius.circular(6)),
          child: Text(_statusFull(r['status']), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: statusColor)),
        ),
        const Spacer(),
        // Times
        if (r['clockIn'] != null || r['clockOut'] != null)
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            if (r['clockIn'] != null)
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.login, size: 11, color: Color(0xFF22C55E)),
                const SizedBox(width: 3),
                Text(_formatTime(r['clockIn']), style: const TextStyle(fontSize: 11, color: AppTheme.textPrimary)),
              ]),
            if (r['clockOut'] != null)
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.logout, size: 11, color: AppTheme.errorColor),
                const SizedBox(width: 3),
                Text(_formatTime(r['clockOut']), style: const TextStyle(fontSize: 11, color: AppTheme.textPrimary)),
              ]),
          ]),
        // OT badge
        if (r['otHours'] != null && (double.tryParse(r['otHours'].toString()) ?? 0) > 0) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
            decoration: BoxDecoration(color: const Color(0xFF0EA5E9).withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
            child: Text('OT ${r['otHours']}h', style: const TextStyle(fontSize: 10, color: Color(0xFF0EA5E9), fontWeight: FontWeight.w600)),
          ),
        ],
      ]),
    );
  }

  String _formatTime(String? t) {
    if (t == null) return '-';
    // Handle ISO datetime or plain time string
    if (t.contains('T')) {
      try {
        final dt = DateTime.parse(t).toLocal();
        final h = dt.hour, m = dt.minute;
        final ampm = h >= 12 ? 'PM' : 'AM';
        final hh = h % 12 == 0 ? 12 : h % 12;
        return '${hh.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')} $ampm';
      } catch (_) {}
    }
    return t;
  }
}

class _SummaryItem {
  final String label;
  final String value;
  final Color color;
  final IconData icon;
  const _SummaryItem(this.label, this.value, this.color, this.icon);
}
