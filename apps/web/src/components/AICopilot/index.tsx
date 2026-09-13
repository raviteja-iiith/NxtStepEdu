'use client';

// AI Copilot — Main Component
// Floating launcher button + slide-in side panel (desktop) / full-screen (mobile)
// Handles: SSE streaming, message state, context injection, confirm actions, voice input

import {
  useState, useEffect, useRef, useCallback,
  type FormEvent, type KeyboardEvent,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  useCopilotStore,
  createUserMessage, createAssistantMessage,
  type ConfirmData,
} from '@/store/copilotStore';
import MessageRenderer from './MessageRenderer';

// ─── Page label map ────────────────────────────────────────────────────────────

const PAGE_LABELS: Record<string, string> = {
  '/principal/dashboard':        'Dashboard',
  '/principal/attendance':       'Attendance',
  '/principal/hr':               'HR & Payroll',
  '/principal/fees':             'Fee Management',
  '/principal/teachers':         'Teachers',
  '/principal/students':         'Students',
  '/principal/parents':          'Parents',
  '/principal/exams':            'Exams',
  '/principal/marks':            'Marks & Results',
  '/principal/reports':          'Reports',
  '/principal/timetable':        'Timetable',
  '/principal/subjects':         'Subjects',
  '/principal/question-bank':    'Question Bank',
  '/principal/teacher-performance': 'Teacher Performance',
  '/principal/lesson-coverage':  'Lesson Coverage',
  '/principal/announcements':    'Announcements',
};

// ─── Page-specific suggestion prompts ─────────────────────────────────────────

const PAGE_SUGGESTIONS: Record<string, string[]> = {
  '/principal/dashboard': [
    "What needs my attention today?",
    "Give me today's workforce summary",
    "Show me payroll for this month",
    "How is attendance this week?",
  ],
  '/principal/hr': [
    "Show payroll trend for the last 6 months",
    "Who has pending leave requests?",
    "Compare this month's payroll with last month",
    "List all non-teaching staff",
  ],
  '/principal/attendance': [
    "Show attendance trend for last 7 days",
    "What was today's attendance percentage?",
    "Which day had the lowest attendance this week?",
  ],
  '/principal/fees': [
    "Give me a fee collection summary",
    "How much fee is still pending?",
    "Show fee status breakdown",
  ],
  '/principal/teachers': [
    "How many teachers do we have?",
    "List all teaching staff",
    "Show me staff who joined this year",
  ],
  '/principal/students': [
    "How many students are enrolled?",
    "Search for a student by name",
  ],
};

const DEFAULT_SUGGESTIONS = [
  "What needs my attention today?",
  "Show me payroll trend for 6 months",
  "How many staff members do we have?",
  "Show today's attendance summary",
];

// ─── Component ────────────────────────────────────────────────────────────────

interface AICopilotProps {
  role?: string;
}

export default function AICopilot({ role = 'principal' }: AICopilotProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const isMobile = useIsMobile();
  const supabase = createClient();

  // Store
  const {
    isOpen, toggle, close,
    messages, addMessage, appendText, appendToolStatus,
    appendChart, appendTable, setActions, setConfirm, updateMessage,
    isStreaming, setStreaming,
    context, setContext,
    clearMessages,
  } = useCopilotStore();

  // Local state
  const [input,           setInput]           = useState('');
  const [token,           setToken]           = useState('');
  const [confirmLoading,  setConfirmLoading]  = useState(false);
  const [isListening,     setIsListening]     = useState(false);
  const [unread,          setUnread]          = useState(0);

  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const recognRef   = useRef<any>(null);

  const pageLabel = PAGE_LABELS[pathname] ?? pathname.split('/').pop() ?? 'Dashboard';
  const suggestions = PAGE_SUGGESTIONS[pathname] ?? DEFAULT_SUGGESTIONS;

  // ── Init: get auth token + user context ─────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setToken(session.access_token);
        const { data: u } = await supabase.from('users').select('full_name,school_id').eq('id', session.user.id).single();
        if (u) {
          let schoolName = 'School';
          if (u.school_id) {
            const { data: sc } = await supabase.from('schools').select('name').eq('id', u.school_id).single();
            schoolName = sc?.name ?? 'School';
          }
          setContext({ page: pathname, pageLabel, role, userName: u.full_name ?? 'Principal', schoolName });
        }
      }
    }
    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event: import('@supabase/supabase-js').AuthChangeEvent, session: import('@supabase/supabase-js').Session | null) => {
      if (session) setToken(session.access_token);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // ── Update page context when path changes ────────────────────────────────────
  useEffect(() => {
    setContext({ page: pathname, pageLabel });
  }, [pathname]);

  // ── Scroll to bottom on new messages ─────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (!isOpen && messages.length > 0) setUnread(n => n + 1);
  }, [messages.length, isStreaming]);

  // ── Reset unread count on open ───────────────────────────────────────────────
  useEffect(() => { if (isOpen) setUnread(0); }, [isOpen]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    setInput('');

    // Add user message
    const userMsg = createUserMessage(text.trim());
    addMessage(userMsg);

    // Add placeholder assistant message
    const assistantMsg = createAssistantMessage();
    addMessage(assistantMsg);
    setStreaming(true);

    // Build conversation history for API (exclude the empty assistant placeholder)
    const history = messages
      .filter(m => m.content.trim())
      .map(m => ({ role: m.role, content: m.content }));
    history.push({ role: 'user', content: text.trim() });

    const requestBody = {
      messages: history,
      context: { page: context.page, pageLabel: context.pageLabel, schoolName: context.schoolName },
    };

    // Cancel previous request if any
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(requestBody),
        signal: abortRef.current.signal,
      });

      if (!resp.ok || !resp.body) {
        updateMessage(assistantMsg.id, { content: "I couldn't connect to the AI service. Please try again.", hasError: true });
        setStreaming(false);
        return;
      }

      // Parse SSE stream
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.replace(/^data: /, '').trim();
          if (!trimmed) continue;
          let event;
          try { event = JSON.parse(trimmed); } catch { continue; }

          switch (event.type) {
            case 'tool_status':
              appendToolStatus(assistantMsg.id, event.message ?? '');
              break;
            case 'text':
              appendText(assistantMsg.id, event.content ?? '');
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
              break;
            case 'chart':
              if (event.chartData) appendChart(assistantMsg.id, event.chartData);
              break;
            case 'table':
              if (event.tableData) appendTable(assistantMsg.id, event.tableData);
              break;
            case 'actions':
              if (event.actions) setActions(assistantMsg.id, event.actions);
              break;
            case 'confirm':
              if (event.confirmData) setConfirm(assistantMsg.id, event.confirmData);
              break;
            case 'error':
              updateMessage(assistantMsg.id, { content: event.message ?? "Something went wrong.", hasError: true });
              break;
            case 'done':
              setStreaming(false);
              break;
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        updateMessage(assistantMsg.id, { content: "The connection was interrupted. Please try again.", hasError: true });
      }
      setStreaming(false);
    }
  }, [isStreaming, messages, context, token]);

  // ── Handle confirmed action ──────────────────────────────────────────────────
  const handleConfirm = useCallback(async (confirm: ConfirmData) => {
    setConfirmLoading(true);
    try {
      const resp = await fetch('/api/ai/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: confirm.action, params: confirm.params }),
      });
      const data = await resp.json();
      if (data.success) {
        // Find the message with this confirm and clear it + add result text
        const msg = messages.find(m => m.confirm?.action === confirm.action && m.confirm?.params?.leave_id === confirm.params?.leave_id);
        if (msg) {
          updateMessage(msg.id, { confirm: null, actions: [] });
        }
        // Add success confirmation as new message
        const successMsg = createAssistantMessage();
        successMsg.content = `✅ ${data.message}`;
        addMessage(successMsg);
      } else {
        const errMsg = createAssistantMessage();
        errMsg.content = `⚠️ ${data.error || 'Action failed.'}`;
        errMsg.hasError = true;
        addMessage(errMsg);
      }
    } catch {
      const errMsg = createAssistantMessage();
      errMsg.content = "⚠️ Couldn't complete the action. Please try again.";
      errMsg.hasError = true;
      addMessage(errMsg);
    } finally {
      setConfirmLoading(false);
    }
  }, [token, messages]);

  const handleCancelConfirm = useCallback((msgId: string) => {
    updateMessage(msgId, { confirm: null });
  }, []);

  // ── Form submit ──────────────────────────────────────────────────────────────
  const handleSubmit = (e: FormEvent) => { e.preventDefault(); sendMessage(input); };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  // ── Voice input ──────────────────────────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Voice input is not supported in this browser.');
      return;
    }
    if (isListening) {
      recognRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('');
      setInput(transcript);
    };
    recognition.onend = () => {
      setIsListening(false);
      // Auto-send if there's content
      setInput(prev => { if (prev.trim()) { setTimeout(() => sendMessage(prev), 200); } return prev; });
    };
    recognition.onerror = () => setIsListening(false);
    recognRef.current = recognition;
    recognition.start();
  }, [isListening, sendMessage]);

  // ─────────────────────────────────────────────────────────────────────────────

  const panelWidth = isMobile ? '100vw' : '420px';
  const panelHeight = isMobile ? '100dvh' : '100vh';
  const hasMessages = messages.length > 0;

  return (
    <>
      {/* ── Floating trigger button ──────────────────────────────────────────── */}
      <button
        onClick={toggle}
        aria-label="Open AI Copilot"
        style={{
          position: 'fixed', bottom: isMobile ? 20 : 28, right: isMobile ? 20 : 28,
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: isOpen ? '#1E293B' : 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
          color: 'white', cursor: 'pointer', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isOpen
            ? '0 4px 16px rgba(0,0,0,0.3)'
            : '0 4px 20px rgba(79,70,229,0.45), 0 0 0 0 rgba(79,70,229,0.4)',
          transition: 'all 0.2s ease',
          animation: !isOpen && !hasMessages ? 'copilot-pulse 2.5s ease-in-out infinite' : undefined,
        }}
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/>
          </svg>
        )}
        {/* Unread badge */}
        {unread > 0 && !isOpen && (
          <div style={{
            position: 'absolute', top: -4, right: -4, width: 18, height: 18,
            borderRadius: '50%', background: '#DC2626', color: 'white',
            fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid white',
          }}>{unread}</div>
        )}
      </button>

      {/* ── Side Panel ──────────────────────────────────────────────────────── */}
      {isOpen && (
        <>
          {/* Mobile overlay */}
          {isMobile && (
            <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9997, backdropFilter: 'blur(2px)' }} />
          )}

          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: panelWidth,
              height: panelHeight,
              zIndex: 9998,
              display: 'flex',
              flexDirection: 'column',
              background: '#F8FAFC',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
              animation: 'copilot-slide-in 0.28s cubic-bezier(0.22,1,0.36,1)',
              borderLeft: '1px solid #E2E8F0',
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            {/* ── Header ───────────────────────────────────────────────────── */}
            <div style={{
              padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10,
              background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              flexShrink: 0,
            }}>
              {/* AI Icon */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #6366F1, #A78BFA)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, boxShadow: '0 0 12px rgba(99,102,241,0.5)',
              }}>✦</div>
              <div style={{ flex: 1 }}>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>AI Copilot</p>
                <p style={{ color: 'rgba(196,181,253,0.8)', fontSize: 10, fontWeight: 500, marginTop: 1 }}>
                  {pageLabel} · {context.schoolName}
                </p>
              </div>
              {/* Context chip */}
              <div style={{ fontSize: 10, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: '3px 8px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap' }}>
                {pageLabel}
              </div>
              {/* Clear button */}
              {hasMessages && (
                <button onClick={clearMessages} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, padding: '4px 6px', borderRadius: 6, flexShrink: 0 }} title="Clear conversation">
                  🗑
                </button>
              )}
              {isMobile && (
                <button onClick={close} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', flexShrink: 0, padding: 4 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>

            {/* ── Messages area ─────────────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column' }}>

              {/* Empty state with suggestions */}
              {!hasMessages && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {/* Welcome card */}
                  <div style={{ textAlign: 'center', marginBottom: 24, padding: '0 8px' }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px',
                      background: 'linear-gradient(135deg, #6366F1, #A78BFA)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 24, boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
                    }}>✦</div>
                    <p style={{ fontWeight: 700, fontSize: 16, color: '#1E293B', marginBottom: 6 }}>
                      Hello, {context.userName?.split(' ')[0] ?? 'Principal'}!
                    </p>
                    <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
                      I can analyze your school data, manage workflows, and answer any questions. What would you like to know?
                    </p>
                  </div>

                  {/* Suggestion chips */}
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingLeft: 4 }}>Try asking</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(s)}
                          style={{
                            textAlign: 'left', background: 'white', border: '1px solid #E2E8F0',
                            borderRadius: 10, padding: '9px 14px', fontSize: 12, color: '#334155',
                            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                            transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', gap: 8,
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#6366F1'; (e.currentTarget as HTMLElement).style.background = '#F5F3FF'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLElement).style.background = 'white'; }}
                        >
                          <span style={{ color: '#6366F1', fontSize: 14 }}>→</span>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Message list */}
              {messages.map((msg, idx) => (
                <MessageRenderer
                  key={msg.id}
                  message={msg}
                  isStreaming={isStreaming && idx === messages.length - 1 && msg.role === 'assistant'}
                  onConfirm={handleConfirm}
                  onCancelConfirm={handleCancelConfirm}
                  onSendMessage={sendMessage}
                  confirmLoading={confirmLoading}
                />
              ))}

              <div ref={bottomRef} />
            </div>

            {/* ── Input area ────────────────────────────────────────────────── */}
            <div style={{
              padding: '10px 14px 14px', background: 'white',
              borderTop: '1px solid #E2E8F0', flexShrink: 0,
            }}>
              {/* Streaming indicator */}
              {isStreaming && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11, color: '#6366F1', fontWeight: 600 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366F1', animation: 'copilot-blink 1s ease-in-out infinite' }} />
                  AI is thinking...
                  <button onClick={() => abortRef.current?.abort()} style={{ marginLeft: 'auto', fontSize: 10, color: '#94A3B8', background: 'transparent', border: 'none', cursor: 'pointer' }}>Stop</button>
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? '🎙 Listening...' : "Ask anything about your school..."}
                  rows={1}
                  disabled={isStreaming}
                  style={{
                    flex: 1, resize: 'none', border: '1px solid #E2E8F0', borderRadius: 12,
                    padding: '10px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                    background: isListening ? '#F0F9FF' : '#F8FAFC',
                    color: '#1E293B', lineHeight: 1.5, maxHeight: 100, minHeight: 42,
                    overflowY: 'auto', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#6366F1')}
                  onBlur={e => (e.target.style.borderColor = '#E2E8F0')}
                />

                {/* Voice button */}
                <button
                  type="button"
                  onClick={toggleVoice}
                  title="Voice input"
                  style={{
                    width: 40, height: 42, borderRadius: 10, border: '1px solid #E2E8F0',
                    background: isListening ? '#EFF6FF' : 'white',
                    color: isListening ? '#3B82F6' : '#94A3B8',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: 16, transition: 'all 0.15s',
                  }}
                >
                  🎙
                </button>

                {/* Send button */}
                <button
                  type="submit"
                  disabled={!input.trim() || isStreaming}
                  style={{
                    width: 42, height: 42, borderRadius: 12, border: 'none',
                    background: (!input.trim() || isStreaming) ? '#E2E8F0' : 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                    color: (!input.trim() || isStreaming) ? '#94A3B8' : 'white',
                    cursor: (!input.trim() || isStreaming) ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all 0.15s',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </form>

              <p style={{ fontSize: 10, color: '#CBD5E1', marginTop: 8, textAlign: 'center' }}>
                AI may make mistakes. Always verify important decisions.
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── CSS animations ─────────────────────────────────────────────────── */}
      <style>{`
        @keyframes copilot-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes copilot-pulse {
          0%   { box-shadow: 0 4px 20px rgba(79,70,229,0.45), 0 0 0 0 rgba(79,70,229,0.4); }
          70%  { box-shadow: 0 4px 20px rgba(79,70,229,0.45), 0 0 0 12px rgba(79,70,229,0); }
          100% { box-shadow: 0 4px 20px rgba(79,70,229,0.45), 0 0 0 0 rgba(79,70,229,0); }
        }
        @keyframes copilot-blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; } 50% { opacity: 0; }
        }
      `}</style>
    </>
  );
}
