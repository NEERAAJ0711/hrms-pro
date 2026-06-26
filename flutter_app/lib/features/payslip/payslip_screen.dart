import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
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

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  num _num(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v;
    return num.tryParse(v.toString()) ?? 0;
  }

  // Indian-grouped amount with two decimals — matches the web payslip's fmt().
  String _inr(dynamic v) => NumberFormat('#,##,##0.00', 'en_IN').format(_num(v).toDouble());

  // Number-to-words in the Indian system, mirroring the web payslip's toWords().
  String _toWords(int n) {
    if (n <= 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    String convert(int num) {
      if (num < 20) return ones[num];
      if (num < 100) return tens[num ~/ 10] + (num % 10 != 0 ? ' ${ones[num % 10]}' : '');
      if (num < 1000) return '${ones[num ~/ 100]} Hundred${num % 100 != 0 ? ' ${convert(num % 100)}' : ''}';
      if (num < 100000) return '${convert(num ~/ 1000)} Thousand${num % 1000 != 0 ? ' ${convert(num % 1000)}' : ''}';
      if (num < 10000000) return '${convert(num ~/ 100000)} Lakh${num % 100000 != 0 ? ' ${convert(num % 100000)}' : ''}';
      return '${convert(num ~/ 10000000)} Crore${num % 10000000 != 0 ? ' ${convert(num % 10000000)}' : ''}';
    }
    return convert(n);
  }

  // Best-effort image fetch for the company logo / signature (skipped on failure,
  // exactly like the web payslip which try/catches missing assets).
  Future<Uint8List?> _fetchImageBytes(String? path) async {
    if (path == null || path.isEmpty) return null;
    try {
      final url = path.startsWith('http')
          ? path
          : '${_api.baseUrl}${path.startsWith('/') ? '' : '/'}$path';
      final res = await _api.dio.get<List<int>>(
        url,
        options: Options(responseType: ResponseType.bytes),
      );
      final data = res.data;
      if (data == null || data.isEmpty) return null;
      return Uint8List.fromList(data);
    } catch (_) {
      return null;
    }
  }

  // ─── PDF Generation (mirrors the web Pay Slip report) ────────────────────────
  Future<Uint8List> _generatePdf(Map<String, dynamic> p) async {
    final pdf = pw.Document();
    final font = pw.Font.helvetica();
    final fontBold = pw.Font.helveticaBold();
    final fontItalic = pw.Font.helveticaOblique();
    const mm = PdfPageFormat.mm;
    const headFill = PdfColor.fromInt(0xFFD2D2D2);
    const footFill = PdfColor.fromInt(0xFFF0F0F0);

    final logoBytes = await _fetchImageBytes(p['companyLogo'] as String?);
    final sigBytes = await _fetchImageBytes(p['companySignature'] as String?);
    final logoImage = logoBytes != null ? pw.MemoryImage(logoBytes) : null;
    final sigImage = sigBytes != null ? pw.MemoryImage(sigBytes) : null;

    final companyName = (p['companyName'] ?? 'Company').toString();
    final address = (p['companyAddress'] ?? '').toString();
    final cityState = [p['companyCity'], p['companyState']]
        .where((e) => e != null && e.toString().isNotEmpty)
        .map((e) => e.toString())
        .join(' - ');
    final monthName = (p['month'] ?? '').toString();
    final yearNum = _num(p['year']).toInt();

    final salDays = _num(p['workingDays']);
    final presDays = _num(p['presentDays']);
    final lvDays = _num(p['leaveDays']);
    final payDaysRaw = _num(p['payDays']);
    final payDaysVal = payDaysRaw > 0 ? payDaysRaw : presDays + lvDays;
    final absDays = (salDays - payDaysVal) < 0 ? 0.0 : (salDays - payDaysVal).toDouble();
    final offCalc = payDaysVal - presDays - lvDays;
    final offDays = offCalc < 0 ? 0.0 : offCalc.toDouble();
    final otHrs = _num(p['otHours']);
    final otAmt = _num(p['otAmount']);
    String days(num v) => v.toStringAsFixed(2);

    // ── Earnings rows ──
    final earnRows = <List<String>>[];
    void addEarn(String label, dynamic val) {
      if (_num(val) > 0) earnRows.add([label, _inr(val)]);
    }
    addEarn('Basic Salary', p['basicSalary']);
    addEarn('House Rent Allowance', p['hra']);
    addEarn('Conveyance Allowances', p['conveyance']);
    addEarn('Special Allowance', p['specialAllowance']);
    final rawCustomEarn = (p['customEarnings'] as Map?) ?? {};
    num customEarnSum = 0;
    rawCustomEarn.forEach((_, v) => customEarnSum += _num(v));
    final customEarn = (p['customEarningsResolved'] as Map?) ?? {};
    customEarn.forEach((name, amt) {
      if (_num(amt) != 0) earnRows.add([name.toString(), _inr(amt)]);
    });
    final residualOther = _num(p['otherAllowances']) - customEarnSum;
    if (residualOther > 0) earnRows.add(['Other Allowances', _inr(residualOther)]);
    addEarn('Bonus', p['bonus']);
    if (otAmt > 0) earnRows.add(['OT Amount (${otHrs.toStringAsFixed(2)} hrs)', _inr(otAmt)]);

    // ── Deduction rows ──
    final dedRows = <List<String>>[];
    void addDed(String label, dynamic val) {
      if (_num(val) > 0) dedRows.add([label, _inr(val)]);
    }
    addDed('Employee PF (EPF)', p['pfEmployee']);
    addDed('VPF (Voluntary PF)', p['vpfAmount']);
    addDed('ESI Deduction', p['esi']);
    addDed('Professional Tax', p['professionalTax']);
    addDed('LWF', p['lwfEmployee']);
    addDed('TDS', p['tds']);
    addDed('Other Deductions', p['otherDeductions']);
    addDed('Loan / Advance', p['loanDeduction']);
    final customDed = (p['customDeductionsResolved'] as Map?) ?? {};
    customDed.forEach((name, amt) {
      if (_num(amt) != 0) dedRows.add([name.toString(), _inr(amt)]);
    });

    var maxR = earnRows.length > dedRows.length ? earnRows.length : dedRows.length;
    if (maxR < 1) maxR = 1;
    while (earnRows.length < maxR) earnRows.add(['', '']);
    while (dedRows.length < maxR) dedRows.add(['', '']);

    // ── Cell builder ──
    pw.Widget cell(String text, {bool bold = false, bool right = false, double size = 8.2, double padV = 1.6, double padH = 2}) {
      return pw.Container(
        alignment: right ? pw.Alignment.centerRight : pw.Alignment.centerLeft,
        padding: pw.EdgeInsets.symmetric(horizontal: padH, vertical: padV),
        child: pw.Text(text, style: pw.TextStyle(font: bold ? fontBold : font, fontSize: size)),
      );
    }

    // ── Employee info rows ──
    String orDash(dynamic v) => (v != null && v.toString().isNotEmpty) ? v.toString() : '-';
    final leftInfo = <List<String>>[
      ['Code', orDash(p['employeeCode'])],
      ['Name', orDash(p['employeeName'])],
      ['Designation', orDash(p['designation'])],
      ['Office', (p['location'] != null && p['location'].toString().isNotEmpty) ? p['location'].toString() : companyName],
      ['Department', orDash(p['department'])],
      ['UAN No', orDash(p['uan'])],
    ];
    final rightInfo = <List<String>>[
      ['Salary Days', days(salDays), 'PAN No', orDash(p['pan'])],
      ['Pay Days', days(payDaysVal), 'Bank Name', orDash(p['bankName'])],
      ['Present Days', days(presDays), 'Bank A/c', orDash(p['bankAccount'])],
      ['Absent Days', days(absDays), 'Late Days', '0.00'],
      ['Off Days', days(offDays), 'Holiday', '0.00'],
      ['Leave Days', days(lvDays), 'Encashed Days', '0.00'],
      ['OT Hours', otHrs.toStringAsFixed(2), 'OT Amount', _inr(otAmt)],
    ];
    final infoRows = leftInfo.length > rightInfo.length ? leftInfo.length : rightInfo.length;
    final infoTableRows = <pw.TableRow>[];
    for (var i = 0; i < infoRows; i++) {
      final l = i < leftInfo.length ? leftInfo[i] : ['', ''];
      final r = i < rightInfo.length ? rightInfo[i] : ['', '', '', ''];
      infoTableRows.add(pw.TableRow(children: [
        cell(l[0], bold: true),
        cell(l[1]),
        cell(r[0], bold: true),
        cell(r[1], right: true),
        cell(r[2], bold: true),
        cell(r[3], right: true),
      ]));
    }

    // ── Earnings / Deductions table rows ──
    final edRows = <pw.TableRow>[];
    edRows.add(pw.TableRow(
      decoration: const pw.BoxDecoration(color: headFill),
      children: [
        cell('Earnings', bold: true, size: 9, padV: 2.2, padH: 2.5),
        cell('Amt. (Rs.)', bold: true, right: true, size: 9, padV: 2.2, padH: 2.5),
        cell('Deductions', bold: true, size: 9, padV: 2.2, padH: 2.5),
        cell('Amt. (Rs.)', bold: true, right: true, size: 9, padV: 2.2, padH: 2.5),
      ],
    ));
    for (var i = 0; i < maxR; i++) {
      edRows.add(pw.TableRow(children: [
        cell(earnRows[i][0], size: 9, padV: 2.2, padH: 2.5),
        cell(earnRows[i][1], right: true, size: 9, padV: 2.2, padH: 2.5),
        cell(dedRows[i][0], size: 9, padV: 2.2, padH: 2.5),
        cell(dedRows[i][1], right: true, size: 9, padV: 2.2, padH: 2.5),
      ]));
    }
    edRows.add(pw.TableRow(
      decoration: const pw.BoxDecoration(color: footFill),
      children: [
        cell('Gross Pay :', bold: true, right: true, size: 9.5, padV: 2.2, padH: 2.5),
        cell(_inr(p['totalEarnings']), bold: true, right: true, size: 9.5, padV: 2.2, padH: 2.5),
        cell('Deductions :', bold: true, right: true, size: 9.5, padV: 2.2, padH: 2.5),
        cell(_inr(p['totalDeductions']), bold: true, right: true, size: 9.5, padV: 2.2, padH: 2.5),
      ],
    ));
    edRows.add(pw.TableRow(
      decoration: const pw.BoxDecoration(color: footFill),
      children: [
        cell('', size: 9.5, padV: 2.2, padH: 2.5),
        cell('', size: 9.5, padV: 2.2, padH: 2.5),
        cell('Net pay :', bold: true, right: true, size: 9.5, padV: 2.2, padH: 2.5),
        cell(_inr(p['netSalary']), bold: true, right: true, size: 9.5, padV: 2.2, padH: 2.5),
      ],
    ));

    pdf.addPage(pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: pw.EdgeInsets.all(14 * mm),
      build: (ctx) {
        return pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.stretch,
          children: [
            // ── Header: centered company block, logo top-right ──
            pw.Stack(
              children: [
                pw.Container(
                  width: double.infinity,
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.center,
                    children: [
                      pw.Container(
                        decoration: pw.BoxDecoration(
                          border: pw.Border(bottom: pw.BorderSide(width: 0.5, color: PdfColors.black)),
                        ),
                        child: pw.Text(companyName, style: pw.TextStyle(font: fontBold, fontSize: 15)),
                      ),
                      if (address.isNotEmpty)
                        pw.Padding(padding: const pw.EdgeInsets.only(top: 3), child: pw.Text(address, style: pw.TextStyle(font: font, fontSize: 8.5))),
                      if (cityState.isNotEmpty)
                        pw.Padding(padding: const pw.EdgeInsets.only(top: 2), child: pw.Text(cityState, style: pw.TextStyle(font: font, fontSize: 8.5))),
                    ],
                  ),
                ),
                if (logoImage != null)
                  pw.Positioned(right: 0, top: 0, child: pw.Image(logoImage, height: 16 * mm, fit: pw.BoxFit.contain)),
              ],
            ),
            pw.SizedBox(height: 9),
            // ── Title ──
            pw.Center(
              child: pw.Container(
                decoration: pw.BoxDecoration(
                  border: pw.Border(bottom: pw.BorderSide(width: 0.4, color: PdfColors.black)),
                ),
                child: pw.Text('PaySlip For $monthName-$yearNum', style: pw.TextStyle(font: fontBold, fontSize: 11)),
              ),
            ),
            pw.SizedBox(height: 9),
            // ── Employee info grid ──
            pw.Table(
              border: pw.TableBorder.all(width: 0.25, color: PdfColors.black),
              columnWidths: const {
                0: pw.FlexColumnWidth(24),
                1: pw.FlexColumnWidth(57),
                2: pw.FlexColumnWidth(25),
                3: pw.FlexColumnWidth(22),
                4: pw.FlexColumnWidth(28),
                5: pw.FlexColumnWidth(26),
              },
              children: infoTableRows,
            ),
            pw.SizedBox(height: 5),
            // ── Earnings / Deductions ──
            pw.Table(
              border: pw.TableBorder.all(width: 0.25, color: PdfColors.black),
              columnWidths: const {
                0: pw.FlexColumnWidth(62),
                1: pw.FlexColumnWidth(29),
                2: pw.FlexColumnWidth(62),
                3: pw.FlexColumnWidth(29),
              },
              children: edRows,
            ),
            pw.SizedBox(height: 5),
            // ── Amount in words ──
            pw.Container(
              width: double.infinity,
              decoration: pw.BoxDecoration(border: pw.Border.all(width: 0.25, color: PdfColors.black)),
              padding: const pw.EdgeInsets.symmetric(horizontal: 3, vertical: 3),
              child: pw.Text('Rupees ${_toWords(_num(p['netSalary']).round())} Only', style: pw.TextStyle(font: font, fontSize: 9)),
            ),
            pw.SizedBox(height: 5),
            // ── Signature space ──
            pw.Container(
              width: double.infinity,
              height: 20 * mm,
              decoration: pw.BoxDecoration(border: pw.Border.all(width: 0.25, color: PdfColors.black)),
              padding: const pw.EdgeInsets.all(2),
              child: pw.Stack(
                children: [
                  if (sigImage != null)
                    pw.Positioned(right: 2, top: 2, child: pw.Image(sigImage, height: 14 * mm, fit: pw.BoxFit.contain)),
                  pw.Positioned(
                    right: 2,
                    bottom: 2,
                    child: pw.Text('Authorized Signatory', style: pw.TextStyle(font: font, fontSize: 7.5, color: PdfColors.grey800)),
                  ),
                ],
              ),
            ),
            pw.SizedBox(height: 6),
            if (sigImage == null)
              pw.Center(
                child: pw.Text(
                  'This is a system generated document does not require Signature',
                  style: pw.TextStyle(font: fontItalic, fontSize: 8, color: PdfColors.grey800),
                ),
              ),
          ],
        );
      },
    ));

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
          final netPay = p['netSalary'] ?? 0;
          final grossPay = p['totalEarnings'] ?? 0;

          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: Container(
                width: 48, height: 48,
                decoration: BoxDecoration(color: AppTheme.primaryColor.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(month.toString().substring(0, month.toString().length >= 3 ? 3 : month.toString().length).toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.primaryColor)),
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
                  if (_num(p['hra']) != 0) _detailRow('House Rent Allowance', '₹${_formatAmount(p['hra'])}'),
                  if (_num(p['conveyance']) != 0) _detailRow('Conveyance', '₹${_formatAmount(p['conveyance'])}'),
                  if (_num(p['specialAllowance']) != 0) _detailRow('Special Allowance', '₹${_formatAmount(p['specialAllowance'])}'),
                  if (_num(p['otherAllowances']) != 0) _detailRow('Other Allowances', '₹${_formatAmount(p['otherAllowances'])}'),
                  if (_num(p['bonus']) != 0) _detailRow('Bonus', '₹${_formatAmount(p['bonus'])}'),
                  if (_num(p['otAmount']) != 0) _detailRow('OT Amount', '₹${_formatAmount(p['otAmount'])}'),
                  const Divider(),
                  _detailRow('Gross Earnings', '₹${_formatAmount(p['totalEarnings'])}', isBold: true),
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
                  if (_num(p['pfEmployee']) != 0) _detailRow('Employee PF (EPF)', '₹${_formatAmount(p['pfEmployee'])}'),
                  if (_num(p['vpfAmount']) != 0) _detailRow('VPF (Voluntary PF)', '₹${_formatAmount(p['vpfAmount'])}'),
                  if (_num(p['esi']) != 0) _detailRow('ESI Deduction', '₹${_formatAmount(p['esi'])}'),
                  if (_num(p['professionalTax']) != 0) _detailRow('Professional Tax', '₹${_formatAmount(p['professionalTax'])}'),
                  if (_num(p['lwfEmployee']) != 0) _detailRow('LWF', '₹${_formatAmount(p['lwfEmployee'])}'),
                  if (_num(p['tds']) != 0) _detailRow('TDS', '₹${_formatAmount(p['tds'])}'),
                  if (_num(p['otherDeductions']) != 0) _detailRow('Other Deductions', '₹${_formatAmount(p['otherDeductions'])}'),
                  if (_num(p['loanDeduction']) != 0) _detailRow('Loan / Advance', '₹${_formatAmount(p['loanDeduction'])}'),
                  const Divider(),
                  _detailRow('Total Deductions', '₹${_formatAmount(p['totalDeductions'])}', isBold: true),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // ── Net Pay ──────────────────────────────────────────
          Card(
            color: AppTheme.primaryColor.withOpacity(0.05),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Net Pay', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  Text('₹${_formatAmount(p['netSalary'])}',
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
    final num val = _num(amount);
    return NumberFormat('#,##,##0.00', 'en_IN').format(val.toDouble());
  }
}
