'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getMessageContacts, getMessages, sendMessage } from '@school-erp/supabase/queries';
import { useIsMobile } from '@/hooks/useIsMobile';

const AVATAR_COLORS = [
  { bg: '#EFF6FF', color: '#1D4ED8' },
  { bg: '#F0FDF4', color: '#16A34A' },
  { bg: '#F5F3FF', color: '#7C3AED' },
  { bg: '#FFFBEB', color: '#D97706' },
  { bg: '#FDF2F8', color: '#BE185D' },
  { bg: '#F0FDFA', color: '#0F766E' },
];

export default function TeacherMessagesPage() {
  const supabase = createClient();
  const [contacts, setContacts] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const isMobile = useIsMobile();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      const data = await getMessageContacts(supabase, user.id, 'teacher');
      setContacts(data);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  useEffect(() => {
    if (!selectedContact || !userId) return;
    const fetchMsgs = async () => {
      setLoadingMsgs(true);
      const data = await getMessages(supabase, userId, selectedContact.id);
      setMessages(data);
      setLoadingMsgs(false);
      scrollToBottom();
      await supabase.from('messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('receiver_id', userId).eq('sender_id', selectedContact.id).eq('is_read', false);
    };
    fetchMsgs();
    const channel = supabase
      .channel(`messages_teacher_${userId}_${selectedContact.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` }, (payload: any) => {
        if (payload.new.sender_id === selectedContact.id) {
          setMessages(prev => [...prev, payload.new]);
          scrollToBottom();
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedContact, userId, supabase]);

  const scrollToBottom = () => setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 80);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedContact || !userId || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');
    const tempMsg = { id: `tmp-${Date.now()}`, sender_id: userId, receiver_id: selectedContact.id, content, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempMsg]);
    scrollToBottom();
    try {
      const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
      const sent = await sendMessage(supabase, { school_id: u?.school_id, sender_id: userId, receiver_id: selectedContact.id, content });
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? sent : m));
    } catch { setMessages(prev => prev.filter(m => m.id !== tempMsg.id)); }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  // Group messages by date
  const grouped: { date: string; msgs: any[] }[] = [];
  messages.forEach(m => {
    const label = formatDate(m.created_at);
    const last = grouped[grouped.length - 1];
    if (last && last.date === label) last.msgs.push(m);
    else grouped.push({ date: label, msgs: [m] });
  });

  const chatHeight = isMobile ? 'calc(100dvh - 140px)' : '75vh';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: chatHeight, maxHeight: chatHeight }}>
      {/* Page header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>Messages</h2>
        <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>Chat with parents of your students in real-time</p>
      </div>

      {/* Chat layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (selectedContact ? '280px 1fr' : '280px 1fr'), gap: 0, borderRadius: 20, overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 4px 24px rgba(0,0,0,0.07)', minHeight: 0 }}>

        {/* --- CONTACTS SIDEBAR --- */}
        {(!isMobile || !selectedContact) && (
          <div style={{ display: 'flex', flexDirection: 'column', background: '#FAFBFF', borderRight: '1px solid #E8ECF0', minHeight: 0, overflow: 'hidden' }}>
            {/* Sidebar header */}
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #E8ECF0' }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', margin: 0 }}>Parents</p>
              <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
            </div>
            {/* Contact list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                [1, 2, 3].map(i => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: '#F1F5F9', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 12, borderRadius: 6, background: '#F1F5F9', width: '60%', marginBottom: 6 }} />
                      <div style={{ height: 10, borderRadius: 5, background: '#F8FAFC', width: '40%' }} />
                    </div>
                  </div>
                ))
              ) : contacts.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                  <p style={{ fontSize: 13, color: '#94A3B8' }}>No parents found</p>
                </div>
              ) : contacts.map((c, i) => {
                const isActive = selectedContact?.id === c.id;
                const ac = AVATAR_COLORS[i % AVATAR_COLORS.length];
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedContact(c)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '13px 20px', border: 'none', textAlign: 'left', cursor: 'pointer',
                      background: isActive ? 'linear-gradient(135deg,#EFF6FF,#DBEAFE)' : 'transparent',
                      borderLeft: isActive ? '3px solid #3B82F6' : '3px solid transparent',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = '#F1F5F9'; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: isActive ? '#BFDBFE' : ac.bg, color: isActive ? '#1D4ED8' : ac.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>
                      {c.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#1E40AF' : '#0F172A', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.full_name}</p>
                      <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>Parent</p>
                    </div>
                    {isActive && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* --- CHAT AREA --- */}
        {(!isMobile || selectedContact) && (
          <div style={{ display: 'flex', flexDirection: 'column', background: 'white', minHeight: 0, overflow: 'hidden' }}>
            {!selectedContact ? (
              /* Empty state */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>💬</div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: 0 }}>Select a parent to chat</p>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Choose from your class parents on the left</p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #E8ECF0', display: 'flex', alignItems: 'center', gap: 12, background: 'white', flexShrink: 0 }}>
                  {isMobile && (
                    <button onClick={() => setSelectedContact(null)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: '#475569', flexShrink: 0 }}>←</button>
                  )}
                  <div style={{ width: 42, height: 42, borderRadius: 13, background: '#DBEAFE', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
                    {selectedContact.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: 0 }}>{selectedContact.full_name}</p>
                    <p style={{ fontSize: 11, color: '#22C55E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, margin: '2px 0 0' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
                      Online
                    </p>
                  </div>
                </div>

                {/* Messages list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {loadingMsgs ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #BFDBFE', borderTopColor: '#3B82F6', animation: 'spin 0.8s linear infinite' }} />
                      <p style={{ fontSize: 13, color: '#94A3B8' }}>Loading messages...</p>
                    </div>
                  ) : grouped.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <div style={{ fontSize: 40 }}>👋</div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#475569', margin: 0 }}>No messages yet</p>
                      <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Send a message to start the conversation</p>
                    </div>
                  ) : grouped.map(group => (
                    <div key={group.date}>
                      {/* Date label */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 8px' }}>
                        <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                        <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, padding: '3px 10px', background: '#EEF2FF', borderRadius: 20 }}>{group.date}</span>
                        <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                      </div>
                      {group.msgs.map(m => {
                        const isMe = m.sender_id === userId;
                        return (
                          <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                            {!isMe && (
                              <div style={{ width: 28, height: 28, borderRadius: 9, background: '#DBEAFE', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, marginRight: 8, alignSelf: 'flex-end' }}>
                                {selectedContact.full_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div style={{
                              maxWidth: '72%', padding: '10px 14px',
                              borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                              background: isMe ? 'linear-gradient(135deg,#3B82F6,#1D4ED8)' : 'white',
                              color: isMe ? 'white' : '#1E293B',
                              border: isMe ? 'none' : '1px solid #E2E8F0',
                              boxShadow: isMe ? '0 2px 10px rgba(59,130,246,0.3)' : '0 1px 4px rgba(0,0,0,0.06)',
                            }}>
                              <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5, wordBreak: 'break-word' }}>{m.content}</p>
                              <p style={{ fontSize: 10, margin: '4px 0 0', textAlign: 'right', color: isMe ? 'rgba(255,255,255,0.65)' : '#94A3B8' }}>{formatTime(m.created_at)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div style={{ padding: '14px 16px', background: 'white', borderTop: '1px solid #E8ECF0', flexShrink: 0 }}>
                  <form onSubmit={handleSend} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#F8FAFC', borderRadius: 14, border: '1px solid #E2E8F0', padding: '0 14px', transition: 'border-color 0.15s' }}
                      onFocus={() => {}} onBlur={() => {}}>
                      <input
                        ref={inputRef}
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, padding: '11px 0', color: '#0F172A', fontFamily: 'inherit' }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!newMessage.trim() || sending}
                      style={{
                        width: 44, height: 44, borderRadius: 13, border: 'none', cursor: newMessage.trim() ? 'pointer' : 'default',
                        background: newMessage.trim() ? 'linear-gradient(135deg,#3B82F6,#1D4ED8)' : '#E2E8F0',
                        color: newMessage.trim() ? 'white' : '#94A3B8',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: newMessage.trim() ? '0 4px 12px rgba(59,130,246,0.35)' : 'none',
                        transition: 'all 0.2s', flexShrink: 0,
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
