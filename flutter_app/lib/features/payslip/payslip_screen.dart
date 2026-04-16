import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class PayslipScreen extends StatefulWidget {
  const PayslipScreen({super.key});

  @override
  State<PayslipScreen> createState() => _PayslipScreenState();
}

class _PayslipScreenState extends State<PayslipScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _payslips = [];
  Map<String, dynamic>? _selectedPayslip;
  bool _isLoading = true;
  bool _isLoadingDetail = false;
  bool _isDownloading = false;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _loadPayslips();
  }

  Future<void> _loadPayslips() async {
    setState(() { _isLoading = true; _loadError = null; });
    try {
      final res = await _api.dio.get('/api/mobile/payslips');
      setState(() {
        _payslips = res.data ?? [];
        _isLoading = false;
      });
    } catch (e) {
      setState(() { _isLoading = false; _loadError = 'Unable to load payslips. Please try again.'; });
    }
  }

  Future<void> _loadPayslipDetail(String month, int year) async {
    setState(() => _isLoadingDetail = true);
    try {
      final res = await _api.dio.get('/api/mobile/payslips/$month/$year');
      setState(() {
        _selectedPayslip = res.data;
        _isLoadingDetail = false;
      });
    } catch (e) {
      setState(() => _isLoadingDetail = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Payslip not available for this month'), backgroundColor: AppTheme.warningColor),
        );
      }
    }
  }

  // ─── PDF Generation ────────────────────────────────────────────────────────
  Future<Uint8List> _generatePdf(Map<String, dynamic> p) async {
    final pdf = pw.Document();
    final font = pw.Font.helvetica();
    final fontBold = pw.Font.helveticaBold();
    final primaryColor = PdfColor.fromHex('1a56db');
    final accentColor = PdfColor.fromHex('0694a2');
    final errorColor = PdfColor.fromHex('e02424');
    final bgLight = PdfColor.fromHex('f0f4ff');

    pw.Widget sectionTitle(String text, PdfColor color) => pw.Padding(
      padding: const pw.EdgeInsets.only(bottom: 6),
      child: pw.Text(text, style: pw.TextStyle(font: fontBold, fontSize: 11, color: color)),
    );

    pw.Widget row(String label, String value, {bool bold = false, PdfColor? valueColor}) => pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 2.5),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(label, style: pw.TextStyle(font: font, fontSize: 10, color: PdfColors.grey700)),
          pw.Text(value, style: pw.TextStyle(
            font: bold ? fontBold : font,
            fontSize: 10,
            color: valueColor ?? PdfColors.black,
          )),
        ],
      ),
    );

    pw.Widget divider() => pw.Divider(color: PdfColors.grey300, thickness: 0.5);

    String fmt(dynamic v) {
      if (v == null) return '0';
      final num n = v is num ? v : num.tryParse(v.toString()) ?? 0;
      return '₹${NumberFormat('#,##,###', 'en_IN').format(n)}';
    }

    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(30),
        build: (ctx) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            // ── Header bar ─────────────────────────────────────
            pw.Container(
              width: double.infinity,
              padding: const pw.EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: pw.BoxDecoration(
                color: primaryColor,
                borderRadius: pw.BorderRadius.circular(8),
              ),
              child: pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(
                        p['companyName'] ?? 'Company',
                        style: pw.TextStyle(font: fontBold, fontSize: 15, color: PdfColors.white),
                      ),
                      pw.SizedBox(height: 4),
                      pw.Text(
                        'Pay Slip — ${p['month']} ${p['year']}',
                        style: pw.TextStyle(font: font, fontSize: 11, color: PdfColors.white70),
                      ),
                    ],
                  ),
                  pw.Container(
                    padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: pw.BoxDecoration(
                      color: PdfColors.white,
                      borderRadius: pw.BorderRadius.circular(6),
                    ),
                    child: pw.Text(
                      'PAYSLIP',
                      style: pw.TextStyle(font: fontBold, fontSize: 10, color: primaryColor),
                    ),
                  ),
                ],
              ),
            ),
            pw.SizedBox(height: 16),

            // ── Employee Details ────────────────────────────────
            pw.Container(
              width: double.infinity,
              padding: const pw.EdgeInsets.all(12),
              decoration: pw.BoxDecoration(
                color: bgLight,
                borderRadius: pw.BorderRadius.circular(6),
                border: pw.Border.all(color: PdfColor.fromHex('d1d9ff'), width: 0.5),
              ),
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  sectionTitle('Employee Details', primaryColor),
                  pw.Row(
                    children: [
                      pw.Expanded(child: pw.Column(children: [
                        row('Name', p['employeeName'] ?? '-'),
                        row('Employee Code', p['employeeCode'] ?? '-'),
                        row('Department', p['department'] ?? '-'),
                      ])),
                      pw.SizedBox(width: 24),
                      pw.Expanded(child: pw.Column(children: [
                        row('Designation', p['designation'] ?? '-'),
                        row('Pay Period', '${p['month']} ${p['year']}'),
                        row('Company', p['companyName'] ?? '-'),
                      ])),
                    ],
                  ),
                ],
              ),
            ),
            pw.SizedBox(height: 12),

            // ── Earnings & Deductions side by side ──────────────
            pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                // Earnings
                pw.Expanded(
                  child: pw.Container(
                    padding: const pw.EdgeInsets.all(12),
                    decoration: pw.BoxDecoration(
                      border: pw.Border.all(color: PdfColors.grey300, width: 0.5),
                      borderRadius: pw.BorderRadius.circular(6),
                    ),
                    child: pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        sectionTitle('Earnings', accentColor),
                        row('Basic Salary', fmt(p['basicSalary'])),
                        if ((p['hra'] ?? 0) != 0) row('HRA', fmt(p['hra'])),
                        if ((p['da'] ?? 0) != 0) row('DA', fmt(p['da'])),
                        if ((p['conveyance'] ?? 0) != 0) row('Conveyance', fmt(p['conveyance'])),
                        if ((p['medicalAllowance'] ?? 0) != 0) row('Medical', fmt(p['medicalAllowance'])),
                        if ((p['specialAllowance'] ?? 0) != 0) row('Special Allowance', fmt(p['specialAllowance'])),
                        if ((p['otherEarnings'] ?? 0) != 0) row('Other Earnings', fmt(p['otherEarnings'])),
                        if ((p['monthlyBonus'] ?? 0) != 0) row('Monthly Bonus', fmt(p['monthlyBonus'])),
                        divider(),
                        row('Gross Earnings', fmt(p['grossSalary'] ?? p['grossEarnings']), bold: true, valueColor: accentColor),
                      ],
                    ),
                  ),
                ),
                pw.SizedBox(width: 10),
                // Deductions
                pw.Expanded(
                  child: pw.Container(
                    padding: const pw.EdgeInsets.all(12),
                    decoration: pw.BoxDecoration(
                      border: pw.Border.all(color: PdfColors.grey300, width: 0.5),
                      borderRadius: pw.BorderRadius.circular(6),
                    ),
                    child: pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        sectionTitle('Deductions', errorColor),
                        if ((p['pfEmployee'] ?? 0) != 0) row('PF (Employee)', fmt(p['pfEmployee'])),
                        if ((p['esicEmployee'] ?? 0) != 0) row('ESIC (Employee)', fmt(p['esicEmployee'])),
                        if ((p['professionalTax'] ?? 0) != 0) row('Professional Tax', fmt(p['professionalTax'])),
                        if ((p['tds'] ?? 0) != 0) row('TDS', fmt(p['tds'])),
                        if ((p['lwf'] ?? 0) != 0) row('LWF', fmt(p['lwf'])),
                        if ((p['otherDeductions'] ?? 0) != 0) row('Other Deductions', fmt(p['otherDeductions'])),
                        divider(),
                        row('Total Deductions', fmt(p['totalDeductions']), bold: true, valueColor: errorColor),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            pw.SizedBox(height: 12),

            // ── Net Pay ─────────────────────────────────────────
            pw.Container(
              width: double.infinity,
              padding: const pw.EdgeInsets.all(14),
              decoration: pw.BoxDecoration(
                color: primaryColor,
                borderRadius: pw.BorderRadius.circular(6),
              ),
              child: pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Text('Net Pay (Take Home)', style: pw.TextStyle(font: fontBold, fontSize: 12, color: PdfColors.white)),
                  pw.Text(
                    fmt(p['netPay'] ?? p['netSalary']),
                    style: pw.TextStyle(font: fontBold, fontSize: 18, color: PdfColors.white),
                  ),
                ],
              ),
            ),
            pw.SizedBox(height: 16),

            // ── Footer ──────────────────────────────────────────
            divider(),
            pw.SizedBox(height: 6),
            pw.Text(
              'This is a system-generated payslip and does not require a signature.',
              style: pw.TextStyle(font: font, fontSize: 8, color: PdfColors.grey600),
            ),
          ],
        ),
      ),
    );

    return pdf.save();
  }

  Future<void> _downloadPayslip() async {
    if (_selectedPayslip == null || _isDownloading) return;
    setState(() => _isDownloading = true);
    try {
      final bytes = await _generatePdf(_selectedPayslip!);
      final filename = 'Payslip_${_selectedPayslip!['month']}_${_selectedPayslip!['year']}.pdf';
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$filename');
      await file.writeAsBytes(bytes);
      await Share.shareXFiles([XFile(file.path)], text: filename);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to generate PDF: $e'), backgroundColor: AppTheme.errorColor),
        );
      }
    } finally {
      if (mounted) setState(() => _isDownloading = false);
    }
  }

  // ─── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pay Slips'),
        actions: _selectedPayslip != null
            ? [
                _isDownloading
                    ? const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16),
                        child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))),
                      )
                    : IconButton(
                        tooltip: 'Download PDF',
                        icon: const Icon(Icons.download_rounded),
                        onPressed: _downloadPayslip,
                      ),
              ]
            : null,
      ),
      body: _selectedPayslip != null ? _buildPayslipDetail() : _buildPayslipList(),
    );
  }

  Widget _buildPayslipList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_loadError != null) {
      return Center(child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.error_outline, color: AppTheme.errorColor, size: 48),
          const SizedBox(height: 12),
          Text(_loadError!, textAlign: TextAlign.center, style: const TextStyle(color: AppTheme.textSecondary)),
          const SizedBox(height: 16),
          ElevatedButton.icon(onPressed: _loadPayslips, icon: const Icon(Icons.refresh), label: const Text('Retry')),
        ]),
      ));
    }
    if (_payslips.isEmpty) {
      return Center(child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.receipt_long_outlined, color: Colors.grey.shade400, size: 64),
          const SizedBox(height: 16),
          const Text('No payslips available', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
          const SizedBox(height: 8),
          const Text('Payslips are generated by your HR/Admin after payroll processing. Check back after your monthly payroll is run.', textAlign: TextAlign.center, style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
          const SizedBox(height: 16),
          OutlinedButton.icon(onPressed: _loadPayslips, icon: const Icon(Icons.refresh, size: 16), label: const Text('Refresh')),
        ]),
      ));
    }

    return RefreshIndicator(
      onRefresh: _loadPayslips,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _payslips.length,
        itemBuilder: (context, index) {
          final p = _payslips[index];
          final month = p['month'] ?? '';
          final year = p['year'] ?? 0;
          final netPay = p['netPay'] ?? p['netSalary'] ?? 0;
          final grossPay = p['grossSalary'] ?? p['grossEarnings'] ?? 0;

          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: Container(
                width: 48, height: 48,
                decoration: BoxDecoration(color: AppTheme.primaryColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(month.toString().substring(0, 3).toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.primaryColor)),
                    Text('$year', style: const TextStyle(fontSize: 10, color: AppTheme.primaryColor)),
                  ],
                ),
              ),
              title: Text('$month $year', style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('Gross: ₹${_formatAmount(grossPay)} • Net: ₹${_formatAmount(netPay)}', style: const TextStyle(fontSize: 12)),
              trailing: const Icon(Icons.chevron_right, color: AppTheme.primaryColor),
              onTap: () => _loadPayslipDetail(month, year is int ? year : int.tryParse(year.toString()) ?? 0),
            ),
          );
        },
      ),
    );
  }

  Widget _buildPayslipDetail() {
    if (_isLoadingDetail) return const Center(child: CircularProgressIndicator());
    final p = _selectedPayslip!;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Back + title ──────────────────────────────────────
          Row(
            children: [
              IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => setState(() => _selectedPayslip = null)),
              Expanded(child: Text('Payslip — ${p['month']} ${p['year']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
            ],
          ),
          const SizedBox(height: 4),

          // ── Download button banner ────────────────────────────
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 12),
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryColor,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: _isDownloading ? null : _downloadPayslip,
              icon: _isDownloading
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.download_rounded, size: 20),
              label: Text(_isDownloading ? 'Generating PDF…' : 'Download Payslip PDF'),
            ),
          ),

          // ── Employee Details ──────────────────────────────────
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Employee Details', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                  const SizedBox(height: 8),
                  _detailRow('Name', p['employeeName'] ?? '-'),
                  _detailRow('Employee Code', p['employeeCode'] ?? '-'),
                  _detailRow('Department', p['department'] ?? '-'),
                  _detailRow('Designation', p['designation'] ?? '-'),
                  _detailRow('Company', p['companyName'] ?? '-'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // ── Earnings ─────────────────────────────────────────
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Earnings', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.accentColor)),
                  const SizedBox(height: 8),
                  _detailRow('Basic Salary', '₹${_formatAmount(p['basicSalary'])}'),
                  if (p['hra'] != null && p['hra'] != 0) _detailRow('HRA', '₹${_formatAmount(p['hra'])}'),
                  if (p['da'] != null && p['da'] != 0) _detailRow('DA', '₹${_formatAmount(p['da'])}'),
                  if (p['conveyance'] != null && p['conveyance'] != 0) _detailRow('Conveyance', '₹${_formatAmount(p['conveyance'])}'),
                  if (p['medicalAllowance'] != null && p['medicalAllowance'] != 0) _detailRow('Medical', '₹${_formatAmount(p['medicalAllowance'])}'),
                  if (p['specialAllowance'] != null && p['specialAllowance'] != 0) _detailRow('Special Allowance', '₹${_formatAmount(p['specialAllowance'])}'),
                  if (p['otherEarnings'] != null && p['otherEarnings'] != 0) _detailRow('Other Earnings', '₹${_formatAmount(p['otherEarnings'])}'),
                  if (p['monthlyBonus'] != null && p['monthlyBonus'] != 0) _detailRow('Monthly Bonus', '₹${_formatAmount(p['monthlyBonus'])}'),
                  const Divider(),
                  _detailRow('Gross Earnings', '₹${_formatAmount(p['grossSalary'] ?? p['grossEarnings'])}', isBold: true),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // ── Deductions ───────────────────────────────────────
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Deductions', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.errorColor)),
                  const SizedBox(height: 8),
                  if (p['pfEmployee'] != null && p['pfEmployee'] != 0) _detailRow('PF (Employee)', '₹${_formatAmount(p['pfEmployee'])}'),
                  if (p['esicEmployee'] != null && p['esicEmployee'] != 0) _detailRow('ESIC (Employee)', '₹${_formatAmount(p['esicEmployee'])}'),
                  if (p['professionalTax'] != null && p['professionalTax'] != 0) _detailRow('Professional Tax', '₹${_formatAmount(p['professionalTax'])}'),
                  if (p['tds'] != null && p['tds'] != 0) _detailRow('TDS', '₹${_formatAmount(p['tds'])}'),
                  if (p['lwf'] != null && p['lwf'] != 0) _detailRow('LWF', '₹${_formatAmount(p['lwf'])}'),
                  if (p['otherDeductions'] != null && p['otherDeductions'] != 0) _detailRow('Other Deductions', '₹${_formatAmount(p['otherDeductions'])}'),
                  const Divider(),
                  _detailRow('Total Deductions', '₹${_formatAmount(p['totalDeductions'])}', isBold: true),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // ── Net Pay ──────────────────────────────────────────
          Card(
            color: AppTheme.primaryColor.withValues(alpha: 0.05),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Net Pay', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  Text('₹${_formatAmount(p['netPay'] ?? p['netSalary'])}',
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _detailRow(String label, String value, {bool isBold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey[600], fontWeight: isBold ? FontWeight.bold : FontWeight.normal)),
          Text(value, style: TextStyle(fontWeight: isBold ? FontWeight.bold : FontWeight.w500)),
        ],
      ),
    );
  }

  String _formatAmount(dynamic amount) {
    if (amount == null) return '0';
    final num val = amount is num ? amount : num.tryParse(amount.toString()) ?? 0;
    return NumberFormat('#,##,###', 'en_IN').format(val);
  }
}
