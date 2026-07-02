'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';


interface ClassItem { id:string; name:string; }
interface SectionItem { id:string; name:string; class_id:string; }
interface ExamRow { id:string; name:string; exam_date:string; exam_type:string; total_marks:number; passing_marks:number|null; subject_id:string; subject_name:string; class_id:string; section_id:string|null; }
interface Student { id:string; full_name:string; roll_number:number|null; }
// marks[student_id][exam_id] = { marks_obtained, is_absent }
type MarksState = Record<string, Record<string, { marks: string; absent: boolean }>>;

const IS:React.CSSProperties = { width:'100%', padding:'8px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', background:'white', boxSizing:'border-box' };
const LS:React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 };

// Group exam rows by name+date+class
function groupByExam(rows: ExamRow[]) {
  const map = new Map<string, ExamRow[]>();
  for (const r of rows) {
    const key = `${r.name}§${r.exam_date}§${r.class_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.values()).filter(g => g.length >= 1);
}

export default function MultiMarksEntry() {
  const supabase = createClient();
  const router = useRouter();
  const [classes,  setClasses]   = useState<ClassItem[]>([]);
  const [sections, setSections]  = useState<SectionItem[]>([]);
  const [allExams, setAllExams]  = useState<ExamRow[]>([]);
  const [selClass,  setSelClass]  = useState('');
  const [selSec,    setSelSec]    = useState('');
  const [selGroup,  setSelGroup]  = useState(''); // key = name§date§class_id
  const [students,  setStudents]  = useState<Student[]>([]);
  const [marks,     setMarks]     = useState<MarksState>({});
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState('');
  const [schoolId,  setSchoolId]  = useState('');
  const [initLoad,  setInitLoad]  = useState(true);

  // ── init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) { setInitLoad(false); return; }
      const { data:u } = await supabase.from('users').select('school_id').eq('id', uid).single();
      if (!u?.school_id) { setInitLoad(false); return; }
      setSchoolId(u.school_id);
      const { data:yr } = await supabase.from('academic_years').select('id').eq('is_current',true).eq('school_id',u.school_id).maybeSingle();
      const yid = yr?.id;
      const [{ data:c }, { data:sec }] = await Promise.all([
        yid ? supabase.from('classes').select('id,name').eq('academic_year_id',yid).order('numeric_order') : supabase.from('classes').select('id,name').eq('school_id',u.school_id).order('numeric_order'),
        yid ? supabase.from('sections').select('id,name,class_id').eq('academic_year_id',yid) : supabase.from('sections').select('id,name,class_id').eq('school_id',u.school_id),
      ]);
      if (c) setClasses(c);
      if (sec) setSections(sec);
      setInitLoad(false);
    })();
  }, [supabase]);

  // fetch exams for selected class
  useEffect(() => {
    if (!selClass || !schoolId) { setAllExams([]); setSelGroup(''); return; }
    (async () => {
      const { data } = await supabase.from('exams')
        .select('id, name, exam_date, exam_type, total_marks, passing_marks, subject_id, class_id, section_id, subjects(name)')
        .eq('school_id', schoolId).eq('class_id', selClass)
        .order('exam_date', { ascending: false });
      setAllExams((data??[]).map((e:any) => ({ ...e, subject_name: e.subjects?.name ?? 'Unknown' })));
      setSelGroup('');
    })();
  }, [supabase, selClass, schoolId]);

  // derive groups
  const groups = groupByExam(allExams);
  const activeGroup = groups.find(g => `${g[0].name}§${g[0].exam_date}§${g[0].class_id}` === selGroup) ?? null;

  // fetch students + existing marks when group selected
  useEffect(() => {
    if (!activeGroup) { setStudents([]); setMarks({}); return; }
    (async () => {
      let q = supabase.from('students').select('id,full_name,roll_number').eq('is_active',true).eq('class_id', activeGroup[0].class_id);
      if (selSec) q = q.eq('section_id', selSec);
      const { data:sts } = await q.order('roll_number');
      if (!sts) return;
      setStudents(sts);

      // fetch existing marks for all exams in group
      const examIds = activeGroup.map(e => e.id);
      const { data:existingMarks } = await supabase.from('marks')
        .select('exam_id, student_id, marks_obtained, is_absent').in('exam_id', examIds);

      // build marks state
      const state: MarksState = {};
      for (const s of sts) {
        state[s.id] = {};
        for (const ex of activeGroup) {
          const m = existingMarks?.find((x:any) => x.exam_id===ex.id && x.student_id===s.id);
          state[s.id][ex.id] = { marks: m?.marks_obtained != null ? String(m.marks_obtained) : '', absent: !!m?.is_absent };
        }
      }
      setMarks(state);
    })();
  }, [supabase, activeGroup, selSec]);

  const setCell = (sid:string, eid:string, field:'marks'|'absent', val:string|boolean) => {
    setMarks(m => ({ ...m, [sid]: { ...m[sid], [eid]: { ...m[sid][eid], [field]:val, ...(field==='absent' && val ? { marks:'' } : {}) } } }));
    setSaved(false);
  };

  const saveAll = async () => {
    if (!activeGroup) return;
    setSaving(true); setError(''); setSaved(false);
    const uid = (await supabase.auth.getUser()).data.user?.id;

    // Validate: no mark should exceed that exam's total_marks
    for (const ex of activeGroup) {
      for (const s of students) {
        const cell = marks[s.id]?.[ex.id];
        if (!cell || cell.absent || cell.marks === '') continue;
        const val = parseFloat(cell.marks);
        if (isNaN(val) || val < 0 || val > ex.total_marks) {
          setError(`Invalid marks for "${s.full_name}" in "${ex.subject_name}": must be 0–${ex.total_marks}.`);
          setSaving(false); return;
        }
      }
    }

    const upserts: any[] = [];
    for (const s of students) {
      for (const ex of activeGroup) {
        const cell = marks[s.id]?.[ex.id];
        if (!cell) continue;
        const absent = cell.absent;
        const mo = absent ? null : (cell.marks !== '' ? parseFloat(cell.marks) : null);
        if (mo === null && !absent) continue; // skip untouched
        upserts.push({ exam_id:ex.id, student_id:s.id, school_id:schoolId, marks_obtained:mo, is_absent:absent, entered_by:uid });
      }
    }
    if (upserts.length === 0) { setSaving(false); setSaved(true); return; }
    const { error:err } = await supabase.from('marks').upsert(upserts, { onConflict:'exam_id,student_id' });
    if (err) setError(err.message);
    else setSaved(true);
    setSaving(false);
  };

  const filtSecs = sections.filter(s => s.class_id === selClass);
  const fmt = (n:number) => `/${n}`;

  if (initLoad) return <div style={{ padding:40, textAlign:'center', color:'#94A3B8' }}>Loading...</div>;

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <button
          onClick={() => router.push('/principal/marks')}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'white', border:'1px solid #E2E8F0', borderRadius:9, fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}
        >
          ← Results View
        </button>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>📝 Multi-Subject Marks Entry</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Enter marks for all subjects of an exam in one grid</p>
        </div>
      </div>

      {/* Selectors */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:12 }}>
        <div>
          <label style={LS}>Class *</label>
          <select value={selClass} onChange={e => { setSelClass(e.target.value); setSelSec(''); setSelGroup(''); }} style={IS}>
            <option value="">Select class...</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={LS}>Section</label>
          <select value={selSec} onChange={e => setSelSec(e.target.value)} disabled={!selClass} style={{ ...IS, opacity:selClass?1:0.5 }}>
            <option value="">All sections</option>
            {filtSecs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label style={LS}>Exam Group *</label>
          <select value={selGroup} onChange={e => setSelGroup(e.target.value)} disabled={!selClass || groups.length===0} style={{ ...IS, opacity:selClass?1:0.5 }}>
            <option value="">Select exam...</option>
            {groups.map(g => {
              const key = `${g[0].name}§${g[0].exam_date}§${g[0].class_id}`;
              const label = g.length > 1
                ? `${g[0].name} · ${new Date(g[0].exam_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})} · ${g.length} subjects`
                : `${g[0].name} · ${g[0].subject_name} · ${new Date(g[0].exam_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}`;
              return <option key={key} value={key}>{label}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Exam group summary */}
      {activeGroup && (
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {activeGroup.map(e => (
            <div key={e.id} style={{ padding:'8px 14px', background:'white', border:'1px solid #DBEAFE', borderRadius:10, display:'flex', flexDirection:'column', gap:2 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', margin:0 }}>{e.subject_name}</p>
              <p style={{ fontSize:11, color:'#64748B', margin:0 }}>Max: {e.total_marks} · Pass: {e.passing_marks ?? Math.round(e.total_marks*0.35)}</p>
            </div>
          ))}
          <div style={{ padding:'8px 14px', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:10 }}>
            <p style={{ fontSize:12, fontWeight:700, color:'#475569', margin:0 }}>Grand Total</p>
            <p style={{ fontSize:13, fontWeight:800, color:'#0F172A', margin:0 }}>{activeGroup.reduce((s,e) => s+e.total_marks,0)} marks</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!activeGroup && (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', padding:'64px 24px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
          <p style={{ fontWeight:700, color:'#1E293B', fontSize:16, margin:0 }}>Select Class & Exam</p>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Multi-subject exams appear here. Create them in the Exams page.</p>
        </div>
      )}

      {/* Marks grid */}
      {activeGroup && students.length > 0 && (
        <>
          {error && <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{error}</div>}
          {saved && <div style={{ padding:'10px 14px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:9, fontSize:13, color:'#15803D', fontWeight:700 }}>✅ All marks saved!</div>}

          <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', overflow:'auto', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            {/* Grid header */}
            <div style={{ display:'grid', gridTemplateColumns:`180px 60px repeat(${activeGroup.length},1fr) 80px`, gap:0, background:'#F8FAFC', borderBottom:'2px solid #E2E8F0', minWidth:500 }}>
              <div style={{ padding:'10px 16px', fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em' }}>Student</div>
              <div style={{ padding:'10px 8px', fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'center' }}>Roll</div>
              {activeGroup.map(ex => (
                <div key={ex.id} style={{ padding:'10px 10px', borderLeft:'1px solid #E2E8F0' }}>
                  <p style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', margin:0 }}>{ex.subject_name}</p>
                  <p style={{ fontSize:10, color:'#94A3B8', margin:'2px 0 0' }}>Max {ex.total_marks}</p>
                </div>
              ))}
              <div style={{ padding:'10px 8px', fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'center', borderLeft:'2px solid #E2E8F0' }}>Total</div>
            </div>

            {/* Rows */}
            {students.map((s, idx) => {
              const rowTotal = activeGroup.reduce((sum, ex) => {
                const cell = marks[s.id]?.[ex.id];
                return sum + (cell?.absent ? 0 : parseFloat(cell?.marks||'0')||0);
              }, 0);
              const grandMax = activeGroup.reduce((sum,ex) => sum + ex.total_marks, 0);
              const pct = grandMax > 0 ? Math.round((rowTotal/grandMax)*100) : 0;
              return (
                <div key={s.id} style={{ display:'grid', gridTemplateColumns:`180px 60px repeat(${activeGroup.length},1fr) 80px`, gap:0, borderBottom:idx<students.length-1?'1px solid #F1F5F9':'none', alignItems:'center', minWidth:500, background:idx%2===0?'white':'#FAFBFC' }}>
                  {/* Name */}
                  <div style={{ padding:'8px 16px', display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#1E3A8A,#60A5FA)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{s.full_name.charAt(0)}</div>
                    <span style={{ fontSize:12, fontWeight:600, color:'#0F172A' }}>{s.full_name}</span>
                  </div>
                  {/* Roll */}
                  <div style={{ padding:'8px', textAlign:'center', fontSize:12, color:'#94A3B8' }}>{s.roll_number??'—'}</div>
                  {/* Subject cells */}
                  {activeGroup.map(ex => {
                    const cell = marks[s.id]?.[ex.id] ?? { marks:'', absent:false };
                    return (
                      <div key={ex.id} style={{ padding:'6px 8px', borderLeft:'1px solid #F1F5F9' }}>
                        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                          <input
                            type="number" min={0} max={ex.total_marks}
                            value={cell.absent ? '' : cell.marks}
                            disabled={cell.absent}
                            onChange={e => setCell(s.id, ex.id, 'marks', e.target.value)}
                            placeholder={cell.absent ? 'Absent' : '—'}
                            style={{ flex:1, padding:'5px 8px', border:'1px solid #E2E8F0', borderRadius:7, fontSize:13, outline:'none', background:cell.absent?'#F8FAFC':'white', color:cell.absent?'#94A3B8':'#0F172A', minWidth:0 }}
                          />
                          <label title="Mark absent" style={{ display:'flex', alignItems:'center', gap:3, cursor:'pointer', fontSize:10, color:'#94A3B8', whiteSpace:'nowrap' }}>
                            <input type="checkbox" checked={cell.absent} onChange={e => setCell(s.id, ex.id, 'absent', e.target.checked)} style={{ cursor:'pointer' }}/>
                            Abs
                          </label>
                        </div>
                        {!cell.absent && cell.marks !== '' && (
                          <div style={{ marginTop:2, height:3, background:'#E2E8F0', borderRadius:99, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${Math.min(100, Math.round((parseFloat(cell.marks)||0)/ex.total_marks*100))}%`, background:'linear-gradient(90deg,#3B82F6,#06B6D4)', borderRadius:99 }}/>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Grand total */}
                  <div style={{ padding:'8px', textAlign:'center', borderLeft:'2px solid #E2E8F0' }}>
                    <p style={{ fontSize:13, fontWeight:800, color:pct>=35?'#15803D':'#DC2626', margin:0 }}>{rowTotal}</p>
                    <p style={{ fontSize:10, color:'#94A3B8', margin:0 }}>{pct}%</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save bar */}
          <div style={{ position:'sticky', bottom:0, background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 -4px 16px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize:13, color:'#64748B', margin:0 }}>{students.length} students · {activeGroup.length} subjects</p>
            <button onClick={saveAll} disabled={saving}
              style={{ padding:'10px 28px', borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer', boxShadow:'0 4px 12px rgba(59,130,246,0.3)' }}>
              {saving ? 'Saving...' : '💾 Save All Marks'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
