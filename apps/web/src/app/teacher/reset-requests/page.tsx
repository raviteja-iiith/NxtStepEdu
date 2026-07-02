'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ResetRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_identifier: string;
  role: 'parent';
  class_name: string | null;
  section_name: string | null;
  status: 'pending' | 'resolved';
  requested_at: string;
  resolved_at: string | null;
}

const overlay: React.CSSProperties = { position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)' };

export default function TeacherResetRequestsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [credential, setCredential] = useState<{ name:string; phone:string; pin:string } | null>(null);
  const [error, setError] = useState('');
  // Teacher's assigned sections (for filtering)
  const [mySections, setMySections] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: cu } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!cu?.school_id) { setLoading(false); return; }

    // Get teacher's sections from assignments
    const { data: assignments } = await supabase
      .from('assignments')
      .select('sections(name), classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', cu.school_id);

    const sectionLabels: string[] = [];
    (assignments || []).forEach((a: any) => {
      const cn = a.classes?.name;
      const sn = a.sections?.name;
      if (cn && sn) sectionLabels.push(`${cn}-${sn}`);
    });
    setMySections(sectionLabels);

    // Fetch all pending parent reset requests for this school
    const { data } = await supabase
      .from('password_reset_requests')
      .select('*')
      .eq('school_id', cu.school_id)
      .eq('role', 'parent')
      .order('requested_at', { ascending: false });

    // Filter to only requests from teacher's sections
    const myRequests = (data || []).filter((r: any) => {
      if (!r.class_name || !r.section_name) return false;
      return sectionLabels.includes(`${r.class_name}-${r.section_name}`);
    });

    setRequests(myRequests as ResetRequest[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleResolve = async (req: ResetRequest) => {
    setResolving(req.id); setError('');
    const res = await fetch('/api/auth/reset-credential', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: req.user_id, request_id: req.id }),
    });
    const result = await res.json();
    setResolving(null);
    if (!res.ok) { setError(result.error || 'Failed to reset PIN'); return; }
    setCredential({ name: req.user_name, phone: req.user_identifier, pin: result.new_credential });
    fetchData();
  };

  const pending = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status === 'resolved');

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>🔑 Parent PIN Reset Requests</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Reset PINs for parents in your assigned sections</p>
        </div>
      </div>

      {mySections.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
          <span style={{ fontSize:12, color:'#64748B', fontWeight:600 }}>Your sections:</span>
          {mySections.map(s => (
            <span key={s} style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99, background:'#EFF6FF', color:'#1D4ED8' }}>{s}</span>
          ))}
        </div>
      )}

      {error && <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626', marginBottom:16 }}>{error}</div>}

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
                      <p style={{ fontSize:12, color:'#64748B', margin:'3px 0 0' }}>
                        <span style={{ fontFamily:'monospace' }}>📱 {r.user_identifier}</span>
                        {r.class_name && <span style={{ marginLeft:10, background:'#EFF6FF', color:'#1D4ED8', padding:'1px 8px', borderRadius:6 }}>Class {r.class_name} – {r.section_name}</span>}
                      </p>
                      <p style={{ fontSize:11, color:'#94A3B8', margin:'4px 0 0' }}>Requested: {new Date(r.requested_at).toLocaleString('en-IN')}</p>
                    </div>
                    <button
                      onClick={() => handleResolve(r)}
                      disabled={resolving === r.id}
                      style={{ padding:'8px 18px', borderRadius:9, border:'none', background: resolving===r.id?'#93C5FD':'linear-gradient(135deg,#059669,#10B981)', color:'white', fontSize:13, fontWeight:700, cursor:resolving===r.id?'not-allowed':'pointer', whiteSpace:'nowrap' }}
                    >
                      {resolving === r.id ? 'Generating…' : '🔑 Generate New PIN'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pending.length === 0 && (
            <div style={{ padding:'48px 24px', textAlign:'center', background:'white', borderRadius:16, border:'1px solid #E2E8F0', marginBottom:24 }}>
              <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
              <p style={{ fontWeight:700, color:'#0F172A', fontSize:15, margin:0 }}>No pending requests</p>
              <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>All parent PIN reset requests in your sections are resolved.</p>
            </div>
          )}

          {/* Resolved */}
          {resolved.length > 0 && (
            <div>
              <p style={{ fontSize:12, fontWeight:700, color:'#059669', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>✅ Resolved ({resolved.length})</p>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {resolved.slice(0, 8).map(r => (
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

      {/* PIN Display Modal */}
      {credential && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:380, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', padding:'32px 28px', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:14, background:'#F0FDF4', border:'2px solid #BBF7D0', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:24 }}>🔑</div>
            <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:'0 0 6px' }}>New PIN Generated!</h3>
            <p style={{ fontSize:13, color:'#64748B', margin:'0 0 20px' }}>Share this with the parent:</p>
            <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:'18px 20px', textAlign:'left', marginBottom:20, display:'flex', flexDirection:'column', gap:12 }}>
              <div><p style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', margin:0 }}>Parent Name</p><p style={{ fontSize:15, fontWeight:700, color:'#0F172A', margin:'4px 0 0' }}>{credential.name}</p></div>
              <div><p style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', margin:0 }}>Phone / Login ID</p><p style={{ fontSize:16, fontWeight:700, color:'#1E3A8A', margin:'4px 0 0', fontFamily:'monospace', letterSpacing:1 }}>{credential.phone}</p></div>
              <div><p style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', margin:0 }}>New PIN</p><p style={{ fontSize:28, fontWeight:800, color:'#059669', margin:'4px 0 0', fontFamily:'monospace', letterSpacing:6 }}>{credential.pin}</p></div>
            </div>
            <p style={{ fontSize:11, color:'#94A3B8', marginBottom:20 }}>⚠ Save this now — it cannot be retrieved later.</p>
            <button onClick={() => setCredential(null)} style={{ width:'100%', padding:12, borderRadius:10, border:'none', background:'linear-gradient(135deg,#059669,#10B981)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>Got it — Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
