'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getMessageContacts, getMessages, sendMessage } from '@school-erp/supabase/queries';

export default function TeacherMessagesPage() {
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
      // Mark incoming messages as read so the dashboard unread count updates
      await supabase.from('messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('receiver_id', userId)
        .eq('sender_id', selectedContact.id)
        .eq('is_read', false);
    };
    
    fetchMsgs();
    
    // Subscribe to new messages — unique channel name prevents cross-portal bleed
    const channel = supabase
      .channel(`messages_teacher_${userId}_${selectedContact.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      }, (payload: any) => {
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
      const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
      const sent = await sendMessage(supabase, {
        school_id: u?.school_id,
        sender_id: userId,
        receiver_id: selectedContact.id,
        content
      });
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? sent : m));
    } catch (err) {
      console.error(err);
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
    }
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-gray-900">Messages</h2><p className="text-gray-500 text-sm mt-1">Chat with parents in real-time</p></div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
        {/* Contacts Sidebar */}
        <div className="bg-white rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          <div className="px-5 py-4 border-b" style={{ background: '#F8FAFC', borderColor: '#E2E8F0' }}>
            <p className="font-bold text-sm text-gray-700">Parents</p>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loading ? <div className="p-4 space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-12 w-full rounded-lg" />)}</div> : 
             contacts.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm">No parents found</div> :
             contacts.map(c => (
               <button 
                 key={c.id} 
                 onClick={() => setSelectedContact(c)}
                 className={`w-full px-5 py-4 flex items-center gap-3 border-b text-left transition-colors ${selectedContact?.id === c.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                 style={{ borderColor: '#F1F5F9' }}
               >
                 <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                   {c.full_name.charAt(0)}
                 </div>
                 <div>
                   <p className={`text-sm font-semibold ${selectedContact?.id === c.id ? 'text-blue-900' : 'text-gray-900'}`}>{c.full_name}</p>
                   <p className="text-xs text-gray-500 capitalize">{c.role}</p>
                 </div>
               </button>
             ))
            }
          </div>
        </div>
        
        {/* Chat Area */}
        <div className="lg:col-span-2 bg-white rounded-2xl border flex flex-col overflow-hidden relative" style={{ borderColor: '#E2E8F0' }}>
          {!selectedContact ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400">
              <p className="text-5xl mb-3">💬</p>
              <p className="text-sm font-medium">Select a parent to start chatting</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="px-6 py-4 border-b flex items-center gap-3 bg-white z-10" style={{ borderColor: '#E2E8F0' }}>
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  {selectedContact.full_name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{selectedContact.full_name}</p>
                  <p className="text-xs text-green-600 font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Online</p>
                </div>
              </div>
              
              {/* Messages List */}
              <div className="flex-1 overflow-y-auto p-6 bg-gray-50 flex flex-col gap-4">
                {loadingMsgs ? <div className="text-center text-sm text-gray-400 my-auto">Loading messages...</div> : 
                 messages.length === 0 ? <div className="text-center text-sm text-gray-400 my-auto">No messages yet. Send a message to start the conversation!</div> :
                 messages.map(m => {
                   const isMe = m.sender_id === userId;
                   return (
                     <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                       <div className={`max-w-[75%] rounded-2xl px-5 py-3 ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border text-gray-800 rounded-tl-sm'}`}
                            style={!isMe ? { borderColor: '#E2E8F0' } : {}}>
                         <p className="text-sm">{m.content}</p>
                         <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                           {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         </p>
                       </div>
                     </div>
                   );
                 })
                }
                <div ref={messagesEndRef} />
              </div>
              
              {/* Message Input */}
              <div className="p-4 bg-white border-t" style={{ borderColor: '#E2E8F0' }}>
                <form onSubmit={handleSend} className="flex gap-2">
                  <input 
                    type="text" 
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Type a message..." 
                    className="flex-1 px-4 py-3 rounded-xl border bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all"
                    style={{ borderColor: '#E2E8F0' }}
                  />
                  <button 
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="px-6 py-3 rounded-xl text-white font-medium disabled:opacity-50 transition-all hover:shadow-md"
                    style={{ background: '#2563EB' }}
                  >
                    Send
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
