import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class _ChatMessage {
  final String role; // 'user' | 'assistant'
  final String content;
  final bool isError;
  _ChatMessage({required this.role, required this.content, this.isError = false});

  Map<String, String> toApi() => {'role': role, 'content': content};
}

class AiAssistantScreen extends StatefulWidget {
  const AiAssistantScreen({super.key});

  @override
  State<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends State<AiAssistantScreen> {
  final _api = ApiClient();
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final List<_ChatMessage> _messages = [];
  bool _sending = false;
  String _language = 'english';

  static const _suggestions = [
    'Show my attendance this month',
    'What is my leave balance?',
    'When is my next payslip?',
    'How do I apply for leave?',
    'Explain EPFO contribution rules',
  ];

  static const _suggestionsHi = [
    'इस महीने की मेरी हाज़िरी दिखाओ',
    'मेरा छुट्टी बैलेंस क्या है?',
    'मेरी अगली सैलरी स्लिप कब आएगी?',
    'छुट्टी के लिए कैसे अप्लाई करूँ?',
    'EPFO नियम समझाओ',
  ];

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent + 120,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send(String text) async {
    final message = text.trim();
    if (message.isEmpty || _sending) return;

    // Keep a short rolling history (last 10 messages) for LLM fallback context.
    final history = _messages
        .where((m) => !m.isError)
        .map((m) => m.toApi())
        .toList();
    final trimmedHistory =
        history.length > 10 ? history.sublist(history.length - 10) : history;

    setState(() {
      _messages.add(_ChatMessage(role: 'user', content: message));
      _sending = true;
      _controller.clear();
    });
    _scrollToBottom();

    try {
      final res = await _api.dio.post('/api/mobile/ai/chat', data: {
        'message': message,
        'language': _language,
        'history': trimmedHistory,
      });
      final reply = (res.data?['reply'] ?? '').toString().trim();
      setState(() {
        _messages.add(_ChatMessage(
          role: 'assistant',
          content: reply.isEmpty
              ? (_language == 'hindi'
                  ? 'माफ़ करें, मैं अभी जवाब नहीं दे पाया। कृपया दोबारा कोशिश करें।'
                  : 'Sorry, I could not generate a reply. Please try again.')
              : reply,
        ));
      });
    } catch (e) {
      setState(() {
        _messages.add(_ChatMessage(
          role: 'assistant',
          isError: true,
          content: _language == 'hindi'
              ? 'कनेक्शन में दिक्कत हुई। इंटरनेट जाँचें और फिर कोशिश करें।'
              : 'Something went wrong reaching the assistant. Check your connection and try again.',
        ));
      });
    } finally {
      if (mounted) setState(() => _sending = false);
      _scrollToBottom();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FB),
      appBar: AppBar(
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        title: Row(children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.auto_awesome, color: Colors.white, size: 18),
          ),
          const SizedBox(width: 10),
          const Text('AI Assistant', style: TextStyle(fontWeight: FontWeight.bold)),
        ]),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: _LanguageToggle(
              language: _language,
              onChanged: (v) => setState(() => _language = v),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? _buildEmptyState()
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(12, 16, 12, 16),
                    itemCount: _messages.length + (_sending ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (_sending && index == _messages.length) {
                        return const _TypingBubble();
                      }
                      return _MessageBubble(message: _messages[index]);
                    },
                  ),
          ),
          _buildInputBar(),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    final suggestions = _language == 'hindi' ? _suggestionsHi : _suggestions;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 12),
          Center(
            child: Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [
                  AppTheme.primaryColor.withOpacity(0.15),
                  AppTheme.accentColor.withOpacity(0.12),
                ]),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.auto_awesome, color: AppTheme.primaryColor, size: 40),
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: Text(
              _language == 'hindi' ? 'आपका HR सहायक' : 'Your HR Assistant',
              style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
            ),
          ),
          const SizedBox(height: 6),
          Center(
            child: Text(
              _language == 'hindi'
                  ? 'हाज़िरी, छुट्टी, सैलरी और कंप्लायंस के बारे में पूछें'
                  : 'Ask about attendance, leave, payroll & compliance',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary),
            ),
          ),
          const SizedBox(height: 28),
          Text(
            _language == 'hindi' ? 'इन्हें आज़माएँ' : 'Try asking',
            style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 12),
          ...suggestions.map((s) => _SuggestionChip(text: s, onTap: () => _send(s))),
        ],
      ),
    );
  }

  Widget _buildInputBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.grey.withOpacity(0.12), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F4F9),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: TextField(
                  controller: _controller,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: _send,
                  decoration: InputDecoration(
                    hintText: _language == 'hindi' ? 'अपना सवाल लिखें…' : 'Type your question…',
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Material(
              color: _sending ? Colors.grey[300] : AppTheme.primaryColor,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: _sending ? null : () => _send(_controller.text),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Icon(
                    _sending ? Icons.hourglass_empty : Icons.send_rounded,
                    color: Colors.white,
                    size: 22,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LanguageToggle extends StatelessWidget {
  final String language;
  final ValueChanged<String> onChanged;
  const _LanguageToggle({required this.language, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.18),
        borderRadius: BorderRadius.circular(20),
      ),
      padding: const EdgeInsets.all(3),
      child: Row(children: [
        _pill('EN', 'english'),
        _pill('हिं', 'hindi'),
      ]),
    );
  }

  Widget _pill(String label, String value) {
    final selected = language == value;
    return GestureDetector(
      onTap: () => onChanged(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? AppTheme.primaryColor : Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}

class _SuggestionChip extends StatelessWidget {
  final String text;
  final VoidCallback onTap;
  const _SuggestionChip({required this.text, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey[200]!),
          ),
          child: Row(children: [
            Icon(Icons.bolt, size: 18, color: AppTheme.accentColor),
            const SizedBox(width: 10),
            Expanded(
              child: Text(text, style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary)),
            ),
            const Icon(Icons.arrow_forward_ios, size: 12, color: AppTheme.textSecondary),
          ]),
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final _ChatMessage message;
  const _MessageBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == 'user';
    final bg = isUser
        ? AppTheme.primaryColor
        : (message.isError ? const Color(0xFFFDECEA) : Colors.white);
    final fg = isUser
        ? Colors.white
        : (message.isError ? AppTheme.errorColor : AppTheme.textPrimary);

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.82),
        margin: const EdgeInsets.only(bottom: 12),
        child: Column(
          crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (!isUser)
              Padding(
                padding: const EdgeInsets.only(left: 6, bottom: 4),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.auto_awesome, size: 13, color: AppTheme.primaryColor),
                  const SizedBox(width: 4),
                  const Text('Assistant',
                      style: TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600)),
                ]),
              ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isUser ? 16 : 4),
                  bottomRight: Radius.circular(isUser ? 4 : 16),
                ),
                border: isUser ? null : Border.all(color: Colors.grey[200]!),
              ),
              child: SelectableText(
                message.content,
                style: TextStyle(color: fg, fontSize: 14, height: 1.35),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.grey[200]!),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primaryColor),
          ),
          const SizedBox(width: 10),
          const Text('Thinking…', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
        ]),
      ),
    );
  }
}
