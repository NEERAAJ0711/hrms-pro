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

  // ── working hours ─────────────────────────────────────────────────────────
  String? _calcWorkingHrs(String? clockIn, String? clockOut) {
    if (clockIn == null || clockOut == null) return null;
    try {
      final inParts = clockIn.replaceAll(RegExp(r'[APM ]', caseSensitive: false), '').split(':');
      final outParts = clockOut.replaceAll(RegExp(r'[APM ]', caseSensitive: false), '').split(':');
      final inMin = int.parse(inParts[0]) * 60 + int.parse(inParts.length > 1 ? inParts[1] : '0');
      final outMin = int.parse(outParts[0]) * 60 + int.parse(outParts.length > 1 ? outParts[1] : '0');
      final diff = outMin - inMin;
      if (diff <= 0) return null;
      final h = diff ~/ 60;
      final m = diff % 60;
      return m > 0 ? '${h}h ${m}m' : '${h}h';
    } catch (_) {
      return null;
    }
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

  // ── day detail bottom sheet ────────────────────────────────────────────────
  void _showDayDetail(BuildContext context, int day, dynamic rec) {
    final status = rec?['status'] as String?;
    final color = _statusColor(status);
    final workHrs = _calcWorkingHrs(rec?['clockIn']?.toString(), rec?['clockOut']?.toString());
    final otVal = double.tryParse(rec?['otHours']?.toString() ?? '') ?? 0;
    final notes = rec?['notes']?.toString();

    final date = DateTime(_year, _month, day);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final dayName = days[date.weekday - 1];
    final dateStr = '${day.toString().padLeft(2, '0')} ${_months[_month - 1]} $_year';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(width: 40, height: 4, margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2))),
            ),
            // Date header
            Row(children: [
              const Icon(Icons.calendar_today_outlined, size: 16, color: AppTheme.primaryColor),
              const SizedBox(width: 8),
              Text('$dayName, $dateStr',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
            ]),
            const SizedBox(height: 16),
            // Status chip
            if (status != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
                child: Row(children: [
                  Icon(_statusIcon(status), color: color, size: 18),
                  const SizedBox(width: 8),
                  Text(_statusFull(status), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: color)),
                ]),
              ),
            const SizedBox(height: 12),
            // Time grid
            Row(children: [
              Expanded(child: _detailCard('Clock In', rec?['clockIn']?.toString() ?? '—',
                Icons.login_outlined, const Color(0xFF22C55E))),
              const SizedBox(width: 10),
              Expanded(child: _detailCard('Clock Out', rec?['clockOut']?.toString() ?? '—',
                Icons.logout_outlined, const Color(0xFFEF4444))),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _detailCard('Working Hrs', workHrs ?? '—',
                Icons.timer_outlined, AppTheme.primaryColor)),
              const SizedBox(width: 10),
              Expanded(child: _detailCard('OT Hours', otVal > 0 ? '${otVal.toStringAsFixed(1)}h' : '—',
                Icons.more_time, const Color(0xFFF97316))),
            ]),
            if (notes != null && notes.isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Row(children: [
                    Icon(Icons.sticky_note_2_outlined, size: 14, color: AppTheme.textSecondary),
                    SizedBox(width: 6),
                    Text('Notes', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                  ]),
                  const SizedBox(height: 4),
                  Text(notes, style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary)),
                ]),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _detailCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 5),
          Text(label, style: TextStyle(fontSize: 10, color: color.withOpacity(0.8))),
        ]),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: color)),
      ]),
    );
  }

  IconData _statusIcon(String? s) {
    switch (s) {
      case 'present':  return Icons.check_circle_outline;
      case 'half_day': return Icons.timelapse;
      case 'on_leave': return Icons.beach_access;
      case 'holiday':  return Icons.celebration;
      case 'weekend':  return Icons.weekend;
      case 'absent':   return Icons.cancel_outlined;
      default:         return Icons.help_outline;
    }
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
        Row(children: dayNames.map((d) => Expanded(child: Center(child: Text(d,
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.textSecondary))))).toList()),
        const SizedBox(height: 8),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
            childAspectRatio: 0.72,
            crossAxisSpacing: 3,
            mainAxisSpacing: 3,
          ),
          itemCount: firstWeekday + daysInMonth,
          itemBuilder: (ctx, i) {
            if (i < firstWeekday) return const SizedBox();
            final day = i - firstWeekday + 1;
            final rec = byDay[day];
            final isToday = today.year == _year && today.month == _month && today.day == day;
            final color = rec != null ? _statusColor(rec['status']) : null;
            final workHrs = rec != null
                ? _calcWorkingHrs(rec['clockIn']?.toString(), rec['clockOut']?.toString())
                : null;

            return GestureDetector(
              onTap: rec != null || isToday ? () => _showDayDetail(ctx, day, rec) : null,
              child: Container(
                decoration: BoxDecoration(
                  color: color?.withOpacity(0.15) ?? Colors.transparent,
                  borderRadius: BorderRadius.circular(6),
                  border: isToday
                      ? Border.all(color: AppTheme.primaryColor, width: 2)
                      : (rec != null ? Border.all(color: color!.withOpacity(0.3), width: 0.5) : null),
                ),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text('$day', style: TextStyle(
                    fontSize: 11,
                    fontWeight: isToday ? FontWeight.bold : FontWeight.normal,
                    color: isToday ? AppTheme.primaryColor : AppTheme.textPrimary,
                  )),
                  if (rec != null)
                    Text(_statusLabel(rec['status']),
                      style: TextStyle(fontSize: 7, fontWeight: FontWeight.bold, color: color)),
                  if (workHrs != null)
                    Text(workHrs,
                      style: TextStyle(fontSize: 6.5, color: color?.withOpacity(0.8) ?? AppTheme.textSecondary),
                      overflow: TextOverflow.ellipsis)
                  else if (rec?['clockIn'] != null)
                    Text(rec['clockIn'].toString(),
                      style: const TextStyle(fontSize: 6.5, color: AppTheme.textSecondary),
                      overflow: TextOverflow.ellipsis),
                ]),
              ),
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
    final workHrs = _calcWorkingHrs(r['clockIn']?.toString(), r['clockOut']?.toString());

    String dateStr = '-';
    String dayStr = '';
    if (date != null) {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      dateStr = '${date.day.toString().padLeft(2, '0')} ${_months[date.month - 1].substring(0, 3)}';
      dayStr = days[date.weekday - 1];
    }

    return GestureDetector(
      onTap: () {
        if (date != null) _showDayDetail(context, date.day, r);
      },
      child: Container(
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
              Text(dateStr, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                color: isToday ? AppTheme.primaryColor : AppTheme.textPrimary)),
              Text(dayStr, style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary)),
            ]),
          ),
          const SizedBox(width: 8),
          // Status badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: statusColor.withOpacity(0.12), borderRadius: BorderRadius.circular(6)),
            child: Text(_statusFull(r['status']),
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: statusColor)),
          ),
          const Spacer(),
          // Working hours (primary) + OT badge
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            if (workHrs != null)
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.timer_outlined, size: 11, color: AppTheme.primaryColor),
                const SizedBox(width: 3),
                Text(workHrs, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.primaryColor)),
              ])
            else if (r['clockIn'] != null || r['clockOut'] != null)
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                if (r['clockIn'] != null)
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.login, size: 11, color: Color(0xFF22C55E)),
                    const SizedBox(width: 3),
                    Text(_formatTime(r['clockIn']),
                      style: const TextStyle(fontSize: 11, color: AppTheme.textPrimary)),
                  ]),
                if (r['clockOut'] != null)
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.logout, size: 11, color: AppTheme.errorColor),
                    const SizedBox(width: 3),
                    Text(_formatTime(r['clockOut']),
                      style: const TextStyle(fontSize: 11, color: AppTheme.textPrimary)),
                  ]),
              ]),
            if (r['otHours'] != null && (double.tryParse(r['otHours'].toString()) ?? 0) > 0)
              Container(
                margin: const EdgeInsets.only(top: 2),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: const Color(0xFF0EA5E9).withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                child: Text('OT ${r['otHours']}h',
                  style: const TextStyle(fontSize: 9, color: Color(0xFF0EA5E9), fontWeight: FontWeight.w600)),
              ),
          ]),
          const SizedBox(width: 6),
          const Icon(Icons.chevron_right, size: 14, color: AppTheme.textSecondary),
        ]),
      ),
    );
  }

  String _formatTime(String? t) {
    if (t == null) return '-';
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
