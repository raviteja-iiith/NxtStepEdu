'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Subject { id:string; name:string; code:string|null; class_id:string|null; class_name?:string; }
interface Teacher { id:string; full_name:string; }
interface ClassItem { id:string; name:string; }
interface SectionRow { section_id:string; section_name:string; class_id:string; class_name:string; teacher_id:string; }
interface SubjectAssignment { section_id:string; section_name:string; class_name:string; teacher_id:string; teacher_name:string; }

const IS: React.CSSProperties = { width:'100%', padding:'10px 14px', border:'1px solid #E2E8F0', borderRadius:10, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS: React.CSSProperties = { display:'block', fontSize:12, fontWeight:600, color:'#475569', marginBottom:5 };
const OVL: React.CSSProperties = { position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)' };
const COLORS = [
  { bg:'#EFF6FF', color:'#1D4ED8', border:'#DBEAFE' },
  { bg:'#F0FDF4', color:'#16A34A', border:'#DCFCE7' },
  { bg:'#F5F3FF', color:'#7C3AED', border:'#EDE9FE' },
  { bg:'#FFFBEB', color:'#D97706', border:'#FDE68A' },
  { bg:'#FDF2F8', color:'#BE185D', border:'#FBCFE8' },
  { bg:'#F0FDFA', color:'#0F766E', border:'#CCFBF1' },
  { bg:'#FEF2F2', color:'#DC2626', border:'#FEE2E2' },
  { bg:'#F8FAFC', color:'#475569', border:'#E2E8F0' },
];

export default function PrincipalSubjectsPage() {
  const supabase = createClient();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState('');
  const [academicYearId, setAcademicYearId] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);
  const [filterClass, setFilterClass] = useState('');
  const [assignmentMap, setAssignmentMap] = useState<Record<string, SubjectAssignment[]>>({});

  // Add subject
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name:'', code:'', class_id:'' });
  const [addError, setAddError] = useState('');

  // Manage teachers modal
  const [showManage, setShowManage] = useState(false);
  const [manageSubject, setManageSubject] = useState<Subject|null>(null);
  const [modalSections, setModalSections] = useState<SectionRow[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!u?.school_id) { setLoading(false); return; }
    const sid = u.school_id;
    setSchoolId(sid);

    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current',true).eq('school_id',sid).maybeSingle();
    const yrId = yr?.id || null;
    setAcademicYearId(yrId);

    const { data: subs } = await supabase.from('subjects').select('id,name,code,class_id,classes(name)').eq('school_id', sid).order('name');
    if (subs) setSubjects((subs as any[]).map(s => ({ ...s, class_name: (s.classes as any)?.name || null })));

    const { data: tList } = await supabase.from('users').select('id,full_name').eq('school_id', sid).eq('role','teacher').eq('is_active',true).order('full_name');
    if (tList) setTeachers(tList);

    let clsQ = supabase.from('classes').select('id,name').eq('school_id', sid);
    if (yrId) clsQ = clsQ.eq('academic_year_id', yrId);
    const { data: cls } = await clsQ.order('numeric_order');
    if (cls) setClasses(cls);

    // Fetch ALL teacher-section assignments with teacher & section names
    const { data: tsa } = await supabase
      .from('teacher_section_assignments')
      .select('subject_id, section_id, teacher_id, sections(name, class_id, classes(name)), users(full_name)')
      .eq('school_id', sid);

    const map: Record<string, SubjectAssignment[]> = {};
    (tsa || []).forEach((a: any) => {
      if (!map[a.subject_id]) map[a.subject_id] = [];
      map[a.subject_id].push({
        section_id: a.section_id,
        section_name: a.sections?.name || '',
        class_name: a.sections?.classes?.name || '',
        teacher_id: a.teacher_id,
        teacher_name: a.users?.full_name || '',
      });
    });
    setAssignmentMap(map);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openManage = async (sub: Subject) => {
    setManageSubject(sub);
    setShowManage(true);
    setLoadingModal(true);

    // Fetch sections for this subject's class
    let secQ = supabase.from('sections').select('id, name, class_id, classes(name)');
    if (sub.class_id) {
      secQ = secQ.eq('class_id', sub.class_id);
    } else {
      // School-wide subject — show all sections
      if (academicYearId) secQ = secQ.eq('academic_year_id', academicYearId);
      else secQ = (secQ as any).eq('school_id', schoolId);
    }
    const { data: secs } = await (secQ as any).order('name');

    // Current assignments for this subject
    const { data: existing } = await supabase
      .from('teacher_section_assignments')
      .select('section_id, teacher_id')
      .eq('subject_id', sub.id);

    const exMap: Record<string, string> = {};
    (existing || []).forEach((e: any) => { exMap[e.section_id] = e.teacher_id; });

    setModalSections((secs || []).map((s: any) => ({
      section_id: s.id,
      section_name: s.name,
      class_id: s.class_id,
      class_name: (s.classes as any)?.name || '',
      teacher_id: exMap[s.id] || '',
    })));
    setLoadingModal(false);
  };

  const saveManage = async () => {
    if (!manageSubject) return;
    setSaving(true);
    for (const row of modalSections) {
      if (row.teacher_id) {
        // Remove any other teacher for this section+subject first (one teacher per section per subject)
        await supabase.from('teacher_section_assignments')
          .delete()
          .eq('subject_id', manageSubject.id)
          .eq('section_id', row.section_id)
          .neq('teacher_id', row.teacher_id);
        // Upsert the chosen teacher
        await supabase.from('teacher_section_assignments').upsert({
          teacher_id: row.teacher_id,
          section_id: row.section_id,
          subject_id: manageSubject.id,
          school_id: schoolId,
          academic_year_id: academicYearId || null,
        }, { onConflict: 'teacher_id,section_id,subject_id,academic_year_id', ignoreDuplicates: false });
      } else {
        // No teacher → clear any assignment for this section
        await supabase.from('teacher_section_assignments')
          .delete()
          .eq('subject_id', manageSubject.id)
          .eq('section_id', row.section_id);
      }
    }
    setSaving(false);
    setShowManage(false);
    fetchAll();
  };

  const handleAddSubject = async () => {
    if (!addForm.name.trim()) { setAddError('Subject name is required'); return; }
    setSaving(true); setAddError('');
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current',true).eq('school_id',schoolId).maybeSingle();
    const { error } = await supabase.from('subjects').insert({
      name: addForm.name.trim(), code: addForm.code.trim() || null,
      class_id: addForm.class_id || null, school_id: schoolId, academic_year_id: yr?.id || null,
    });
    if (error) { setAddError(error.message); setSaving(false); return; }
    setShowAdd(false); setAddForm({ name:'', code:'', class_id:'' }); fetchAll(); setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this subject? This will also remove related timetable slots and teacher assignments.')) return;
    const { error } = await supabase.rpc('delete_subject_cascade', { p_subject_id: id });
    if (error) { alert(`Cannot delete subject.\n(Error: ${error.message})`); return; }
    fetchAll();
  };

  const displayed = subjects.filter(s => !filterClass || s.class_id === filterClass);
  const assignedCount = subjects.filter(s => (assignmentMap[s.id]?.length || 0) > 0).length;

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Subjects</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Assign different teachers per section for each subject</p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddError(''); }}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(59,130,246,0.3)', whiteSpace:'nowrap' }}>
          <span style={{fontSize:16}}>+</span> Add Subject
        </button>
      </div>

      <div className="three-col-stats">
        {[{ label:'Total Subjects', value:subjects.length, color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' },
          { label:'Assigned', value:assignedCount, color:'#16A34A', bg:'#F0FDF4', border:'#DCFCE7' },
          { label:'Unassigned', value:subjects.length-assignedCount, color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' }
        ].map((s,i) => (
          <div key={i} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:'16px 20px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{s.label}</p>
            <p style={{ fontSize:28, fontWeight:800, color:'#0F172A', margin:'6px 0 0' }}>
              {loading ? <span style={{ display:'inline-block', width:32, height:28, background:'rgba(0,0,0,0.08)', borderRadius:6 }}/> : s.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <select value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{ ...IS, width:'auto', minWidth:160 }}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {filterClass && <button onClick={() => setFilterClass('')} style={{ fontSize:12, fontWeight:600, padding:'8px 14px', borderRadius:8, border:'1px solid #E2E8F0', background:'white', color:'#64748B', cursor:'pointer' }}>Clear ×</button>}
        <span style={{ marginLeft:'auto', fontSize:13, color:'#94A3B8' }}>{displayed.length} subject{displayed.length!==1?'s':''}</span>
      </div>

      {/* Subject Table */}
      <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 110px 1.2fr 1.8fr 140px', padding:'12px 20px', background:'#F8FAFC', borderBottom:'1px solid #F1F5F9' }}>
          {['Subject','Code','Class','Teachers Assigned','Actions'].map((h,i) => (
            <p key={h} style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0, textAlign:i===4?'right':'left' }}>{h}</p>
          ))}
        </div>

        {loading ? (
          <div style={{ padding:24, display:'flex', flexDirection:'column', gap:12 }}>
            {[1,2,3,4].map(i => <div key={i} style={{ height:52, background:'#F8FAFC', borderRadius:8 }}/>)}
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ padding:'60px 24px', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:14, background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:22 }}>📚</div>
            <p style={{ fontWeight:700, color:'#1E293B', fontSize:15, margin:0 }}>No subjects yet</p>
            <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Click <strong>+ Add Subject</strong> to get started</p>
          </div>
        ) : displayed.map((sub, idx) => {
          const c = COLORS[idx % COLORS.length];
          const assignments = assignmentMap[sub.id] || [];
          const distinctTeachers = [...new Map(assignments.map(a => [a.teacher_id, a.teacher_name])).values()];
          return (
            <div key={sub.id} style={{ display:'grid', gridTemplateColumns:'2fr 110px 1.2fr 1.8fr 140px', padding:'14px 20px', borderBottom:idx<displayed.length-1?'1px solid #F8FAFC':'none', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:c.bg, border:`1px solid ${c.border}`, color:c.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 }}>
                  {sub.name.charAt(0).toUpperCase()}
                </div>
                <p style={{ fontWeight:700, fontSize:13, color:'#0F172A', margin:0 }}>{sub.name}</p>
              </div>

              <code style={{ fontSize:11, padding:'3px 8px', background:'#F1F5F9', color:'#475569', borderRadius:6, width:'fit-content' }}>
                {sub.code || '—'}
              </code>

              <p style={{ fontSize:13, color:'#475569', margin:0 }}>
                {sub.class_name || <span style={{ color:'#CBD5E1', fontStyle:'italic' }}>All Classes</span>}
              </p>

              {/* Multiple teacher chips */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                {distinctTeachers.length === 0 ? (
                  <span style={{ fontSize:12, color:'#CBD5E1', fontStyle:'italic' }}>None assigned</span>
                ) : distinctTeachers.slice(0,2).map((name, i) => (
                  <span key={i} style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99, background:'#EFF6FF', color:'#1D4ED8', border:'1px solid #DBEAFE', whiteSpace:'nowrap' }}>
                    {name}
                  </span>
                ))}
                {distinctTeachers.length > 2 && (
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'#F1F5F9', color:'#64748B' }}>
                    +{distinctTeachers.length - 2} more
                  </span>
                )}
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:6 }}>
                <button onClick={() => openManage(sub)}
                  style={{ fontSize:12, fontWeight:700, padding:'6px 11px', borderRadius:8, border:'1px solid #DBEAFE', background:'#EFF6FF', color:'#1D4ED8', cursor:'pointer', whiteSpace:'nowrap' }}>
                  👥 Manage
                </button>
                <button onClick={() => handleDelete(sub.id)}
                  style={{ fontSize:12, fontWeight:600, padding:'6px 11px', borderRadius:8, border:'1px solid #FEE2E2', background:'#FEF2F2', color:'#DC2626', cursor:'pointer' }}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Manage Teachers Modal ── */}
      {showManage && manageSubject && (
        <div style={OVL} onClick={e => { if (e.target === e.currentTarget) setShowManage(false); }}>
          <div style={{ width:'100%', maxWidth:560, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.25)', overflow:'hidden', maxHeight:'85vh', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'22px 26px 16px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div>
                <h3 style={{ fontSize:16, fontWeight:800, color:'#0F172A', margin:0 }}>Assign Teachers — {manageSubject.name}</h3>
                <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Each section can have its own teacher</p>
              </div>
              <button onClick={() => setShowManage(false)} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            <div style={{ overflowY:'auto', padding:'16px 26px', display:'flex', flexDirection:'column', gap:8 }}>
              {loadingModal ? (
                [1,2,3].map(i => <div key={i} style={{ height:52, background:'#F8FAFC', borderRadius:10 }}/>)
              ) : modalSections.length === 0 ? (
                <div style={{ padding:'32px 0', textAlign:'center' }}>
                  <p style={{ color:'#94A3B8', fontSize:13 }}>No sections found for this subject&apos;s class.</p>
                  <p style={{ color:'#CBD5E1', fontSize:12, marginTop:4 }}>Create sections first in Classes &amp; Sections.</p>
                </div>
              ) : (
                <>
                  {/* Header row */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, padding:'0 14px' }}>
                    <p style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>Section</p>
                    <p style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>Teacher</p>
                  </div>
                  {modalSections.map((row, i) => (
                    <div key={row.section_id} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, alignItems:'center', padding:'10px 14px', background:'#F8FAFC', borderRadius:10, border:'1px solid #F1F5F9' }}>
                      <div>
                        <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:0 }}>
                          {row.class_name} — {row.section_name}
                        </p>
                      </div>
                      <select
                        value={row.teacher_id}
                        onChange={e => setModalSections(prev => prev.map((r, j) => j === i ? { ...r, teacher_id: e.target.value } : r))}
                        style={{ ...IS, padding:'7px 10px', fontSize:12 }}>
                        <option value="">— Not assigned —</option>
                        {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                      </select>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div style={{ padding:'14px 26px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, flexShrink:0 }}>
              <button onClick={() => setShowManage(false)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={saveManage} disabled={saving || loadingModal}
                style={{ flex:2, padding:11, borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                {saving ? 'Saving...' : '✓ Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Subject Modal ── */}
      {showAdd && (
        <div style={OVL}>
          <div style={{ width:'100%', maxWidth:440, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', overflow:'hidden' }}>
            <div style={{ padding:'24px 28px 18px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Add Subject</h3>
                <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Create a new subject for this school</p>
              </div>
              <button onClick={() => setShowAdd(false)} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
            <div style={{ padding:'20px 28px' }}>
              {addError && <div style={{ marginBottom:14, padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{addError}</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <label style={LS}>Subject Name <span style={{color:'#EF4444'}}>*</span></label>
                  <input value={addForm.name} onChange={e => setAddForm(f => ({...f, name:e.target.value}))} placeholder="e.g. Mathematics" style={IS} autoFocus/>
                </div>
                <div>
                  <label style={LS}>Subject Code</label>
                  <input value={addForm.code} onChange={e => setAddForm(f => ({...f, code:e.target.value}))} placeholder="e.g. MATH101 (optional)" style={IS}/>
                </div>
                <div>
                  <label style={LS}>Class</label>
                  <select value={addForm.class_id} onChange={e => setAddForm(f => ({...f, class_id:e.target.value}))} style={IS}>
                    <option value="">All Classes (school-wide)</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ padding:'10px 14px', background:'#F8FAFC', borderRadius:10, border:'1px solid #F1F5F9' }}>
                  <p style={{ fontSize:12, color:'#64748B', margin:0 }}>💡 After creating, click <strong>👥 Manage</strong> to assign teachers per section.</p>
                </div>
              </div>
            </div>
            <div style={{ padding:'0 28px 24px', display:'flex', gap:10 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleAddSubject} disabled={saving}
                style={{ flex:1, padding:11, borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                {saving ? 'Creating...' : 'Create Subject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
