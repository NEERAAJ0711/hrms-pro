import 'package:flutter/material.dart';
import '../../core/theme.dart';

class NegotiateOfferScreen extends StatefulWidget {
  final String applicationId;
  final Map<String, dynamic>? offerDetails;
  const NegotiateOfferScreen({super.key, required this.applicationId, this.offerDetails});

  @override
  State<NegotiateOfferScreen> createState() => _NegotiateOfferScreenState();
}

class _NegotiateOfferScreenState extends State<NegotiateOfferScreen> {
  final _noteCtrl = TextEditingController();

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final offer = widget.offerDetails;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Negotiate Offer'),
        backgroundColor: AppTheme.primaryColor,
        iconTheme: const IconThemeData(color: Colors.white),
        titleTextStyle: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            if (offer != null) ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Current Offer', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                      const SizedBox(height: 12),
                      if (offer['offerDesignation'] != null)
                        _row(Icons.badge, 'Designation', offer['offerDesignation']),
                      if (offer['offerSalary'] != null)
                        _row(Icons.currency_rupee, 'Salary', offer['offerSalary'].toString()),
                      if (offer['offerTerms'] != null)
                        _row(Icons.description, 'Terms', offer['offerTerms']),
                      if (offer['offerExpiryDate'] != null)
                        _row(Icons.event, 'Expires', offer['offerExpiryDate']),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Your Counter-Offer', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                    const SizedBox(height: 8),
                    Text('Describe your expectations or the terms you would like to negotiate.', style: TextStyle(fontSize: 13, color: Colors.grey[600])),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _noteCtrl,
                      decoration: InputDecoration(
                        labelText: 'Counter-offer / Notes *',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        prefixIcon: const Icon(Icons.edit_note),
                        alignLabelWithHint: true,
                        hintText: 'e.g. I would like to negotiate the salary to ₹X LPA...',
                      ),
                      maxLines: 6,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                onPressed: () {
                  if (_noteCtrl.text.trim().isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please enter your counter-offer'), backgroundColor: AppTheme.errorColor));
                    return;
                  }
                  Navigator.pop(context, _noteCtrl.text.trim());
                },
                icon: const Icon(Icons.send),
                label: const Text('Send Counter-Offer'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _row(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppTheme.primaryColor),
          const SizedBox(width: 10),
          Text('$label: ', style: TextStyle(color: Colors.grey[600], fontSize: 13)),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13))),
        ],
      ),
    );
  }
}
