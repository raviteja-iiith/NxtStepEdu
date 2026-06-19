'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface AcademicYear { id:string; name:string; start_date:string; end_date:string; is_current:boolean; created_at:string; }

const IS:React.CSSProperties = { width:'100%', padding:'9px 13px', border:'1px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS:React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 };
const overlay:React.CSSProperties = { position:'fixed', inset:0, zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.6)', backdropFilter:'blur(4px)' };

export default function AcademicYearsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [years, setYears]     = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [form, setForm]       = useState({ name:'', start_date:'', end_date:'' });

  // Promote confirmation
  const [confirmPromote, setConfirmPromote] = useState<AcademicYear|null>(null);
  const [promoting, setPromoting]           = useState(false);
  const [promoteError, setPromoteError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data:u } = await supabase.from('users').select('school_id').eq('id',uid).single();
    if (!u?.school_id) { setLoading(false); return; }
    setSchoolId(u.school_id);
    const { data } = await supabase.from('academic_years').select('*').eq('school_id',u.school_id).order('start_date',{ ascending:false });
    if (data) setYears(data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name || !form.start_date || !form.end_date) { setError('All fields are required.'); return; }
    if (form.end_date <= form.start_date) { setError('End date must be after start date.'); return; }
    // Check for name conflict
    if (years.some(y => y.name.toLowerCase().trim() === form.name.toLowerCase().trim())) {
      setError(`An academic year named "${form.name}" already exists.`); return;
    }
    setSaving(true); setError('');
    const { error:err } = await supabase.from('academic_years').insert({
      name: form.name.trim(), start_date: form.start_date, end_date: form.end_date,
      school_id: schoolId, is_current: false,
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setShowAdd(false); setForm({ name:'', start_date:'', end_date:'' });
    load(); setSaving(false);
  };

  const handlePromote = async () => {
    if (!confirmPromote) return;
    setPromoting(true); setPromoteError('');
    // First un-set current from all years (safe — old data stays untouched)
    const { error:e1 } = await supabase.from('academic_years').update({ is_current:false }).eq('school_id',schoolId);
    if (e1) { setPromoteError(e1.message); setPromoting(false); return; }
    // Set the new current
    const { error:e2 } = await supabase.from('academic_years').update({ is_current:true }).eq('id',confirmPromote.id);
    if (e2) { setPromoteError(e2.message); setPromoting(false); return; }
    setPromoting(false); setConfirmPromote(null);
    load();
  };

  const fmt = (d:string) => new Date(d).toLocaleDateString('en-IN',{ day:'numeric', month:'short', year:'numeric' });

  return (
    <div style={{ maxWidth:900, margin:'0 auto', display:'flex', flexDirection:'column', gap:24 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>📅 Academic Years</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Each year's data is stored separately — past records are never overwritten</p>
        </div>
        <button onClick={() => { setShowAdd(true); setError(''); setForm({ name:'', start_date:'', end_date:'' }); }}
          style={{ padding:'10px 20px', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(59,130,246,0.3)' }}>
          + New Academic Year
        </button>
      </div>

      {/* Info banner */}
      <div style={{ padding:'14px 18px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, display:'flex', gap:12, alignItems:'flex-start' }}>
        <span style={{ fontSize:18 }}>🔒</span>
        <div>
          <p style={{ fontSize:13, fontWeight:700, color:'#92400E', margin:0 }}>Data Isolation Guarantee</p>
          <p style={{ fontSize:12, color:'#B45309', marginTop:4, margin:'4px 0 0' }}>
            Creating a new academic year <strong>never deletes or changes</strong> old-year records. Students, marks, fees, attendance — everything from 2025-26 is preserved exactly as-is when you start 2026-27. You can use the year switcher in the top bar to view any year's data at any time.
          </p>
        </div>
      </div>

      {/* Class Promotion CTA */}
      <div style={{ background:'linear-gradient(135deg,#EFF6FF,#DBEAFE)', border:'2px solid #BFDBFE', borderRadius:14, padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>🎓</div>
          <div>
            <p style={{ fontSize:14, fontWeight:800, color:'#1E3A8A', margin:0 }}>Class Promotion</p>
            <p style={{ fontSize:12, color:'#1D4ED8', marginTop:3 }}>Move all students to their next class when the academic year ends. Includes undo support.</p>
          </div>
        </div>
        <button onClick={() => router.push('/principal/settings/promotion')}
          style={{ padding:'10px 22px', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(59,130,246,0.3)', whiteSpace:'nowrap' }}>
          🎓 Go to Class Promotion →
        </button>
      </div>

      {/* Year list */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {loading ? (
          [1,2].map(i => <div key={i} style={{ height:80, background:'white', borderRadius:14, border:'1px solid #E8ECF0' }}/>)
        ) : years.length === 0 ? (
          <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', padding:'48px 24px', textAlign:'center' }}>
            <p style={{ fontSize:28, margin:0 }}>📅</p>
            <p style={{ fontWeight:700, color:'#1E293B', marginTop:10 }}>No academic years yet</p>
            <p style={{ fontSize:13, color:'#94A3B8' }}>Create your first academic year to get started</p>
          </div>
        ) : years.map(y => (
          <div key={y.id} style={{ background:'white', borderRadius:14, border:`2px solid ${y.is_current?'#3B82F6':'#E8ECF0'}`, padding:'18px 22px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap', boxShadow:y.is_current?'0 0 0 4px rgba(59,130,246,0.08)':'0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:48, height:48, borderRadius:12, background:y.is_current?'linear-gradient(135deg,#1E3A8A,#3B82F6)':'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
                {y.is_current ? '🟢' : '📂'}
              </div>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <p style={{ fontSize:16, fontWeight:800, color:'#0F172A', margin:0 }}>{y.name}</p>
                  {y.is_current && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'#DBEAFE', color:'#1D4ED8' }}>CURRENT</span>}
                </div>
                <p style={{ fontSize:12, color:'#64748B', margin:'4px 0 0' }}>{fmt(y.start_date)} → {fmt(y.end_date)}</p>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {!y.is_current && (
                <button onClick={() => { setConfirmPromote(y); setPromoteError(''); }}
                  style={{ padding:'8px 16px', borderRadius:9, border:'1px solid #D1FAE5', background:'linear-gradient(135deg,#ECFDF5,#D1FAE5)', color:'#065F46', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  🔄 Set as Current
                </button>
              )}
              {y.is_current && (
                <span style={{ fontSize:12, color:'#15803D', fontWeight:600 }}>✓ Active year</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Create New Year Modal ─────────────────────────────────────────── */}
      {showAdd && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:440, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', overflow:'hidden' }}>
            <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <h3 style={{ fontSize:16, fontWeight:800, color:'#0F172A', margin:0 }}>New Academic Year</h3>
                <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Old year data is preserved automatically</p>
              </div>
              <button onClick={() => setShowAdd(false)} style={{ width:30, height:30, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', color:'#64748B' }}>✕</button>
            </div>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              {error && <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{error}</div>}
              <div>
                <label style={LS}>Year Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))}
                  placeholder='e.g. "2026-27" or "Academic Year 2026-27"' style={IS}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={LS}>Start Date *</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date:e.target.value }))} style={IS}/>
                </div>
                <div>
                  <label style={LS}>End Date *</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date:e.target.value }))} style={IS}/>
                </div>
              </div>
              <div style={{ padding:'10px 14px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:9, fontSize:12, color:'#15803D' }}>
                ✅ This will <strong>not</strong> be set as current immediately. Use "Set as Current" when you're ready to start the new year.
              </div>
            </div>
            <div style={{ padding:'0 24px 20px', display:'flex', gap:10 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex:1, padding:11, borderRadius:9, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving}
                style={{ flex:1, padding:11, borderRadius:9, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                {saving ? 'Creating...' : 'Create Year'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Promote Confirmation Modal ────────────────────────────────────── */}
      {confirmPromote && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:460, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.25)', overflow:'hidden' }}>
            <div style={{ padding:'20px 24px 14px', borderBottom:'1px solid #FEE2E2', background:'linear-gradient(135deg,#FFF7ED,#FEF3C7)' }}>
              <p style={{ fontSize:16, fontWeight:800, color:'#92400E', margin:0 }}>⚠ Switch Active Year?</p>
              <p style={{ fontSize:13, color:'#78350F', marginTop:4 }}>You're about to set <strong>{confirmPromote.name}</strong> as the current academic year.</p>
            </div>
            <div style={{ padding:'18px 24px', display:'flex', flexDirection:'column', gap:12 }}>
              {promoteError && <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{promoteError}</div>}
              <div style={{ padding:'12px 16px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10 }}>
                <p style={{ fontSize:13, fontWeight:700, color:'#15803D', margin:'0 0 6px' }}>✅ What happens</p>
                <ul style={{ margin:0, paddingLeft:18, fontSize:12, color:'#166534', display:'flex', flexDirection:'column', gap:4 }}>
                  <li>All existing records (students, marks, fees, attendance) from the old year are <strong>preserved exactly</strong></li>
                  <li>New data entry will default to <strong>{confirmPromote.name}</strong></li>
                  <li>You can still browse old years using the year switcher in the top bar</li>
                </ul>
              </div>
              <div style={{ padding:'12px 16px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:10 }}>
                <p style={{ fontSize:13, fontWeight:700, color:'#DC2626', margin:'0 0 6px' }}>⚠ What to do next</p>
                <ul style={{ margin:0, paddingLeft:18, fontSize:12, color:'#991B1B', display:'flex', flexDirection:'column', gap:4 }}>
                  <li>Re-enroll students for the new year (or promote them via bulk action)</li>
                  <li>Set up new classes and sections for <strong>{confirmPromote.name}</strong></li>
                  <li>Old year student records remain archived and readable</li>
                </ul>
              </div>
            </div>
            <div style={{ padding:'0 24px 20px', display:'flex', gap:10 }}>
              <button onClick={() => setConfirmPromote(null)} style={{ flex:1, padding:11, borderRadius:9, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handlePromote} disabled={promoting}
                style={{ flex:1, padding:11, borderRadius:9, border:'none', background:promoting?'#FCD34D':'linear-gradient(135deg,#D97706,#F59E0B)', color:'white', fontSize:13, fontWeight:700, cursor:promoting?'not-allowed':'pointer' }}>
                {promoting ? 'Switching...' : `✓ Yes, Set ${confirmPromote.name} as Current`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
