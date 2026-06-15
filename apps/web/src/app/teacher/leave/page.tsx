'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const LEAVE_TYPES = ['sick', 'casual', 'earned', 'emergency', 'maternity', 'paternity', 'other'];

interface LeaveRequest { id: string; leave_type: string; from_date: string; to_date: string; reason: string; status: string; created_at: string; }

export default function LeavePage() {
  const supabase = createClient();
  const [showApply, setShowApply] = useState(false);
  const [form, setForm] = useState({ leave_type: 'casual', from_date: '', to_date: '', reason: '' });
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const inputCls = 'w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data } = await supabase
      .from('leave_requests')
      .select('id, leave_type, from_date, to_date, reason, status, created_at')
      .eq('requester_id', userId)
      .order('created_at', { ascending: false });
    if (data) setRequests(data as LeaveRequest[]);
    setLoading(false);
  }, []); // supabase client is stable

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleSubmit = async () => {
    if (!form.from_date || !form.to_date || !form.reason) { setFormError('All fields are required.'); return; }
    if (form.to_date < form.from_date) { setFormError('End date cannot be before start date.'); return; }
    setSaving(true); setFormError('');
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setSaving(false); return; }
    const { data: userRow } = await supabase.from('users').select('school_id').eq('id', userId).single();

    const { error } = await supabase.from('leave_requests').insert({
      requester_id: userId,
      school_id: userRow?.school_id,
      leave_type: form.leave_type,
      from_date: form.from_date,
      to_date: form.to_date,
      reason: form.reason,
      status: 'pending',
    });

    if (error) { setFormError(error.message); setSaving(false); return; }
    setShowApply(false);
    setForm({ leave_type: 'casual', from_date: '', to_date: '', reason: '' });
    setSaving(false);
    fetchRequests();
  };

  const getDays = (from: string, to: string) => {
    const diff = new Date(to).getTime() - new Date(from).getTime();
    return Math.ceil(diff / (1000 * 3600 * 24)) + 1;
  };

  const statusStyle: Record<string, { bg: string; color: string }> = {
    pending: { bg: '#FFFBEB', color: '#D97706' },
    approved: { bg: '#F0FDF4', color: '#16A34A' },
    rejected: { bg: '#FEF2F2', color: '#DC2626' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold text-gray-900">Leave Management</h2><p className="text-gray-500 text-sm mt-1">Apply for leave and track approval status</p></div>
        <button onClick={() => { setShowApply(true); setFormError(''); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:shadow-lg" style={{ background: '#0F766E' }}>+ Apply Leave</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{ type: 'Casual', total: 12 }, { type: 'Sick', total: 10 }, { type: 'Earned', total: 15 }, { type: 'Emergency', total: 5 }].map((l, i) => {
          const used = requests.filter(r => r.leave_type === l.type.toLowerCase() && r.status === 'approved')
            .reduce((acc, r) => acc + getDays(r.from_date, r.to_date), 0);
          return (
            <div key={i} className="bg-white rounded-2xl border p-4" style={{ borderColor: '#E2E8F0' }}>
              <p className="text-xs text-gray-500">{l.type}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: '#0F766E' }}>{l.total - used}</p>
              <p className="text-xs text-gray-400">of {l.total} remaining</p>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: '#E2E8F0' }}>
          <p className="text-3xl mb-2">🏖️</p><p className="text-gray-400 text-sm">No leave requests submitted yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          <table className="w-full">
            <thead><tr style={{ background: '#F8FAFC' }}>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Period</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Days</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Reason</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
            </tr></thead>
            <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {requests.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900 capitalize">{r.leave_type}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{new Date(r.from_date).toLocaleDateString('en-IN')} — {new Date(r.to_date).toLocaleDateString('en-IN')}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{getDays(r.from_date, r.to_date)} day{getDays(r.from_date, r.to_date) !== 1 ? 's' : ''}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{r.reason}</td>
                  <td className="px-6 py-4"><span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize" style={statusStyle[r.status] || statusStyle.pending}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showApply && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-scale-in">
            <div className="flex items-center justify-between mb-6"><h3 className="text-xl font-bold text-gray-900">Apply for Leave</h3><button onClick={() => setShowApply(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button></div>
            {formError && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{formError}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label><select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }}>{LEAVE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">From Date *</label><input type="date" value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">To Date *</label><input type="date" value={form.to_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} className={inputCls} style={{ borderColor: '#E2E8F0' }} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label><textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className={inputCls + ' resize-none'} rows={3} style={{ borderColor: '#E2E8F0' }} placeholder="Briefly explain the reason..." /></div>
              {form.from_date && form.to_date && form.to_date >= form.from_date && (
                <div className="p-3 rounded-lg text-sm text-teal-700" style={{ background: '#F0FDF4' }}>📅 {getDays(form.from_date, form.to_date)} day{getDays(form.from_date, form.to_date) !== 1 ? 's' : ''} of leave requested</div>
              )}
            </div>
            <div className="flex gap-3 pt-6">
              <button onClick={() => setShowApply(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border text-gray-700" style={{ borderColor: '#E2E8F0' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#0F766E' }}>{saving ? 'Submitting...' : 'Submit Request'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
