'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ResetRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_identifier: string;
  role: 'parent' | 'teacher';
  class_name: string | null;
  section_name: string | null;
  status: 'pending' | 'resolved';
  requested_at: string;
  resolved_at: string | null;
}

const overlay: React.CSSProperties = { position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)' };

export default function PrincipalResetRequestsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<'parent' | 'teacher'>('parent');
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState('');
  const [resolving, setResolving] = useState<string | null>(null);
  const [credential, setCredential] = useState<{ name:string; identifier:string; cred:string; role:string } | null>(null);
  const [error, setError] = useState('');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: cu } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!cu?.school_id) { setLoading(false); return; }
    setSchoolId(cu.school_id);
    const { data } = await supabase
      .from('password_reset_requests')
      .select('*')
      .eq('school_id', cu.school_id)
      .order('requested_at', { ascending: false });
    if (data) setRequests(data as ResetRequest[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleResolve = async (req: ResetRequest) => {
    setResolving(req.id); setError('');
    const res = await fetch('/api/auth/reset-credential', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: req.user_id, request_id: req.id }),
    });
    const result = await res.json();
    setResolving(null);
    if (!res.ok) { setError(result.error || 'Failed to reset'); return; }
    setCredential({
      name: req.user_name,
      identifier: req.user_identifier,
      cred: result.new_credential,
      role: req.role,
    });
    fetchRequests();
  };

  const handleDismiss = async (req: ResetRequest) => {
    if (!confirm(`Dismiss reset request for "${req.user_name}"? This will mark it as resolved without resetting any credentials.`)) return;
    setResolving(req.id); setError('');
    const { error: updateErr } = await supabase.from('password_reset_requests').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    }).eq('id', req.id);
    setResolving(null);
    if (updateErr) { setError('Failed to dismiss request'); return; }
    fetchRequests();
  };

  const filtered = requests.filter(r => r.role === tab);
  const pending = filtered.filter(r => r.status === 'pending');
  const resolved = filtered.filter(r => r.status === 'resolved');

  const tabBtn = (t: 'parent'|'teacher', label: string, count: number) => (
    <button onClick={() => setTab(t)} style={{
      padding:'9px 20px', borderRadius:10, border:'none', cursor:'pointer', fontSize:13, fontWeight:700,
      background: tab===t ? 'linear-gradient(135deg,#1E3A8A,#3B82F6)' : 'white',
      color: tab===t ? 'white' : '#475569',
      boxShadow: tab===t ? '0 4px 12px rgba(59,130,246,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {label} {count > 0 && <span style={{ marginLeft:6, background:tab===t?'rgba(255,255,255,0.25)':'#EFF6FF', color:tab===t?'white':'#1D4ED8', borderRadius:99, padding:'1px 7px', fontSize:11 }}>{count}</span>}
    </button>
  );

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>🔑 Credential Reset Requests</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Reset PINs for parents and passwords for teachers</p>
        </div>
      </div>

      {error && <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626', marginBottom:16 }}>{error}</div>}

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:24 }}>
        {tabBtn('parent', '👨‍👩‍👧 Parent PIN Resets', requests.filter(r=>r.role==='parent'&&r.status==='pending').length)}
        {tabBtn('teacher', '👩‍🏫 Teacher Password Resets', requests.filter(r=>r.role==='teacher'&&r.status==='pending').length)}
      </div>

      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[1,2,3].map(i=><div key={i} style={{ height:68, background:'#F8FAFC', borderRadius:10 }}/>)}
        </div>
      ) : (
        <>
          {/* Pending */}
          {pending.length > 0 && (
            <div style={{ marginBottom:28 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'#DC2626', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>⏳ Pending ({pending.length})</p>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {pending.map(r => (
                  <div key={r.id} style={{ background:'white', border:'1px solid #FEE2E2', borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                    <div>
                      <p style={{ fontSize:14, fontWeight:700, color:'#0F172A', margin:0 }}>{r.user_name}</p>
                      <p style={{ fontSize:12, color:'#64748B', margin:'3px 0 0', fontFamily:'monospace' }}>
                        {r.role === 'parent' ? `📱 ${r.user_identifier}` : `📧 ${r.user_identifier}`}
                        {r.class_name && <span style={{ marginLeft:10, background:'#EFF6FF', color:'#1D4ED8', padding:'1px 8px', borderRadius:6, fontFamily:'inherit' }}>Class {r.class_name} – {r.section_name}</span>}
                      </p>
                      <p style={{ fontSize:11, color:'#94A3B8', margin:'4px 0 0' }}>Requested: {new Date(r.requested_at).toLocaleString('en-IN')}</p>
                    </div>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                      <button
                        onClick={() => handleDismiss(r)}
                        disabled={resolving === r.id}
                        style={{ padding:'8px 14px', borderRadius:9, border:'1px solid #E2E8F0', background:'white', color:'#64748B', fontSize:12, fontWeight:600, cursor: resolving===r.id ? 'not-allowed' : 'pointer', whiteSpace:'nowrap' }}
                      >
                        ✕ Dismiss
                      </button>
                      <button
                        onClick={() => handleResolve(r)}
                        disabled={resolving === r.id}
                        style={{ padding:'8px 18px', borderRadius:9, border:'none', background: resolving===r.id ? '#93C5FD' : 'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor: resolving===r.id ? 'not-allowed' : 'pointer', whiteSpace:'nowrap' }}
                      >
                        {resolving === r.id ? 'Generating…' : `🔑 Generate New ${r.role === 'parent' ? 'PIN' : 'Password'}`}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pending.length === 0 && (
            <div style={{ padding:'48px 24px', textAlign:'center', background:'white', borderRadius:16, border:'1px solid #E2E8F0', marginBottom:24 }}>
              <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
              <p style={{ fontWeight:700, color:'#0F172A', fontSize:15, margin:0 }}>No pending requests</p>
              <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>All {tab} reset requests have been resolved.</p>
            </div>
          )}

          {/* Resolved History */}
          {resolved.length > 0 && (
            <div>
              <p style={{ fontSize:12, fontWeight:700, color:'#059669', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>✅ Resolved History ({resolved.length})</p>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {resolved.slice(0, 10).map(r => (
                  <div key={r.id} style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, opacity:0.7 }}>
                    <div>
                      <p style={{ fontSize:13, fontWeight:600, color:'#334155', margin:0 }}>{r.user_name}</p>
                      <p style={{ fontSize:11, color:'#94A3B8', margin:'2px 0 0', fontFamily:'monospace' }}>{r.user_identifier}</p>
                    </div>
                    <span style={{ fontSize:11, color:'#059669', fontWeight:600 }}>Resolved {r.resolved_at ? new Date(r.resolved_at).toLocaleDateString('en-IN') : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* New Credential Display Modal */}
      {credential && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:400, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', padding:'32px 28px', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:14, background:'#F0FDF4', border:'2px solid #BBF7D0', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:24 }}>🔑</div>
            <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:'0 0 6px' }}>New Credential Generated!</h3>
            <p style={{ fontSize:13, color:'#64748B', margin:'0 0 20px' }}>Share these details with {credential.name}:</p>
            <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:'18px 20px', textAlign:'left', marginBottom:20, display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <p style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', margin:0 }}>Name</p>
                <p style={{ fontSize:15, fontWeight:700, color:'#0F172A', margin:'4px 0 0' }}>{credential.name}</p>
              </div>
              <div>
                <p style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', margin:0 }}>{credential.role === 'parent' ? 'Phone / Login ID' : 'Email / Login ID'}</p>
                <p style={{ fontSize:14, fontWeight:700, color:'#1E3A8A', margin:'4px 0 0', fontFamily:'monospace' }}>{credential.identifier}</p>
              </div>
              <div>
                <p style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', margin:0 }}>New {credential.role === 'parent' ? 'PIN' : 'Password'}</p>
                <p style={{ fontSize:credential.role==='parent'?28:20, fontWeight:800, color:'#7C3AED', margin:'4px 0 0', fontFamily:'monospace', letterSpacing:credential.role==='parent'?6:2 }}>{credential.cred}</p>
              </div>
            </div>
            <p style={{ fontSize:11, color:'#94A3B8', marginBottom:20 }}>⚠ Save this now — it cannot be retrieved later.</p>
            <button onClick={() => setCredential(null)} style={{ width:'100%', padding:12, borderRadius:10, border:'none', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>Got it — Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
