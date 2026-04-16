import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'member_detail_screen.dart';

class TeamScreen extends StatefulWidget {
  const TeamScreen({super.key});

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _team = [];
  bool _isLoading = true;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _loadTeam();
  }

  Future<void> _loadTeam() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.dio.get('/api/mobile/my-team');
      setState(() {
        _team = res.data ?? [];
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _searchQuery.isEmpty
        ? _team
        : _team.where((e) {
            final name = '${e['firstName']} ${e['lastName']}'.toLowerCase();
            final code = (e['employeeCode'] ?? '').toString().toLowerCase();
            final dept = (e['department'] ?? '').toString().toLowerCase();
            return name.contains(_searchQuery.toLowerCase()) || code.contains(_searchQuery.toLowerCase()) || dept.contains(_searchQuery.toLowerCase());
          }).toList();

    return Scaffold(
      appBar: AppBar(title: Text('My Team (${_team.length})')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search by name, code, or department...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              ),
              onChanged: (val) => setState(() => _searchQuery = val),
            ),
          ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? const Center(child: Text('No team members found', style: TextStyle(color: AppTheme.textSecondary)))
                    : RefreshIndicator(
                        onRefresh: _loadTeam,
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: filtered.length,
                          itemBuilder: (context, index) => _memberCard(filtered[index]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _memberCard(Map<String, dynamic> emp) {
    final initials = '${(emp['firstName'] ?? '').isNotEmpty ? emp['firstName'][0] : ''}${(emp['lastName'] ?? '').isNotEmpty ? emp['lastName'][0] : ''}';
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: AppTheme.primaryColor,
          child: Text(initials.toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
        ),
        title: Text('${emp['firstName']} ${emp['lastName']}', style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${emp['employeeCode'] ?? ""} • ${emp['designation'] ?? ""}', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
            Text(emp['department'] ?? '', style: TextStyle(fontSize: 12, color: Colors.grey[500])),
          ],
        ),
        trailing: const Icon(Icons.chevron_right, color: AppTheme.primaryColor),
        isThreeLine: true,
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => MemberDetailScreen(employee: emp)),
        ),
      ),
    );
  }
}
