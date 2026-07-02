'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const LEAVE_TYPES = ['sick', 'casual', 'earned', 'emergency', 'maternity', 'paternity', 'other'];

const IS: React.CSSProperties = { width:'100%', padding:'9px 13px', border:'1px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS: React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 };

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
    const today = new Date().toISOString().split('T')[0];
    if (form.from_date < today) { setFormError('Leave cannot be applied for past dates.'); return; }
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
    <div className="dashboard-container">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Leave Management</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Apply for leave and track approval status</p>
        </div>
        <button onClick={() => { setShowApply(true); setFormError(''); }}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(15,118,110,0.3)', whiteSpace:'nowrap' }}>
          + Apply Leave
        </button>
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
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)' }}>
          <div style={{ width:'100%', maxWidth:500, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column', maxHeight:'92vh', overflowY:'auto', padding:'32px 32px 28px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
              <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Apply for Leave</h3>
              <button onClick={() => setShowApply(false)} style={{ border:'none', background:'transparent', color:'#94A3B8', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            {formError && <div style={{ marginBottom:16, padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{formError}</div>}
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={LS}>Leave Type</label>
                <select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))} style={IS}>
                  {LEAVE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={LS}>From Date *</label>
                  <input type="date" value={form.from_date} min={new Date().toISOString().split('T')[0]} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} style={IS} />
                </div>
                <div>
                  <label style={LS}>To Date *</label>
                  <input type="date" value={form.to_date} min={form.from_date || new Date().toISOString().split('T')[0]} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} style={IS} />
                </div>
              </div>
              <div>
                <label style={LS}>Reason *</label>
                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} style={{ ...IS, resize:'none' }} rows={3} placeholder="Briefly explain the reason..." />
              </div>
              {form.from_date && form.to_date && form.to_date >= form.from_date && (
                <div style={{ padding:'10px 14px', borderRadius:9, fontSize:13, color:'#0F766E', background:'#F0FDF4', border:'1px solid #CCFBF1', fontWeight:600 }}>📅 {getDays(form.from_date, form.to_date)} day{getDays(form.from_date, form.to_date) !== 1 ? 's' : ''} of leave requested</div>
              )}
            </div>
            <div style={{ display:'flex', gap:12, marginTop:28 }}>
              <button onClick={() => setShowApply(false)} style={{ flex:1, padding:'11px 16px', borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={saving} style={{ flex:1, padding:'11px 16px', borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer', boxShadow:'0 4px 12px rgba(15,118,110,0.3)' }}>
                {saving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
