'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface ClassItem  { id:string; name:string; }
interface SectionItem{ id:string; name:string; class_id:string; }
interface ExamRow {
  id:string; name:string; exam_date:string; exam_type:string;
  total_marks:number; passing_marks:number|null;
  subject_id:string; subject_name:string;
  class_id:string; section_id:string|null;
  section_name?:string|null;
}
interface Student { id:string; full_name:string; roll_number:number|null; }
type CellState = { marks:string; absent:boolean; remarks:string; dirty:boolean; };
type MarksState = Record<string, Record<string, CellState>>;
type ExamEdits  = Record<string, { total_marks:string; passing_marks:string }>;

const IS:React.CSSProperties = { width:'100%', padding:'8px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', background:'white', boxSizing:'border-box' };
const LS:React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 };
const CELL_INPUT:React.CSSProperties = { width:'100%', padding:'5px 7px', border:'1.5px solid #E2E8F0', borderRadius:7, fontSize:13, fontWeight:700, textAlign:'center' as const, outline:'none', boxSizing:'border-box' as const, minWidth:0 };

/**
 * Unique key identifying a multi-subject exam group.
 * Grouping MUST include section_id (or 'all' for school/class-wide exams).
 * If section_id was omitted, exams created for different sections (e.g., MPC-B vs BIPC)
 * with the same name and date would be incorrectly merged together, causing subjects
 * to appear multiple times (e.g. Telugu, chemistry, Telugu, chemistry).
 */
function getExamGroupKey(r: { name: string; exam_date: string; class_id: string; section_id?: string | null }) {
  return `${r.name}§${r.exam_date}§${r.class_id}§${r.section_id || 'all'}`;
}

/**
 * Groups exam rows by (name, exam_date, class_id, section_id)
 * and guarantees that within an exam group each subject appears EXACTLY ONCE.
 */
function groupByExam(rows: ExamRow[]) {
  const map = new Map<string, ExamRow[]>();
  for (const r of rows) {
    const key = getExamGroupKey(r);
    if (!map.has(key)) map.set(key, []);
    const existing = map.get(key)!;
    // Deduplicate: avoid adding the same subject twice in the same exam group
    if (!existing.some(e => e.subject_id === r.subject_id)) {
      existing.push(r);
    }
  }
  return Array.from(map.values());
}

export default function MultiMarksEntry() {
  const supabase = createClient();
  const router   = useRouter();

  const [classes,      setClasses]      = useState<ClassItem[]>([]);
  const [sections,     setSections]     = useState<SectionItem[]>([]);
  const [allExams,     setAllExams]     = useState<ExamRow[]>([]);
  const [selClass,     setSelClass]     = useState('');
  const [selSec,       setSelSec]       = useState('');
  const [selGroup,     setSelGroup]     = useState('');
  const [students,     setStudents]     = useState<Student[]>([]);
  const [marks,        setMarks]        = useState<MarksState>({});
  const [examEdits,    setExamEdits]    = useState<ExamEdits>({});
  const [saving,       setSaving]       = useState(false);
  const [savingExam,   setSavingExam]   = useState('');
  const [saved,        setSaved]        = useState(false);
  const [error,        setError]        = useState('');
  const [schoolId,     setSchoolId]     = useState('');
  const [initLoad,     setInitLoad]     = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [deletingRow,  setDeletingRow]  = useState('');

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
        yid ? supabase.from('classes').select('id,name').eq('academic_year_id',yid).order('numeric_order')
             : supabase.from('classes').select('id,name').eq('school_id',u.school_id).order('numeric_order'),
        yid ? supabase.from('sections').select('id,name,class_id').eq('academic_year_id',yid)
             : supabase.from('sections').select('id,name,class_id').eq('school_id',u.school_id),
      ]);
      if (c) setClasses(c);
      if (sec) setSections(sec);
      setInitLoad(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── fetch exams for selected class ────────────────────────────────────────
  useEffect(() => {
    if (!selClass || !schoolId) { setAllExams([]); setSelGroup(''); return; }
    (async () => {
      const { data } = await supabase.from('exams')
        .select('id, name, exam_date, exam_type, total_marks, passing_marks, subject_id, class_id, section_id, subjects(name), sections(name)')
        .eq('school_id', schoolId).eq('class_id', selClass)
        .order('exam_date', { ascending: false });
      setAllExams((data??[]).map((e:any) => ({ 
        ...e, 
        subject_name: e.subjects?.name ?? 'Unknown',
        section_name: e.sections?.name ?? null
      })));
      setSelGroup('');
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selClass, schoolId]);

  // ── fetch students + marks when group/section changes ─────────────────────
  useEffect(() => {
    setSaved(false);
    setError('');

    if (!selGroup || !selClass) { setStudents([]); setMarks({}); setExamEdits({}); return; }
    const grps = groupByExam(allExams);
    const grp = grps.find(g => getExamGroupKey(g[0]) === selGroup) ?? null;
    if (!grp) { setStudents([]); setMarks({}); setExamEdits({}); return; }

    (async () => {
      let q = supabase.from('students')
        .select('id,full_name,roll_number')
        .eq('is_active', true)
        .eq('class_id', grp[0].class_id);

      // If exam is for a specific section, only load that section's students
      if (grp[0].section_id) {
        q = q.eq('section_id', grp[0].section_id);
      } else if (selSec) {
        // Exam was for all sections, but user explicitly filtered by section
        q = q.eq('section_id', selSec);
      }

      const { data:sts } = await q.order('roll_number');
      if (!sts) return;
      setStudents(sts);

      const examIds = grp.map(e => e.id);
      const { data:existingMarks } = await supabase.from('marks')
        .select('exam_id, student_id, marks_obtained, is_absent, remarks').in('exam_id', examIds);

      const state: MarksState = {};
      for (const s of sts) {
        state[s.id] = {};
        for (const ex of grp) {
          const m = existingMarks?.find((x:any) => x.exam_id===ex.id && x.student_id===s.id);
          state[s.id][ex.id] = { marks: m?.marks_obtained!=null ? String(m.marks_obtained):'', absent:!!m?.is_absent, remarks:m?.remarks??'', dirty:false };
        }
      }
      setMarks(state);

      const ee: ExamEdits = {};
      for (const ex of grp) ee[ex.id] = { total_marks: String(ex.total_marks), passing_marks: ex.passing_marks!=null ? String(ex.passing_marks):'' };
      setExamEdits(ee);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selGroup, selClass, selSec, allExams]);

  // ── derived ────────────────────────────────────────────────────────────────
  const allGroups   = groupByExam(allExams);
  const filtSecs    = sections.filter(s => s.class_id === selClass);

  // If a specific section is chosen, filter groups to only those that belong to that section or all-section exams
  const groups = selSec
    ? allGroups.filter(g => !g[0].section_id || g[0].section_id === selSec)
    : allGroups;

  const activeGroup = groups.find(g => getExamGroupKey(g[0]) === selGroup) ?? null;

  const displayGroup: ExamRow[] = (activeGroup ?? []).map(ex => ({
    ...ex,
    total_marks:   examEdits[ex.id] ? (parseFloat(examEdits[ex.id].total_marks)||ex.total_marks) : ex.total_marks,
    passing_marks: examEdits[ex.id] ? (examEdits[ex.id].passing_marks!=='' ? parseFloat(examEdits[ex.id].passing_marks) : null) : ex.passing_marks,
  }));

  const dirtyCount = Object.values(marks).reduce((n, byExam) => n + Object.values(byExam).filter(c => c.dirty).length, 0);

  // ── handlers ──────────────────────────────────────────────────────────────
  const setCell = (sid:string, eid:string, field:'marks'|'absent'|'remarks', val:string|boolean) => {
    setMarks(m => ({ ...m, [sid]: { ...m[sid], [eid]: { ...(m[sid]?.[eid] ?? { marks:'', absent:false, remarks:'', dirty:false }), [field]:val, dirty:true, ...(field==='absent'&&val?{marks:''}:{}) } } }));
    setSaved(false);
  };

  const deleteMark = async (sid:string) => {
    if (!activeGroup || !window.confirm('Delete all marks for this student in this exam group?')) return;
    setDeletingRow(sid);
    for (const ex of activeGroup) {
      await supabase.from('marks').delete().eq('exam_id', ex.id).eq('student_id', sid);
    }
    setMarks(m => {
      const next = { ...m, [sid]: { ...m[sid] } };
      for (const ex of activeGroup) next[sid][ex.id] = { marks:'', absent:false, remarks:'', dirty:false };
      return next;
    });
    setDeletingRow('');
  };

  const saveExamSettings = async (eid:string) => {
    const ed = examEdits[eid]; if (!ed) return;
    const tm = parseFloat(ed.total_marks);
    if (isNaN(tm)||tm<=0) { setError('Max marks must be a positive number.'); return; }
    const pm = ed.passing_marks!=='' ? parseFloat(ed.passing_marks) : null;
    if (pm!==null&&(isNaN(pm)||pm<0||pm>tm)) { setError('Passing marks must be 0–max marks.'); return; }
    setSavingExam(eid); setError('');
    const { error:err } = await supabase.from('exams').update({ total_marks:tm, passing_marks:pm }).eq('id', eid);
    if (err) setError(`Settings save failed: ${err.message}`);
    else {
      setAllExams(prev => prev.map(e => e.id===eid ? { ...e, total_marks:tm, passing_marks:pm } : e));
      setExamEdits(prev => ({ ...prev, [eid]: { total_marks: String(tm), passing_marks: pm!=null ? String(pm) : '' } }));
    }
    setSavingExam('');
  };

  const saveAll = async () => {
    if (!activeGroup) return;
    setSaving(true); setError(''); setSaved(false);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) { setError('Authentication error. Please refresh and try again.'); setSaving(false); return; }

    // Validate: check non-absent, non-empty entries
    for (const ex of displayGroup) {
      for (const s of students) {
        const cell = marks[s.id]?.[ex.id];
        if (!cell || cell.absent || cell.marks==='') continue;
        const val = parseFloat(cell.marks);
        if (isNaN(val) || val<0 || val>ex.total_marks) {
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
        const mo = cell.absent ? null : (cell.marks!=='' ? parseFloat(cell.marks) : null);
        upserts.push({ exam_id:ex.id, student_id:s.id, school_id:schoolId, marks_obtained:mo, is_absent:cell.absent, remarks:cell.remarks||null, entered_by:uid });
      }
    }
    if (upserts.length===0) { setSaving(false); setSaved(true); return; }
    const { error:err } = await supabase.from('marks').upsert(upserts, { onConflict:'exam_id,student_id' });
    if (err) setError(err.message);
    else {
      setSaved(true);
      setMarks(m => {
        const next = { ...m };
        for (const u of upserts) {
          next[u.student_id] = { ...next[u.student_id], [u.exam_id]: { ...next[u.student_id]?.[u.exam_id], dirty:false } };
        }
        return next;
      });
    }
    setSaving(false);
  };

  const clearAllMarks = async () => {
    if (!activeGroup) return;
    const isSectionScoped = !!activeGroup[0].section_id || !!selSec;
    const confirmMsg = isSectionScoped
      ? `Clear marks for this exam group (${activeGroup[0].section_name ? 'Section ' + activeGroup[0].section_name : 'selected section'})? This cannot be undone.`
      : 'Clear ALL marks for this exam group across all sections? This cannot be undone.';
    if (!window.confirm(confirmMsg)) return;
    setSaving(true); setError('');
    let err: any = null;
    if (students.length > 0) {
      const studentIds = students.map(s => s.id);
      for (const ex of activeGroup) {
        const { error: e } = await supabase.from('marks')
          .delete()
          .eq('exam_id', ex.id)
          .in('student_id', studentIds);
        if (e) { err = e; break; }
      }
    } else {
      const { error: e } = await supabase.from('marks').delete().in('exam_id', activeGroup.map(e=>e.id));
      err = e;
    }
    if (err) setError(`Clear failed: ${err.message}`);
    else {
      const next:MarksState = {};
      for (const s of students) {
        next[s.id] = {};
        for (const ex of activeGroup) next[s.id][ex.id] = { marks:'', absent:false, remarks:'', dirty:false };
      }
      setMarks(next);
      setSaved(false);
    }
    setSaving(false);
  };

  if (initLoad) return <div style={{padding:40,textAlign:'center',color:'#94A3B8'}}>Loading…</div>;

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <button onClick={()=>router.push('/principal/marks')}
          style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',background:'white',border:'1px solid #E2E8F0',borderRadius:9,fontSize:13,fontWeight:600,color:'#475569',cursor:'pointer'}}>
          ← Results View
        </button>
        <div style={{flex:1}}>
          <h2 style={{fontSize:22,fontWeight:800,color:'#0F172A',letterSpacing:'-0.02em',margin:0}}>📝 Multi-Subject Marks Entry</h2>
          <p style={{fontSize:13,color:'#94A3B8',marginTop:4}}>Enter, edit &amp; manage marks — full CRUD for principal</p>
        </div>
        {activeGroup && (
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setShowSettings(s=>!s)}
              style={{padding:'8px 14px',border:'1px solid #DBEAFE',background:showSettings?'#EFF6FF':'white',borderRadius:9,fontSize:12,fontWeight:700,color:'#1D4ED8',cursor:'pointer'}}>
              ⚙️ Exam Settings
            </button>
            <button onClick={clearAllMarks} disabled={saving}
              style={{padding:'8px 14px',border:'1px solid #FEE2E2',background:'#FEF2F2',borderRadius:9,fontSize:12,fontWeight:700,color:'#DC2626',cursor:'pointer'}}>
              🗑 Clear All
            </button>
          </div>
        )}
      </div>

      {/* Selectors */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 2fr',gap:12}}>
        <div>
          <label style={LS}>Class *</label>
          <select value={selClass} onChange={e=>{setSelClass(e.target.value);setSelSec('');setSelGroup('');setAllExams([]);setSaved(false);setError('');}} style={IS}>
            <option value="">Select class…</option>
            {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={LS}>Section</label>
          <select 
            value={selSec} 
            onChange={e => {
              const newSec = e.target.value;
              setSelSec(newSec);
              setSaved(false);
              setError('');
              // If current group does not belong to the selected section, reset it
              if (activeGroup && activeGroup[0].section_id && activeGroup[0].section_id !== newSec) {
                setSelGroup('');
              }
            }} 
            disabled={!selClass} 
            style={{...IS,opacity:selClass?1:0.5}}
          >
            <option value="">All sections</option>
            {filtSecs.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label style={LS}>Exam Group *</label>
          <select 
            value={selGroup} 
            onChange={e => {
              const newGroupKey = e.target.value;
              setSelGroup(newGroupKey);
              setSaved(false);
              setError('');
              // If this exam group belongs to a specific section, auto-sync the Section dropdown
              const matched = allGroups.find(g => getExamGroupKey(g[0]) === newGroupKey);
              if (matched && matched[0].section_id && matched[0].section_id !== selSec) {
                setSelSec(matched[0].section_id);
              }
            }} 
            disabled={!selClass||groups.length===0} 
            style={{...IS,opacity:selClass?1:0.5}}
          >
            <option value="">Select exam…</option>
            {groups.map(g => {
              const key = getExamGroupKey(g[0]);
              const secLabel = g[0].section_name ? ` · Sec ${g[0].section_name}` : ' · All Sec';
              const dateStr = new Date(g[0].exam_date + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short' });
              const subjectsList = g.map(e => e.subject_name).join(', ');
              const label = `${g[0].name}${secLabel} · ${dateStr} · ${g.length} sub (${subjectsList})`;
              return <option key={key} value={key}>{label}</option>;
            })}
          </select>
        </div>
      </div>

      {/* ── Exam Settings Panel ── */}
      {showSettings && activeGroup && (
        <div style={{background:'#F8FAFF',border:'1px solid #DBEAFE',borderRadius:14,padding:'18px 20px'}}>
          <p style={{fontSize:13,fontWeight:700,color:'#1D4ED8',margin:'0 0 14px'}}>
            ⚙️ Exam Settings — Edit Max Marks &amp; Passing Marks for {activeGroup[0].name} {activeGroup[0].section_name ? `(Section ${activeGroup[0].section_name})` : ''}
          </p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:12}}>
            {activeGroup.map(ex=>(
              <div key={ex.id} style={{background:'white',border:'1px solid #E2E8F0',borderRadius:10,padding:'14px 16px'}}>
                <p style={{fontSize:12,fontWeight:700,color:'#1D4ED8',margin:'0 0 10px'}}>{ex.subject_name}</p>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                  <div>
                    <label style={{...LS,marginBottom:3}}>Max Marks</label>
                    <input type="number" min={1}
                      value={examEdits[ex.id]?.total_marks ?? ex.total_marks}
                      onChange={e=>setExamEdits(prev=>({...prev,[ex.id]:{...prev[ex.id],total_marks:e.target.value}}))}
                      style={{...CELL_INPUT,textAlign:'left',padding:'6px 10px',fontWeight:600}} />
                  </div>
                  <div>
                    <label style={{...LS,marginBottom:3}}>Pass Marks</label>
                    <input type="number" min={0}
                      value={examEdits[ex.id]?.passing_marks ?? (ex.passing_marks!=null?ex.passing_marks:'')}
                      onChange={e=>setExamEdits(prev=>({...prev,[ex.id]:{...prev[ex.id],passing_marks:e.target.value}}))}
                      placeholder={`${Math.round(ex.total_marks*0.35)} (35%)`}
                      style={{...CELL_INPUT,textAlign:'left',padding:'6px 10px',fontWeight:600}} />
                  </div>
                </div>
                <button onClick={()=>saveExamSettings(ex.id)} disabled={savingExam===ex.id}
                  style={{width:'100%',padding:'7px',borderRadius:7,border:'none',background:savingExam===ex.id?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)',color:'white',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                  {savingExam===ex.id?'Saving…':'💾 Save Settings'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exam group summary pills */}
      {activeGroup && (
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
          {displayGroup.map(e=>(
            <div key={e.id} style={{padding:'8px 14px',background:'white',border:'1px solid #DBEAFE',borderRadius:10}}>
              <p style={{fontSize:12,fontWeight:700,color:'#1D4ED8',margin:0}}>{e.subject_name}</p>
              <p style={{fontSize:11,color:'#64748B',margin:0}}>Max: {e.total_marks} · Pass: {e.passing_marks ?? Math.round(e.total_marks*0.35)}</p>
            </div>
          ))}
          <div style={{padding:'8px 14px',background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10}}>
            <p style={{fontSize:12,fontWeight:700,color:'#475569',margin:0}}>Grand Total</p>
            <p style={{fontSize:13,fontWeight:800,color:'#0F172A',margin:0}}>{displayGroup.reduce((s,e)=>s+e.total_marks,0)} marks</p>
          </div>
          <div style={{padding:'8px 14px',background:'#ECFDF5',border:'1px solid #BBF7D0',borderRadius:10}}>
            <p style={{fontSize:12,fontWeight:700,color:'#065F46',margin:0}}>Students</p>
            <p style={{fontSize:13,fontWeight:800,color:'#0F172A',margin:0}}>{students.length}</p>
          </div>
          {activeGroup[0].section_name && (
            <div style={{padding:'8px 14px',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:10}}>
              <p style={{fontSize:12,fontWeight:700,color:'#1D4ED8',margin:0}}>Section</p>
              <p style={{fontSize:13,fontWeight:800,color:'#0F172A',margin:0}}>{activeGroup[0].section_name}</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!activeGroup && (
        <div style={{background:'white',borderRadius:16,border:'1px solid #E8ECF0',padding:'64px 24px',textAlign:'center'}}>
          <div style={{fontSize:36,marginBottom:12}}>📋</div>
          <p style={{fontWeight:700,color:'#1E293B',fontSize:16,margin:0}}>Select Class &amp; Exam</p>
          <p style={{fontSize:13,color:'#94A3B8',marginTop:6}}>Multi-subject exams appear here. Create them in the Exams page.</p>
        </div>
      )}

      {/* No students */}
      {activeGroup && students.length===0 && (
        <div style={{background:'white',borderRadius:16,border:'1px solid #E8ECF0',padding:'48px 24px',textAlign:'center'}}>
          <div style={{fontSize:32,marginBottom:8}}>🎓</div>
          <p style={{fontWeight:600,color:'#475569',margin:0}}>No students found for this class{activeGroup[0].section_name ? ` / section ${activeGroup[0].section_name}` : selSec ? ' / section' : ''}.</p>
        </div>
      )}

      {/* Marks grid */}
      {activeGroup && students.length>0 && (
        <>
          {error && <div style={{padding:'10px 14px',background:'#FEF2F2',border:'1px solid #FEE2E2',borderRadius:9,fontSize:13,color:'#DC2626',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span>{error}</span>
            <button onClick={()=>setError('')} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontWeight:700,fontSize:16}}>×</button>
          </div>}
          {saved && <div style={{padding:'10px 14px',background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:9,fontSize:13,color:'#15803D',fontWeight:700}}>✅ All marks saved!</div>}

          <div style={{background:'white',borderRadius:14,border:'1px solid #E8ECF0',overflow:'auto',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
            {/* Grid header */}
            <div style={{display:'grid',gridTemplateColumns:`200px 55px repeat(${activeGroup.length},minmax(165px,1fr)) 82px 52px`,gap:0,background:'#F8FAFC',borderBottom:'2px solid #E2E8F0',minWidth:600}}>
              <div style={{padding:'10px 16px',fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em'}}>Student</div>
              <div style={{padding:'10px 6px',fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',textAlign:'center'}}>Roll</div>
              {displayGroup.map(ex=>(
                <div key={ex.id} style={{padding:'10px 10px',borderLeft:'1px solid #E2E8F0'}}>
                  <p style={{fontSize:12,fontWeight:700,color:'#1D4ED8',margin:0}}>{ex.subject_name}</p>
                  <p style={{fontSize:10,color:'#94A3B8',margin:'2px 0 0'}}>Max {ex.total_marks} · Pass {ex.passing_marks ?? Math.round(ex.total_marks*0.35)}</p>
                </div>
              ))}
              <div style={{padding:'10px 6px',fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',textAlign:'center',borderLeft:'2px solid #E2E8F0'}}>Total</div>
              <div style={{padding:'10px 6px',fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',textAlign:'center'}}>Del</div>
            </div>

            {/* Rows */}
            {students.map((s,idx)=>{
              const allAbsent = displayGroup.every(ex => marks[s.id]?.[ex.id]?.absent === true);

              let rowTotal = 0;
              let presentMax = 0;
              for (const ex of displayGroup) {
                const cell = marks[s.id]?.[ex.id];
                if (cell?.absent) continue;
                rowTotal += parseFloat(cell?.marks || '0') || 0;
                presentMax += ex.total_marks;
              }

              const grandMax = displayGroup.reduce((sum,ex)=>sum+ex.total_marks,0);
              const passMark = displayGroup.reduce((sum,ex)=>sum+(ex.passing_marks??Math.round(ex.total_marks*0.35)),0);
              const pct = !allAbsent && presentMax>0 ? Math.round((rowTotal/presentMax)*100) : null;
              const passing = !allAbsent && rowTotal>=passMark && grandMax>0;
              const hasDirty = Object.values(marks[s.id]??{}).some(c=>c.dirty);

              return (
                <div key={s.id} style={{display:'grid',gridTemplateColumns:`200px 55px repeat(${activeGroup.length},minmax(165px,1fr)) 82px 52px`,gap:0,borderBottom:idx<students.length-1?'1px solid #F1F5F9':'none',alignItems:'center',minWidth:600,background:hasDirty?'#FFFBEB':idx%2===0?'white':'#FAFBFC',transition:'background 0.15s'}}>

                  {/* Name */}
                  <div style={{padding:'8px 16px',display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#1E3A8A,#60A5FA)',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>{s.full_name.charAt(0)}</div>
                    <span style={{fontSize:12,fontWeight:600,color:'#0F172A'}}>{s.full_name}</span>
                    {hasDirty&&<span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:4,background:'#FEF3C7',color:'#92400E'}}>UNSAVED</span>}
                  </div>

                  {/* Roll */}
                  <div style={{padding:'8px',textAlign:'center',fontSize:12,color:'#94A3B8'}}>{s.roll_number??'—'}</div>

                  {/* Subject cells — guaranteed each subject appears only once */}
                  {displayGroup.map(ex=>{
                    const cell=marks[s.id]?.[ex.id]??{marks:'',absent:false,remarks:'',dirty:false};
                    const mv=parseFloat(cell.marks);
                    const cellPct=cell.marks!==''&&!cell.absent?Math.min(100,Math.round((mv||0)/ex.total_marks*100)):null;
                    const cellPass=cell.marks!==''&&!cell.absent&&mv>=(ex.passing_marks??ex.total_marks*0.35);
                    return (
                      <div key={ex.id} style={{padding:'6px 8px',borderLeft:'1px solid #F1F5F9'}}>
                        <div style={{display:'flex',gap:4,alignItems:'center'}}>
                          <input type="number" min={0} max={ex.total_marks}
                            value={cell.absent?'':cell.marks}
                            disabled={cell.absent}
                            onChange={e=>setCell(s.id,ex.id,'marks',e.target.value)}
                            placeholder={cell.absent?'Absent':'—'}
                            style={{...CELL_INPUT,flex:1,border:`1.5px solid ${cell.absent?'#E2E8F0':cellPct!==null?(cellPass?'#86EFAC':'#FCA5A5'):'#E2E8F0'}`,background:cell.absent?'#F8FAFC':'white',color:cell.absent?'#94A3B8':'#0F172A',opacity:cell.absent?0.5:1,cursor:cell.absent?'not-allowed':'text'}}
                          />
                          <label title="Mark absent" style={{display:'flex',alignItems:'center',gap:3,cursor:'pointer',fontSize:10,color:'#94A3B8',whiteSpace:'nowrap'}}>
                            <input type="checkbox" checked={cell.absent} onChange={e=>setCell(s.id,ex.id,'absent',e.target.checked)} style={{cursor:'pointer'}}/>
                            Abs
                          </label>
                        </div>
                        <input type="text" placeholder="Remarks…" value={cell.remarks}
                          onChange={e=>setCell(s.id,ex.id,'remarks',e.target.value)}
                          style={{marginTop:4,width:'100%',padding:'3px 6px',border:'1px solid #E2E8F0',borderRadius:5,fontSize:10,outline:'none',color:'#64748B',background:'#FAFBFC',boxSizing:'border-box'}}
                        />
                        {cellPct!==null&&(
                          <div style={{marginTop:3,height:3,background:'#E2E8F0',borderRadius:99,overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${cellPct}%`,background:cellPass?'linear-gradient(90deg,#22C55E,#16A34A)':'linear-gradient(90deg,#F87171,#EF4444)',borderRadius:99}}/>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Total */}
                  <div style={{padding:'8px',textAlign:'center',borderLeft:'2px solid #E2E8F0'}}>
                    {allAbsent ? (
                      <p style={{fontSize:13,fontWeight:700,color:'#94A3B8',margin:0}}>—</p>
                    ) : (
                      <>
                        <p style={{fontSize:13,fontWeight:800,color:passing?'#15803D':'#DC2626',margin:0}}>{rowTotal}</p>
                        <p style={{fontSize:10,color:'#94A3B8',margin:0}}>{pct ?? 0}%</p>
                        <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:4,background:passing?'#ECFDF5':'#FEF2F2',color:passing?'#065F46':'#DC2626'}}>{passing?'PASS':'FAIL'}</span>
                      </>
                    )}
                  </div>

                  {/* Delete */}
                  <div style={{padding:'8px',textAlign:'center'}}>
                    <button title="Delete marks for this student" onClick={()=>deleteMark(s.id)} disabled={deletingRow===s.id}
                      style={{width:32,height:32,borderRadius:7,border:'1px solid #FEE2E2',background:'#FEF2F2',color:'#DC2626',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto'}}>
                      {deletingRow===s.id?'…':'🗑'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save bar */}
          <div style={{position:'sticky',bottom:0,background:'white',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',boxShadow:'0 -4px 16px rgba(0,0,0,0.06)',gap:12,flexWrap:'wrap'}}>
            <div style={{display:'flex',gap:16,alignItems:'center'}}>
              <p style={{fontSize:13,color:'#64748B',margin:0}}>{students.length} students · {activeGroup.length} subjects</p>
              {dirtyCount>0&&<span style={{fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:6,background:'#FEF3C7',color:'#92400E'}}>{dirtyCount} unsaved change{dirtyCount>1?'s':''}</span>}
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {saved&&<span style={{fontSize:13,fontWeight:600,color:'#16A34A'}}>✅ Saved!</span>}
              <button onClick={saveAll} disabled={saving}
                style={{padding:'10px 28px',borderRadius:10,border:'none',background:saving?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)',color:'white',fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',boxShadow:'0 4px 12px rgba(59,130,246,0.3)'}}>
                {saving?'Saving…':'💾 Save All Marks'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
