'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createNotification } from '@/components/NotificationBell';

interface Exam { id:string; name:string; exam_type:string; exam_date:string; start_time:string|null; duration_minutes:number|null; total_marks:number; passing_marks:number|null; is_published:boolean; class_id:string; class_name?:string; subject_name?:string; subject_id:string; }
interface ClassItem { id:string; name:string; }
interface Subject { id:string; name:string; class_id:string; }
interface Section { id:string; name:string; class_id:string; }
interface MultiRow { subject_id:string; total_marks:string; passing_marks:string; }

const EXAM_TYPES = [
  { value:'unit_test', label:'Unit Test' },{ value:'mid_term', label:'Mid Term' },
  { value:'final', label:'Final Exam' },{ value:'practical', label:'Practical' },{ value:'internal', label:'Internal' },
];
const IS:React.CSSProperties = { width:'100%', padding:'9px 13px', border:'1px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS:React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 };
const TYPE_MAP:Record<string,string> = { unit_test:'Unit Test', mid_term:'Mid Term', final:'Final Exam', practical:'Practical', internal:'Internal' };

function groupExams(exams:Exam[]) {
  const map = new Map<string,Exam[]>();
  for (const e of exams) {
    const key = `${e.name}§${e.exam_date}§${e.class_id}`;
    if (!map.has(key)) map.set(key,[]);
    map.get(key)!.push(e);
  }
  return Array.from(map.values());
}

const BLANK_FORM = { name:'', exam_type:'mid_term', class_id:'', section_id:'', exam_date:'', start_time:'', duration_minutes:'120', subject_id:'', total_marks:'100', passing_marks:'35' };

export default function ExamsPage() {
  const supabase = createClient();
  const [exams,setExams]       = useState<Exam[]>([]);
  const [classes,setClasses]   = useState<ClassItem[]>([]);
  const [subjects,setSubjects] = useState<Subject[]>([]);
  const [sections,setSections] = useState<Section[]>([]);
  const [loading,setLoading]   = useState(true);
  const [showAdd,setShowAdd]   = useState(false);
  const [saving,setSaving]     = useState(false);
  const [publishingId,setPublishingId] = useState<string|null>(null); // key of group being toggled
  const [formError,setFormError] = useState('');
  const [filterType,setFilterType]       = useState('');
  const [filterClass,setFilterClass]     = useState('');
  const [filterSection,setFilterSection] = useState('');
  const [filterDateFrom,setFilterDateFrom] = useState('');
  const [filterDateTo,setFilterDateTo]   = useState('');
  const [filterStatus,setFilterStatus]   = useState(''); // '' | 'draft' | 'published'
  const [schoolId,setSchoolId] = useState('');
  const [ayId,setAyId]         = useState('');
  const [form,setForm]         = useState(BLANK_FORM);
  const [isMulti,setIsMulti]   = useState(false);
  const [multiRows,setMultiRows] = useState<MultiRow[]>([{ subject_id:'', total_marks:'100', passing_marks:'35' }]);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data:u } = await supabase.from('users').select('school_id').eq('id',uid).single();
    if (!u?.school_id) { setLoading(false); return; }
    setSchoolId(u.school_id);
    let q = supabase.from('exams').select('*,classes(name),subjects(name)').eq('school_id',u.school_id).order('exam_date',{ascending:false});
    if (filterType)     q = q.eq('exam_type', filterType);
    if (filterClass)    q = q.eq('class_id', filterClass);
    if (filterSection)  q = q.eq('section_id', filterSection);
    if (filterDateFrom) q = q.gte('exam_date', filterDateFrom);
    if (filterDateTo)   q = q.lte('exam_date', filterDateTo);
    if (filterStatus === 'published') q = q.eq('is_published', true);
    if (filterStatus === 'draft')     q = q.eq('is_published', false);
    const { data } = await q;
    if (data) setExams(data.map((e:any) => ({ ...e, class_name:e.classes?.name, subject_name:e.subjects?.name })));
    setLoading(false);
  }, [supabase, filterType, filterClass, filterSection, filterDateFrom, filterDateTo, filterStatus]);

  const fetchStructure = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return;
    const { data:u } = await supabase.from('users').select('school_id').eq('id',uid).single();
    if (!u?.school_id) return;
    const { data:yr } = await supabase.from('academic_years').select('id').eq('is_current',true).eq('school_id',u.school_id).maybeSingle();
    if (yr?.id) setAyId(yr.id);
    const yid = yr?.id;
    const [{ data:c },{ data:s },{ data:sec }] = await Promise.all([
      yid ? supabase.from('classes').select('id,name').eq('academic_year_id',yid).order('numeric_order') : supabase.from('classes').select('id,name').eq('school_id',u.school_id).order('numeric_order'),
      // Fetch ALL subjects for this school — do NOT filter by academic_year_id.
      // Some subjects may have been created without an academic_year_id (or before one existed)
      // and that filter would silently hide them, making the Subject dropdown appear empty.
      supabase.from('subjects').select('id,name,class_id').eq('school_id',u.school_id).order('name'),
      yid ? supabase.from('sections').select('id,name,class_id').eq('academic_year_id',yid) : supabase.from('sections').select('id,name,class_id').eq('school_id',u.school_id),
    ]);
    if (c) setClasses(c);
    if (s) setSubjects(s);
    if (sec) setSections(sec);
  }, [supabase]);

  useEffect(() => { fetchStructure(); }, [fetchStructure]);
  useEffect(() => { fetchExams(); }, [fetchExams]);

  // Show subjects that match the selected class OR have no class restriction (null = school-wide).
  // Strict equality (===) was silently hiding subjects created without a class_id.
  const filtSubs = subjects.filter(s => !form.class_id || !s.class_id || s.class_id === form.class_id);
  // When a class is selected → show all sections of that class.
  // When no class is selected → deduplicate by section name so we don't show A,A,A,B,B,B.
  const filtSecs = form.class_id
    ? sections.filter(s => s.class_id === form.class_id)
    : [...new Map(sections.map(s => [s.name, s])).values()];
  // Sections for the filter bar (class-filtered)
  const filterBarSecs = filterClass ? sections.filter(s => s.class_id === filterClass) : [];

  const handleCreate = async () => {
    if (!form.name || !form.class_id || !form.exam_date) { setFormError('Exam name, class, and date are required.'); return; }
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const base = { name:form.name.trim(), exam_type:form.exam_type, class_id:form.class_id, section_id:form.section_id||null, exam_date:form.exam_date, start_time:form.start_time||null, duration_minutes:form.duration_minutes?parseInt(form.duration_minutes):null, academic_year_id:ayId||null, school_id:schoolId, created_by:uid, is_published:false };
    setSaving(true); setFormError('');
    if (!isMulti) {
      if (!form.subject_id) { setFormError('Select a subject.'); setSaving(false); return; }
      const { error } = await supabase.from('exams').insert({ ...base, subject_id:form.subject_id, total_marks:parseInt(form.total_marks), passing_marks:form.passing_marks?parseInt(form.passing_marks):null });
      if (error) { setFormError(error.message); setSaving(false); return; }
    } else {
      const valid = multiRows.filter(r => r.subject_id && parseInt(r.total_marks) > 0);
      if (valid.length < 2) { setFormError('Add at least 2 subjects for a multi-subject exam.'); setSaving(false); return; }
      const { error } = await supabase.from('exams').insert(valid.map(r => ({ ...base, subject_id:r.subject_id, total_marks:parseInt(r.total_marks), passing_marks:r.passing_marks?parseInt(r.passing_marks):null })));
      if (error) { setFormError(error.message); setSaving(false); return; }
    }

    // ── Notify assigned teachers about the new exam ────────────────────────
    try {
      const selectedClassName = classes.find(c => c.id === form.class_id)?.name || '';
      const examDateFmt = form.exam_date ? new Date(form.exam_date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '';
      // Get all section_ids for this class first, then find teachers for those sections
      const classSectionIds = sections.filter(s => s.class_id === form.class_id).map(s => s.id);
      const { data: teacherLinks } = classSectionIds.length > 0
        ? await supabase.from('teacher_section_assignments').select('teacher_id').in('section_id', classSectionIds)
        : { data: null };
      if (teacherLinks && teacherLinks.length > 0) {
        const uniqueTeachers = [...new Set(teacherLinks.map((t:any) => t.teacher_id))];
        await Promise.all(uniqueTeachers.map(tid => createNotification(supabase, {
          recipient_id: tid as string,
          school_id:    schoolId,
          type:         'exam_scheduled',
          title:        `New exam scheduled: ${form.name}`,
          body:         `${selectedClassName} • ${form.exam_type.replace('_',' ')} • ${examDateFmt}`,
          link:         '/teacher/marks',
        })));
      }
    } catch (_) {}
    // ──────────────────────────────────────────────────────────────

    setShowAdd(false); setForm(BLANK_FORM); setIsMulti(false); setMultiRows([{ subject_id:'', total_marks:'100', passing_marks:'35' }]);
    fetchExams(); setSaving(false);
  };

  const togglePublishGroup = async (group:Exam[]) => {
    const groupKey = `${group[0].name}§${group[0].exam_date}§${group[0].class_id}`;
    if (publishingId === groupKey) return; // prevent double-click
    setPublishingId(groupKey);

    const nv = !group[0].is_published;

    // Update all exams in the group and collect any errors
    const results = await Promise.all(
      group.map(e => supabase.from('exams').update({ is_published: nv }).eq('id', e.id))
    );
    const failed = results.find(r => r.error);
    if (failed?.error) {
      alert(`Failed to ${nv ? 'publish' : 'unpublish'}: ${failed.error.message}`);
      setPublishingId(null);
      return;
    }

    // Notify parents when exam is published
    if (nv && schoolId) {
      try {
        const classId  = group[0].class_id;
        const examName = group[0].name;
        // Get all active students in this class (scoped to school)
        const { data: studentsInClass } = await supabase
          .from('students')
          .select('id')
          .eq('class_id', classId)
          .eq('school_id', schoolId)
          .eq('is_active', true);
        if (studentsInClass && studentsInClass.length > 0) {
          const { data: links } = await supabase
            .from('student_parent_links').select('parent_id')
            .in('student_id', studentsInClass.map((s:any) => s.id));
          if (links && links.length > 0) {
            await Promise.all(links.map((l:any) => createNotification(supabase, {
              recipient_id: l.parent_id,
              school_id:    schoolId,
              type:         'marks_published',
              title:        `Marks published: ${examName}`,
              body:         "Your child's marks have been published. Check the Academics section.",
              link:         '/parent/academics',
            })));
          }
        }
      } catch (_) { /* notification failure should not block publish */ }
    }

    setPublishingId(null);
    fetchExams();
  };

  const groups = groupExams(exams);

  const updateMultiRow = (i:number, field:keyof MultiRow, val:string) =>
    setMultiRows(rows => rows.map((r,idx) => idx===i ? { ...r, [field]:val } : r));

  // ─── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-container">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Exam Management</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Schedule single or multi-subject exams</p>
        </div>
        <button onClick={() => { setShowAdd(true); setForm(BLANK_FORM); setIsMulti(false); setMultiRows([{ subject_id:'', total_marks:'100', passing_marks:'35' }]); setFormError(''); }}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(59,130,246,0.3)', whiteSpace:'nowrap' }}>
          <span style={{ fontSize:16 }}>+</span> Create Exam
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...IS, width:'auto', minWidth:130 }}>
          <option value="">All Types</option>
          {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterClass} onChange={e => { setFilterClass(e.target.value); setFilterSection(''); }} style={{ ...IS, width:'auto', minWidth:120 }}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {filterClass && (
          <select value={filterSection} onChange={e => setFilterSection(e.target.value)} style={{ ...IS, width:'auto', minWidth:110 }}>
            <option value="">All Sections</option>
            {filterBarSecs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} title="From date" style={{ ...IS, width:'auto' }} />
        <span style={{ fontSize:12, color:'#94A3B8' }}>→</span>
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} title="To date" style={{ ...IS, width:'auto' }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...IS, width:'auto', minWidth:120 }}>
          <option value="">All Status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        {(filterType || filterClass || filterSection || filterDateFrom || filterDateTo || filterStatus) && (
          <button
            onClick={() => { setFilterType(''); setFilterClass(''); setFilterSection(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterStatus(''); }}
            style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #FEE2E2', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}
          >✕ Clear</button>
        )}
        <span style={{ fontSize:13, color:'#94A3B8', marginLeft:4 }}>{groups.length} exam{groups.length!==1?'s':''}</span>
      </div>

      {/* List */}
      <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 100px 120px 110px 1fr 130px', padding:'11px 20px', background:'#F8FAFC', borderBottom:'1px solid #F1F5F9', gap:12 }}>
          {['Exam','Type','Class','Date','Subjects & Marks','Actions'].map((h,i) => (
            <p key={h} style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0, textAlign:i===5?'right':'left' }}>{h}</p>
          ))}
        </div>
        {loading ? (
          <div style={{ padding:20, display:'flex', flexDirection:'column', gap:10 }}>{[1,2,3].map(i => <div key={i} style={{ height:52, background:'#F8FAFC', borderRadius:8 }}/>)}</div>
        ) : groups.length === 0 ? (
          <div style={{ padding:'60px 24px', textAlign:'center' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📝</div>
            <p style={{ fontWeight:700, color:'#1E293B', fontSize:15, margin:0 }}>No exams scheduled</p>
            <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Click <strong>+ Create Exam</strong> to get started</p>
          </div>
        ) : groups.map((group, idx) => {
          const first = group[0];
          const isGroup = group.length > 1;
          const totalMarks = group.reduce((s,e) => s + e.total_marks, 0);
          return (
            <div key={idx} style={{ borderBottom:idx<groups.length-1?'1px solid #F1F5F9':'none' }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 100px 120px 110px 1fr 130px', padding:'14px 20px', alignItems:'flex-start', gap:12 }}>
                {/* Name */}
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:0 }}>{first.name}</p>
                    {isGroup && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'#EDE9FE', color:'#7C3AED' }}>{group.length} subjects</span>}
                  </div>
                  {first.start_time && <p style={{ fontSize:11, color:'#94A3B8', margin:'3px 0 0' }}>{first.start_time} · {first.duration_minutes}min</p>}
                </div>
                {/* Type */}
                <span style={{ fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:6, background:'#F1F5F9', color:'#475569' }}>{TYPE_MAP[first.exam_type]??first.exam_type}</span>
                {/* Class */}
                <p style={{ fontSize:13, color:'#475569', margin:0 }}>{first.class_name}</p>
                {/* Date */}
                <p style={{ fontSize:13, color:'#475569', margin:0 }}>{new Date(first.exam_date).toLocaleDateString('en-IN',{ day:'numeric', month:'short', year:'numeric' })}</p>
                {/* Subjects */}
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  {group.map(e => (
                    <div key={e.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:12, color:'#0F172A', fontWeight:600 }}>{e.subject_name}</span>
                      <span style={{ fontSize:11, color:'#94A3B8' }}>{e.total_marks}m · pass {e.passing_marks??Math.round(e.total_marks*0.35)}m</span>
                    </div>
                  ))}
                  {isGroup && <p style={{ fontSize:11, fontWeight:700, color:'#64748B', margin:'2px 0 0' }}>Grand Total: {totalMarks} marks</p>}
                </div>
                {/* Actions */}
                <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:99, background:first.is_published?'#DCFCE7':'#FFFBEB', color:first.is_published?'#15803D':'#D97706' }}>
                    {first.is_published?'Published':'Draft'}
                  </span>
                  <button
                    onClick={() => togglePublishGroup(group)}
                    disabled={publishingId === `${first.name}§${first.exam_date}§${first.class_id}`}
                    style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:7, border:'none', cursor: publishingId === `${first.name}§${first.exam_date}§${first.class_id}` ? 'not-allowed' : 'pointer', background:first.is_published?'#FEE2E2':'#DCFCE7', color:first.is_published?'#DC2626':'#15803D', opacity: publishingId === `${first.name}§${first.exam_date}§${first.class_id}` ? 0.6 : 1, transition:'opacity 0.15s' }}>
                    {publishingId === `${first.name}§${first.exam_date}§${first.class_id}` ? '...' : (first.is_published?'Unpublish':'Publish')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Create Modal ───────────────────────────────────────────────────────── */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)' }}>
          <div style={{ width:'100%', maxWidth:580, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column', maxHeight:'92vh' }}>
            {/* Modal header */}
            <div style={{ padding:'22px 26px 16px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div>
                <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Schedule Exam</h3>
                <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Single or multi-subject exam</p>
              </div>
              <button onClick={() => setShowAdd(false)} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            <div style={{ padding:'20px 26px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:14 }}>
              {formError && <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{formError}</div>}

              {/* Mode toggle */}
              <div style={{ display:'flex', padding:4, background:'#F1F5F9', borderRadius:10, gap:4 }}>
                {[{ v:false, l:'📚 Single Subject' },{ v:true, l:'📋 Multi-Subject' }].map(({ v,l }) => (
                  <button key={String(v)} onClick={() => { setIsMulti(v); setFormError(''); }}
                    style={{ flex:1, padding:'8px 14px', borderRadius:8, border:'none', fontSize:12, fontWeight:700, cursor:'pointer', background:isMulti===v?'white':'transparent', color:isMulti===v?'#1D4ED8':'#64748B', boxShadow:isMulti===v?'0 1px 4px rgba(0,0,0,0.1)':'none', transition:'all 0.15s' }}>
                    {l}
                  </button>
                ))}
              </div>

              {/* Exam name + type */}
              <div>
                <label style={LS}>Exam Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))} placeholder={isMulti?'"Mid Term 2026" or "Annual Exam"':'"Unit Test 1 — Mathematics"'} style={IS}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={LS}>Exam Type</label>
                  <select value={form.exam_type} onChange={e => setForm(f => ({ ...f, exam_type:e.target.value }))} style={IS}>
                    {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Exam Date *</label>
                  <input type="date" value={form.exam_date} onChange={e => setForm(f => ({ ...f, exam_date:e.target.value }))} style={IS}/>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                <div>
                  <label style={LS}>Class *</label>
                  <select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id:e.target.value, section_id:'', subject_id:'' }))} style={IS}>
                    <option value="">Select...</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Section</label>
                  <select value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id:e.target.value }))} style={IS}>
                    <option value="">All sections</option>
                    {filtSecs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Start Time</label>
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time:e.target.value }))} style={IS}/>
                </div>
              </div>

              {/* ── Single subject ── */}
              {!isMulti && (
                <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
                  <p style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>📚 Subject & Marks</p>
                  <div>
                    <label style={LS}>Subject *</label>
                    <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id:e.target.value }))} style={IS}>
                      <option value="">{!form.class_id ? 'Select a class first...' : filtSubs.length === 0 ? 'No subjects found — add them in Subjects page' : 'Select subject...'}</option>
                      {filtSubs.map(s => <option key={s.id} value={s.id}>{s.name}{s.class_id ? '' : ' (all classes)'}</option>)}
                    </select>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                    <div><label style={LS}>Duration (min)</label><input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes:e.target.value }))} style={IS}/></div>
                    <div><label style={LS}>Total Marks *</label><input type="number" value={form.total_marks} onChange={e => setForm(f => ({ ...f, total_marks:e.target.value }))} style={IS}/></div>
                    <div><label style={LS}>Pass Marks</label><input type="number" value={form.passing_marks} onChange={e => setForm(f => ({ ...f, passing_marks:e.target.value }))} style={IS}/></div>
                  </div>
                </div>
              )}

              {/* ── Multi subject ── */}
              {isMulti && (
                <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
                  <p style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 4px' }}>📋 Subjects & Marks (one row per subject)</p>
                  {/* Column headers */}
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 100px 100px 36px', gap:8, paddingBottom:4, borderBottom:'1px solid #E2E8F0' }}>
                    {['Subject','Total Marks','Pass Marks',''].map(h => (
                      <p key={h} style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.05em', margin:0 }}>{h}</p>
                    ))}
                  </div>
                  {multiRows.map((row,i) => (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 100px 100px 36px', gap:8, alignItems:'center' }}>
                      <select value={row.subject_id} onChange={e => updateMultiRow(i,'subject_id',e.target.value)} style={IS}>
                        <option value="">{filtSubs.length === 0 ? 'No subjects — select a class first' : 'Select subject...'}</option>
                        {filtSubs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <input type="number" value={row.total_marks} onChange={e => updateMultiRow(i,'total_marks',e.target.value)} style={IS} placeholder="100"/>
                      <input type="number" value={row.passing_marks} onChange={e => updateMultiRow(i,'passing_marks',e.target.value)} style={IS} placeholder="35"/>
                      <button onClick={() => setMultiRows(rows => rows.filter((_,idx) => idx!==i))} disabled={multiRows.length<=1}
                        style={{ width:32, height:32, borderRadius:8, border:'1px solid #FEE2E2', background:'#FEF2F2', color:'#DC2626', cursor:multiRows.length<=1?'not-allowed':'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', opacity:multiRows.length<=1?0.4:1 }}>✕</button>
                    </div>
                  ))}
                  <button onClick={() => setMultiRows(rows => [...rows, { subject_id:'', total_marks:'100', passing_marks:'35' }])}
                    style={{ alignSelf:'flex-start', padding:'7px 14px', borderRadius:9, border:'1px dashed #BFDBFE', background:'#EFF6FF', color:'#1D4ED8', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    + Add Subject
                  </button>
                  {multiRows.filter(r => parseInt(r.total_marks)>0).length > 0 && (
                    <div style={{ padding:'8px 12px', background:'white', border:'1px solid #E2E8F0', borderRadius:8, display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:12, color:'#64748B' }}>Grand Total Marks</span>
                      <span style={{ fontSize:13, fontWeight:800, color:'#0F172A' }}>{multiRows.reduce((s,r) => s+(parseInt(r.total_marks)||0),0)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding:'14px 26px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, flexShrink:0 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving}
                style={{ flex:1, padding:11, borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                {saving?'Creating...':'Create Exam'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
