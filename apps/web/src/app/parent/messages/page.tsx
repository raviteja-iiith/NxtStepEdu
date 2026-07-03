'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getMessageContacts, getMessages, sendMessage } from '@school-erp/supabase/queries';
import type { ContactWithMeta } from '@school-erp/supabase/queries';
import { useIsMobile } from '@/hooks/useIsMobile';

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

const AVATAR_COLORS = [
  { bg: '#EFF6FF', color: '#1D4ED8' },
  { bg: '#F0FDF4', color: '#16A34A' },
  { bg: '#F5F3FF', color: '#7C3AED' },
  { bg: '#FFFBEB', color: '#D97706' },
  { bg: '#FDF2F8', color: '#BE185D' },
  { bg: '#F0FDFA', color: '#0F766E' },
];

export default function ParentMessagesPage() {
  const supabase = createClient();
  const [contacts, setContacts] = useState<ContactWithMeta[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactWithMeta | null>(null);
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
      const data = await getMessageContacts(supabase, user.id, 'parent');
      setContacts(data as ContactWithMeta[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Real-time subscription for contact list reordering (any new incoming message)
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`contacts_parent_${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      }, () => {
        // Re-fetch contacts to reorder by latest message
        fetchContacts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, supabase, fetchContacts]);

  useEffect(() => {
    if (!selectedContact || !userId) return;
    
    const fetchMsgs = async () => {
      setLoadingMsgs(true);
      const data = await getMessages(supabase, userId, selectedContact.id);
      setMessages(data);
      setLoadingMsgs(false);
      scrollToBottom();
      // Mark incoming messages as read
      await supabase.from('messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('receiver_id', userId)
        .eq('sender_id', selectedContact.id)
        .eq('is_read', false);
      // Update unread count in contacts list locally
      setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, unread_count: 0 } : c));
    };
    
    fetchMsgs();
    
    // Subscribe to new messages — unique channel name prevents cross-portal bleed
    const channel = supabase
      .channel(`messages_parent_${userId}_${selectedContact.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      }, (payload: any) => {
        // Only append if it's from the currently selected contact
        if (payload.new.sender_id === selectedContact.id) {
          setMessages(prev => [...prev, payload.new]);
          scrollToBottom();
          // Mark as read immediately
          supabase.from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', payload.new.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedContact, userId, supabase]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

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
      // Move this contact to top of contacts list locally
      setContacts(prev => {
        const updated = prev.map(c =>
          c.id === selectedContact.id
            ? { ...c, last_message_at: sent.created_at, last_message_preview: content }
            : c
        );
        updated.sort((a, b) => {
          if (a.last_message_at && b.last_message_at) return b.last_message_at.localeCompare(a.last_message_at);
          if (a.last_message_at && !b.last_message_at) return -1;
          if (!a.last_message_at && b.last_message_at) return 1;
          return a.full_name.localeCompare(b.full_name);
        });
        return updated;
      });
    } catch (err) {
      console.error(err);
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
    }
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

  const selectedIndex = selectedContact ? contacts.findIndex(c => c.id === selectedContact.id) : 0;
  const activeAc = AVATAR_COLORS[Math.max(0, selectedIndex) % AVATAR_COLORS.length];

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column', gap: 0, height: chatHeight, maxHeight: chatHeight }}>

      {/* Page Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Messages</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>Chat with your child&apos;s teachers directly</p>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (selectedContact ? '280px 1fr' : '280px 1fr'), gap: 0, borderRadius: 20, overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 4px 24px rgba(0,0,0,0.07)', minHeight: 0 }}>
        {/* Contacts Sidebar */}
        {(!isMobile || !selectedContact) && (
          <div style={{ display: 'flex', flexDirection: 'column', background: '#FAFBFF', borderRight: '1px solid #E8ECF0', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #E8ECF0' }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', margin: 0 }}>Teachers</p>
              <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading
                ? [1, 2, 3].map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: '#F1F5F9', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 12, borderRadius: 6, background: '#F1F5F9', width: '60%', marginBottom: 6 }} />
                        <div style={{ height: 10, borderRadius: 5, background: '#F8FAFC', width: '40%' }} />
                      </div>
                    </div>
                  ))
                : contacts.length === 0
                ? <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                    <p style={{ fontSize: 13, color: '#94A3B8' }}>No teachers found</p>
                  </div>
                  : contacts.map((c, i) => {
                  const isActive = selectedContact?.id === c.id;
                  const ac = AVATAR_COLORS[i % AVATAR_COLORS.length];
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedContact(c)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                        padding: '13px 20px', borderTop: 'none', borderRight: 'none', borderBottom: 'none', textAlign: 'left', cursor: 'pointer',
                        background: isActive ? 'linear-gradient(135deg,#EFF6FF,#DBEAFE)' : 'transparent',
                        borderLeft: isActive ? '3px solid #3B82F6' : '3px solid transparent',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = '#F1F5F9'; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: isActive ? '#BFDBFE' : ac.bg, color: isActive ? '#1D4ED8' : ac.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>
                          {c.full_name.trim().charAt(0).toUpperCase() || '?'}
                        </div>
                        {c.unread_count > 0 && (
                          <div style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: '#DC2626', color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid white' }}>{c.unread_count}</div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                          <p style={{ fontSize: 13, fontWeight: c.unread_count > 0 ? 800 : 700, color: isActive ? '#1E40AF' : '#0F172A', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.full_name}</p>
                          {c.last_message_at && (
                            <span style={{ fontSize: 10, color: c.unread_count > 0 ? '#3B82F6' : '#94A3B8', fontWeight: c.unread_count > 0 ? 700 : 500, flexShrink: 0 }}>{formatRelativeTime(c.last_message_at)}</span>
                          )}
                        </div>
                        <p style={{ fontSize: 11, color: c.unread_count > 0 ? '#334155' : '#94A3B8', margin: '1px 0 0', fontWeight: c.unread_count > 0 ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.last_message_preview || c.role || 'Teacher'}
                        </p>
                      </div>
                      {isActive && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />}
                    </button>
                  );
                })
              }
            </div>
          </div>
        )}

        {/* Chat Area */}
        {(!isMobile || selectedContact) && (
        <div style={{ display: 'flex', flexDirection: 'column', background: 'white', minHeight: 0, overflow: 'hidden' }}>
          {!selectedContact ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#94A3B8', gap: 10 }}>
              <p style={{ fontSize: 48, margin: 0 }}>💬</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#475569', margin: 0 }}>Select a teacher to start chatting</p>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Messages are private and secure</p>
            </div>
          ) : (
            <>
                {/* Chat Header */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 14, background: 'white' }}>
                {isMobile && (
                  <button onClick={() => setSelectedContact(null)} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', padding: '0 10px 0 0', color: '#64748B', display: 'flex', alignItems: 'center' }}>
                    ←
                  </button>
                )}
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: activeAc.bg, color: activeAc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17, flexShrink: 0 }}>{selectedContact.full_name.trim().charAt(0).toUpperCase() || '?'}</div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0 }}>{selectedContact.full_name}</p>
                  <p style={{ fontSize: 12, color: '#22C55E', fontWeight: 600, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />Online
                  </p>
                </div>
              </div>

              {/* Messages */}
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
                            <div style={{ width: 28, height: 28, borderRadius: 9, background: activeAc.bg, color: activeAc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, marginRight: 8, alignSelf: 'flex-end' }}>
                              {selectedContact.full_name.trim().charAt(0).toUpperCase() || '?'}
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
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#F8FAFC', borderRadius: 14, border: '1px solid #E2E8F0', padding: '0 14px', transition: 'border-color 0.15s' }}>
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
      `}</style>    </div>
  );
}
