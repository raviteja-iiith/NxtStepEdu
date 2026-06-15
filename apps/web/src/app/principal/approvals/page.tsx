'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Tab = 'leave' | 'documents' | 'meetings';

export default function ApprovalsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('leave');
  const [leaveRequests, setLeaveRequests] = useState<Record<string, unknown>[]>([]);
  const [docRequests, setDocRequests] = useState<Record<string, unknown>[]>([]);
  const [meetingRequests, setMeetingRequests] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data: lr } = await supabase.from('leave_requests').select('*, users!leave_requests_requester_id_fkey(full_name)').order('created_at', { ascending: false });
    if (lr) setLeaveRequests(lr);
    const { data: dr } = await supabase.from('document_requests').select('*, students(full_name), users!document_requests_requested_by_fkey(full_name)').order('created_at', { ascending: false });
    if (dr) setDocRequests(dr);
    const { data: mr } = await supabase.from('meeting_requests').select('*, users!meeting_requests_parent_id_fkey(full_name)').order('created_at', { ascending: false });
    if (mr) setMeetingRequests(mr);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateLeave = async (id: string, status: string) => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from('leave_requests').update({ status, approved_by: userId }).eq('id', id);
    fetchAll();
  };

  const updateDoc = async (id: string, status: string) => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from('document_requests').update({ status, processed_by: userId, processed_at: new Date().toISOString() }).eq('id', id);
    fetchAll();
  };

  const updateMeeting = async (id: string, status: string) => {
    await supabase.from('meeting_requests').update({ status }).eq('id', id);
    fetchAll();
  };

  const tabs = [
    { key: 'leave' as Tab, label: 'Leave Requests', count: leaveRequests.filter(r => r.status === 'pending').length },
    { key: 'documents' as Tab, label: 'Document Requests', count: docRequests.filter(r => r.status === 'pending').length },
    { key: 'meetings' as Tab, label: 'Meeting Requests', count: meetingRequests.filter(r => r.status === 'pending').length },
  ];

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-gray-900">Approval Management</h2><p className="text-gray-500 text-sm mt-1">Review and process pending requests</p></div>
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#F1F5F9' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: tab === t.key ? 'white' : 'transparent', color: tab === t.key ? '#1E40AF' : '#64748B', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
            {t.label} {t.count > 0 && <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#DC2626' }}>{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        {loading ? <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}</div> : (
          <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
            {tab === 'leave' && (leaveRequests.length === 0 ? <div className="p-12 text-center text-gray-400"><p className="text-3xl mb-2">✅</p><p>No leave requests</p></div> :
              leaveRequests.map((r, i) => (
                <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div><p className="text-sm font-semibold text-gray-900">{(r.users as Record<string, string>)?.full_name}</p>
                    <p className="text-xs text-gray-500 capitalize">{r.leave_type as string} · {r.from_date as string} to {r.to_date as string}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.reason as string}</p></div>
                  <div className="flex items-center gap-2">
                    {r.status === 'pending' ? <>
                      <button onClick={() => updateLeave(r.id as string, 'approved')} className="text-xs font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: '#16A34A' }}>Approve</button>
                      <button onClick={() => updateLeave(r.id as string, 'rejected')} className="text-xs font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: '#DC2626' }}>Reject</button>
                    </> : <span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize" style={{ background: r.status === 'approved' ? '#F0FDF4' : '#FEF2F2', color: r.status === 'approved' ? '#16A34A' : '#DC2626' }}>{r.status as string}</span>}
                  </div>
                </div>
              )))}
            {tab === 'documents' && (docRequests.length === 0 ? <div className="p-12 text-center text-gray-400"><p className="text-3xl mb-2">📄</p><p>No document requests</p></div> :
              docRequests.map((r, i) => (
                <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div><p className="text-sm font-semibold text-gray-900">{(r.students as Record<string, string>)?.full_name}</p>
                    <p className="text-xs text-gray-500 capitalize">{(r.document_type as string)?.replace('_', ' ')}</p></div>
                  <div className="flex items-center gap-2">
                    {r.status === 'pending' ? <>
                      <button onClick={() => updateDoc(r.id as string, 'processing')} className="text-xs font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: '#1E40AF' }}>Process</button>
                      <button onClick={() => updateDoc(r.id as string, 'rejected')} className="text-xs font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: '#DC2626' }}>Reject</button>
                    </> : <span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize" style={{ background: '#F1F5F9' }}>{r.status as string}</span>}
                  </div>
                </div>
              )))}
            {tab === 'meetings' && (meetingRequests.length === 0 ? <div className="p-12 text-center text-gray-400"><p className="text-3xl mb-2">🤝</p><p>No meeting requests</p></div> :
              meetingRequests.map((r, i) => (
                <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div><p className="text-sm font-semibold text-gray-900">{((r as Record<string, unknown>).users as Record<string, string>)?.full_name}</p>
                    <p className="text-xs text-gray-500">{r.reason as string}</p></div>
                  <div className="flex items-center gap-2">
                    {r.status === 'pending' ? <>
                      <button onClick={() => updateMeeting(r.id as string, 'approved')} className="text-xs font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: '#16A34A' }}>Approve</button>
                      <button onClick={() => updateMeeting(r.id as string, 'rejected')} className="text-xs font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: '#DC2626' }}>Reject</button>
                    </> : <span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize" style={{ background: '#F1F5F9' }}>{r.status as string}</span>}
                  </div>
                </div>
              )))}
          </div>
        )}
      </div>
    </div>
  );
}
