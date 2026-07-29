'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { useParent } from '@/context/ParentContext';

interface DocRequest {
  id: string;
  document_type: string;
  reason: string | null;
  status: string;
  created_at: string;
  download_url: string | null;
  rejection_reason: string | null;
}

const DOC_TYPES = [
  { value: 'bonafide', label: 'Bonafide Certificate', icon: '📋', desc: 'Confirms student enrollment at the school' },
  { value: 'transfer_certificate', label: 'Transfer Certificate', icon: '📄', desc: 'Required for admission to another school' },
  { value: 'character_certificate', label: 'Character Certificate', icon: '📜', desc: 'Certificate of good conduct and character' },
  { value: 'migration_certificate', label: 'Migration Certificate', icon: '🗂️', desc: 'For students migrating to another board' },
  { value: 'provisional_certificate', label: 'Provisional Certificate', icon: '🏅', desc: 'Temporary proof of course completion' },
];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:    { bg: '#FFFBEB', color: '#D97706' },
  processing: { bg: '#EFF6FF', color: '#1D4ED8' },
  ready:      { bg: '#F0FDF4', color: '#16A34A' },
  delivered:  { bg: '#F0FDF4', color: '#16A34A' },
  rejected:   { bg: '#FEF2F2', color: '#DC2626' },
};

export default function DocumentsPage() {
  const supabase = createClient();
  const { selectedChild, loading: childLoading } = useParent();
  const [requests, setRequests] = useState<DocRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schoolId, setSchoolId] = useState('');
  const [form, setForm] = useState({ document_type: 'bonafide', reason: '' });
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Use student_id from context instead of hardcoded limit(1) query
  const studentId = selectedChild?.student_id || '';

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: u } = await supabase.from('users').select('school_id').eq('id', user.id).single();
    if (u?.school_id) setSchoolId(u.school_id);

    const { data: docs } = await supabase.from('document_requests')
      .select('id, document_type, reason, status, created_at, download_url, rejection_reason')
      .eq('requested_by', user.id)
      .order('created_at', { ascending: false });
    if (docs) setRequests(docs as DocRequest[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Use the logged-in user's ID directly if we had it, but for simplicity we can watch the student_id or school_id, or just no filter
  useRealtimeTable('document_requests', studentId ? `student_id=eq.${studentId}` : null, fetchData);

  const handleSubmit = async () => {
    setFormError('');
    if (!studentId) { setFormError('No student linked to your account.'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase.from('document_requests').insert({
      school_id: schoolId,
      student_id: studentId,
      requested_by: user.id,
      document_type: form.document_type,
      reason: form.reason || null,
      status: 'pending',
    });

    if (error) { setFormError(error.message); setSaving(false); return; }
    setShowRequest(false);
    setForm({ document_type: 'bonafide', reason: '' });
    setSuccessMsg('Document request submitted! The school will process it within 3-5 working days.');
    fetchData();
    setSaving(false);
  };

  return (
    <div className="dashboard-container">

      {/* Page Header */}
      <div className="page-header-row" style={{ paddingBottom: 24, borderBottom: '1px solid #F1F5F9' }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Documents</h2>
          <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>Request and track official school certificates</p>
        </div>
        <button onClick={() => { setShowRequest(true); setFormError(''); }}
          style={{ padding: '11px 22px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}>
          + Request Document
        </button>
      </div>

      {successMsg && (
        <div style={{ padding: '14px 18px', borderRadius: 12, background: '#F0FDF4', color: '#16A34A', fontSize: 13, fontWeight: 600, border: '1px solid #BBF7D0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          ✓ {successMsg}
          <button onClick={() => setSuccessMsg('')} style={{ background: 'none', border: 'none', color: '#16A34A', cursor: 'pointer', fontSize: 13, fontWeight: 700, textDecoration: 'underline' }}>Dismiss</button>
        </div>
      )}

      {/* Document Type Cards */}
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 800, color: '#475569', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available Documents</h3>
        <div className="three-col-stats">
          {DOC_TYPES.map(d => (
            <div key={d.value}
              onClick={() => { setForm(f => ({ ...f, document_type: d.value })); setShowRequest(true); setFormError(''); }}
              style={{ background: 'white', borderRadius: 18, padding: '24px', border: '1px solid #E8ECF0', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 10px 30px rgba(124,58,237,0.12)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#DDD6FE'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#E8ECF0'; }}>
              <p style={{ fontSize: 36, margin: '0 0 14px' }}>{d.icon}</p>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: '0 0 6px' }}>{d.label}</h3>
              <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 16px', lineHeight: 1.5 }}>{d.desc}</p>
              <span style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 8, background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: 'white', fontSize: 12, fontWeight: 700 }}>Request →</span>
            </div>
          ))}
        </div>
      </div>

      {/* Request History */}
      <div className="list-table-container">
        <div style={{ padding: '18px 24px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#475569', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>My Requests</h3>
        </div>
        {loading ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2].map(i => <div key={i} style={{ height: 52, background: '#F8FAFC', borderRadius: 10 }} />)}
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 32, margin: '0 0 10px' }}>📂</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#475569', margin: '0 0 4px' }}>No requests yet</p>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Submit your first document request above.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Document','Requested On','Status','Action'].map(h => (
                  <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => {
                const sty = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid #F8FAFC' }}>
                    <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: 700, color: '#0F172A', textTransform: 'capitalize' }}>{r.document_type.replace(/_/g, ' ')}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#64748B' }}>{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, textTransform: 'capitalize', ...sty }}>{r.status}</span>
                      {r.rejection_reason && <p style={{ fontSize: 11, color: '#DC2626', margin: '4px 0 0' }}>{r.rejection_reason}</p>}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      {r.download_url
                        ? <a href={r.download_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: '#7C3AED', textDecoration: 'none' }}>⬇ Download</a>
                        : <span style={{ fontSize: 12, color: '#CBD5E1' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Request Modal */}
      {showRequest && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 460, background: 'white', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)' }}>
              <div>
                <p style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>📋 Request Document</p>
                <p style={{ fontSize: 13, color: '#6D28D9', margin: '3px 0 0' }}>Fill in the details below</p>
              </div>
              <button onClick={() => setShowRequest(false)} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #DDD6FE', background: 'white', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✕</button>
            </div>
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {formError && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', color: '#DC2626', fontSize: 13, border: '1px solid #FECACA' }}>{formError}</div>}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document Type *</label>
                <select value={form.document_type} onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, color: '#0F172A', background: 'white', outline: 'none' }}>
                  {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason / Purpose</label>
                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  rows={3} placeholder="Why do you need this document?"
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, color: '#0F172A', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: '#EFF6FF', color: '#1D4ED8', fontSize: 13, fontWeight: 600, border: '1px solid #BFDBFE' }}>
                📋 Processing time: 3–5 working days. You'll see the status update here.
              </div>
            </div>
            <div style={{ padding: '0 28px 24px', display: 'flex', gap: 10 }}>
              <button onClick={() => setShowRequest(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={saving}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? '⏳ Submitting...' : '✓ Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
