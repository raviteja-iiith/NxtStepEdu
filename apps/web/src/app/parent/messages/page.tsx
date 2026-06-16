'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getMessageContacts, getMessages, sendMessage } from '@school-erp/supabase/queries';

export default function ParentMessagesPage() {
  const supabase = createClient();
  const [contacts, setContacts] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      const data = await getMessageContacts(supabase, user.id, 'parent');
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
      // Mark incoming messages as read
      await supabase.from('messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('receiver_id', userId)
        .eq('sender_id', selectedContact.id)
        .eq('is_read', false);
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
    if (!newMessage.trim() || !selectedContact || !userId) return;
    
    const content = newMessage;
    setNewMessage('');
    
    // Optimistic UI update
    const tempMsg = {
      id: Math.random().toString(),
      sender_id: userId,
      receiver_id: selectedContact.id,
      content,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempMsg]);
    scrollToBottom();
    
    try {
      // Actually send to DB
      const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
      
      const sent = await sendMessage(supabase, {
        school_id: u?.school_id,
        sender_id: userId,
        receiver_id: selectedContact.id,
        content
      });
      
      // Update with real ID
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? sent : m));
    } catch (err) {
      console.error(err);
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
    }
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Page Header */}
      <div style={{ paddingBottom: 24, borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Messages</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>Chat with your child's teachers directly</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, height: 620 }}>
        {/* Contacts Sidebar */}
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #E8ECF0', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '18px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#475569', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Teachers</p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading
              ? <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>{[1,2,3].map(i => <div key={i} style={{ height: 56, background: '#F1F5F9', borderRadius: 10 }} />)}</div>
              : contacts.length === 0
              ? <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No teachers found</div>
              : contacts.map(c => (
                <button key={c.id} onClick={() => setSelectedContact(c)}
                  style={{ width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #F8FAFC', background: selectedContact?.id === c.id ? '#EFF6FF' : 'white', border: 'none', cursor: 'pointer', textAlign: 'left', borderLeft: selectedContact?.id === c.id ? '3px solid #2563EB' : '3px solid transparent', transition: 'all 0.15s' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#1D4ED8,#3B82F6)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{c.full_name.charAt(0)}</div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: selectedContact?.id === c.id ? '#1E40AF' : '#0F172A', margin: 0 }}>{c.full_name}</p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0', textTransform: 'capitalize', fontWeight: 500 }}>{c.role}</p>
                  </div>
                </button>
              ))
            }
          </div>
        </div>

        {/* Chat Area */}
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #E8ECF0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
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
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#1D4ED8,#3B82F6)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17, flexShrink: 0 }}>{selectedContact.full_name.charAt(0)}</div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0 }}>{selectedContact.full_name}</p>
                  <p style={{ fontSize: 12, color: '#22C55E', fontWeight: 600, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />Online
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {loadingMsgs
                  ? <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: 13, margin: 'auto 0' }}>Loading messages...</p>
                  : messages.length === 0
                  ? <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: 13, margin: 'auto 0' }}>No messages yet. Send one to start the conversation!</p>
                  : messages.map(m => {
                    const isMe = m.sender_id === userId;
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '72%', padding: '12px 16px', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                          background: isMe ? 'linear-gradient(135deg,#1D4ED8,#2563EB)' : 'white',
                          color: isMe ? 'white' : '#0F172A',
                          border: isMe ? 'none' : '1px solid #E2E8F0',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                          <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>{m.content}</p>
                          <p style={{ fontSize: 10, margin: '5px 0 0', color: isMe ? 'rgba(255,255,255,0.6)' : '#94A3B8', textAlign: 'right' }}>
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                }
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div style={{ padding: '16px 20px', background: 'white', borderTop: '1px solid #F1F5F9' }}>
                <form onSubmit={handleSend} style={{ display: 'flex', gap: 10 }}>
                  <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type a message..."
                    style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 14, color: '#0F172A', background: '#F8FAFC', outline: 'none' }} />
                  <button type="submit" disabled={!newMessage.trim()}
                    style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: newMessage.trim() ? 'linear-gradient(135deg,#1D4ED8,#3B82F6)' : '#F1F5F9', color: newMessage.trim() ? 'white' : '#94A3B8', fontSize: 14, fontWeight: 700, cursor: newMessage.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
                    Send →
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
