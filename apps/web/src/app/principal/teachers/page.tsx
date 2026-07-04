'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Teacher { id:string; full_name:string; phone:string; email:string|null; is_active:boolean; last_login_at:string|null; username:string; profile?:{ employee_id:string|null; qualification:string|null; specialization:string|null; joining_date:string|null; }; }
interface ClassItem { id:string; name:string; }
interface Section { id:string; name:string; class_name:string; class_teacher_id?:string|null; }
interface Subject { id:string; name:string; class_id:string; }
interface Assignment { id:string; teacher_id:string; section_id:string; subject_id:string; }

const IS: React.CSSProperties = { width:'100%', padding:'10px 14px', border:'1px solid #E2E8F0', borderRadius:10, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS: React.CSSProperties = { display:'block', fontSize:12, fontWeight:600, color:'#475569', marginBottom:5 };
const overlay: React.CSSProperties = { position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)' };
const modal: React.CSSProperties = { width:'100%', maxWidth:500, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column', maxHeight:'90vh' };

export default function TeachersPage() {
  const supabase = createClient();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState<string|null>(null);
  const [showCreds, setShowCreds] = useState<{username:string;password:string}|null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ full_name:'', phone:'', email:'', employee_id:'', qualification:'', specialization:'', joining_date:'' });
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]); // for filter dropdown
  const [allClasses, setAllClasses] = useState<ClassItem[]>([]); // for filter dropdown
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  // teacher_id → section label they are class teacher of (e.g. "10 - A")
  const [classTeacherMap, setClassTeacherMap] = useState<Record<string, string>>({});
  // Set of teacher_ids who have at least one subject assignment
  const [subjectTeacherSet, setSubjectTeacherSet] = useState<Set<string>>(new Set());
  // teacher_id → Set<subjectId> and teacher_id → Set<classId> from assignments
  const [teacherSubjectMap, setTeacherSubjectMap] = useState<Map<string, Set<string>>>(new Map());
  const [teacherClassMap, setTeacherClassMap] = useState<Map<string, Set<string>>>(new Map());
  // For the Assign modal: which section is this teacher currently class teacher of
  const [classTeacherSection, setClassTeacherSection] = useState(''); // section_id
  const [ctSaving, setCtSaving] = useState(false);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    const { data: cu } = await supabase.from('users').select('school_id').eq('id',(await supabase.auth.getUser()).data.user?.id||'').single();
    if (!cu?.school_id) { setLoading(false); return; }
    const sid = cu.school_id;

    const { data } = await supabase.from('users').select('id,full_name,phone,email,is_active,last_login_at,username,teacher_profiles(employee_id,qualification,specialization,joining_date)').eq('role','teacher').eq('school_id',sid).order('full_name');
    if (data) setTeachers(data.map((t:any)=>({...t,profile:Array.isArray(t.teacher_profiles)?t.teacher_profiles[0]:t.teacher_profiles})) as Teacher[]);

    // Build class teacher map: teacher_id → "ClassName - SectionName"
    const { data: secs } = await supabase.from('sections')
      .select('id, name, class_teacher_id, classes(name)').eq('school_id', sid);
    const ctMap: Record<string, string> = {};
    (secs || []).forEach((s: any) => {
      if (s.class_teacher_id) {
        ctMap[s.class_teacher_id] = `${s.classes?.name || ''} - ${s.name}`;
      }
    });
    setClassTeacherMap(ctMap);

    // Build subject teacher set, and per-teacher subject/class maps
    const { data: asgns } = await supabase.from('teacher_section_assignments')
      .select('teacher_id, subject_id, sections(class_id)').eq('school_id', sid);
    setSubjectTeacherSet(new Set((asgns || []).map((a: any) => a.teacher_id as string)));

    const tSubMap = new Map<string, Set<string>>();
    const tClsMap = new Map<string, Set<string>>();
    (asgns || []).forEach((a: any) => {
      if (!tSubMap.has(a.teacher_id)) tSubMap.set(a.teacher_id, new Set());
      if (a.subject_id) tSubMap.get(a.teacher_id)!.add(a.subject_id);
      const classId = a.sections?.class_id;
      if (classId) {
        if (!tClsMap.has(a.teacher_id)) tClsMap.set(a.teacher_id, new Set());
        tClsMap.get(a.teacher_id)!.add(classId);
      }
    });
    setTeacherSubjectMap(tSubMap);
    setTeacherClassMap(tClsMap);

    // Fetch all subjects and classes for filter dropdowns
    const [{ data: allSub }, { data: yr }] = await Promise.all([
      supabase.from('subjects').select('id,name,class_id').eq('school_id', sid).order('name'),
      supabase.from('academic_years').select('id').eq('is_current', true).eq('school_id', sid).maybeSingle(),
    ]);
    if (allSub) setAllSubjects(allSub);
    const { data: allCls } = yr?.id
      ? await supabase.from('classes').select('id,name').eq('academic_year_id', yr.id).order('numeric_order')
      : await supabase.from('classes').select('id,name').eq('school_id', sid).order('numeric_order');
    if (allCls) setAllClasses(allCls);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);

  const handleAddTeacher = async () => {
    if (!form.full_name||!form.phone) { setFormError('Name and phone required'); return; }
    setSaving(true); setFormError('');
    const empId = form.employee_id||`T${String(teachers.length+1).padStart(3,'0')}`;
    const namePart = form.full_name.trim().split(/\s+/).map(n => n.toLowerCase()).join('.');
    const { data: ud } = await supabase.from('users').select('school_id').eq('id',(await supabase.auth.getUser()).data.user?.id||'').single();
    let schoolCode='school';
    if (ud?.school_id) { const { data: sc } = await supabase.from('schools').select('code').eq('id',ud.school_id).single(); if(sc) schoolCode=sc.code; }
    const username=`${namePart}.${empId.toLowerCase()}@${schoolCode}`;
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const password=Array.from({length:8},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
    try {
      const res = await fetch('/api/auth/create-user',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:`${username.replace('@','.')}@schoolerp.local`, password, role:'teacher', full_name:form.full_name, phone:form.phone, username, school_id:ud?.school_id, profile_data:{employee_id:empId,qualification:form.qualification,specialization:form.specialization,joining_date:form.joining_date||null} }) });
      const result = await res.json();
      if (!res.ok) { setFormError(result.error||'Failed to create teacher'); setSaving(false); return; }
      setShowAdd(false); setShowCreds({username,password});
      setForm({full_name:'',phone:'',email:'',employee_id:'',qualification:'',specialization:'',joining_date:''});
      fetchTeachers();
    } catch { setFormError('Network error'); }
    setSaving(false);
  };

  const toggleActive = async (id:string, current:boolean) => { await supabase.from('users').update({is_active:!current}).eq('id',id); fetchTeachers(); };

  const openAssign = async (teacherId:string) => {
    setShowAssign(teacherId);
    setSelectedSection(''); setSelectedSubject('');
    const { data: tu } = await supabase.from('users').select('school_id').eq('id',teacherId).single();
    const schoolId=tu?.school_id; if(!schoolId) return;
    const { data: sec } = await supabase.from('sections').select('id,name,class_teacher_id,classes(name)').eq('school_id',schoolId);
    if (sec) setSections(sec.map((s:any)=>({id:s.id,name:s.name,class_name:s.classes?.name||'',class_teacher_id:s.class_teacher_id})));
    const { data: sub } = await supabase.from('subjects').select('id,name,class_id').eq('school_id',schoolId);
    if (sub) setSubjects(sub as Subject[]);
    const { data: asgn } = await supabase.from('teacher_section_assignments').select('*').eq('teacher_id',teacherId);
    if (asgn) setAssignments(asgn as Assignment[]);
    // Pre-select the section this teacher is currently class teacher of
    const currentCtSec = (sec || []).find((s:any) => s.class_teacher_id === teacherId);
    setClassTeacherSection(currentCtSec?.id || '');
  };

  // Set (or remove) a teacher as class teacher for a section
  const setAsClassTeacher = async () => {
    if (!showAssign) return;
    setCtSaving(true);
    // Clear this teacher from any section where they were previously class teacher
    const prevSec = sections.find(s => (s as any).class_teacher_id === showAssign);
    if (prevSec && prevSec.id !== classTeacherSection) {
      await supabase.from('sections').update({ class_teacher_id: null }).eq('id', prevSec.id);
    }
    // Set on selected section (or clear if none selected)
    if (classTeacherSection) {
      await supabase.from('sections').update({ class_teacher_id: showAssign }).eq('id', classTeacherSection);
    } else if (prevSec) {
      // Explicit removal (already cleared above)
    }
    setCtSaving(false);
    fetchTeachers(); // refresh role badges
    openAssign(showAssign); // refresh modal data
  };

  const addAssignment = async () => {
    if (!selectedSection||!selectedSubject||!showAssign) return;
    const { data: tu } = await supabase.from('users').select('school_id').eq('id',showAssign).single();
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current',true).maybeSingle();
    await supabase.from('teacher_section_assignments').insert({ teacher_id:showAssign, section_id:selectedSection, subject_id:selectedSubject, academic_year_id:yr?.id, school_id:tu?.school_id||null });
    // Keep subjects.teacher_id in sync — ensures marks-page fallback and Subjects page both show correct teacher
    await supabase.from('subjects').update({ teacher_id: showAssign }).eq('id', selectedSubject);
    openAssign(showAssign); setSelectedSection(''); setSelectedSubject('');
  };

  const removeAssignment = async (id: string, subjectId: string) => {
    await supabase.from('teacher_section_assignments').delete().eq('id',id);
    // Check if any other assignment exists for this subject — if not, clear the teacher
    if (subjectId) {
      const { count } = await supabase.from('teacher_section_assignments')
        .select('id', { count: 'exact', head: true }).eq('subject_id', subjectId);
      if ((count ?? 0) === 0) {
        await supabase.from('subjects').update({ teacher_id: null }).eq('id', subjectId);
      }
    }
    if(showAssign) openAssign(showAssign);
  };
  const filtered = teachers.filter(t => {
    const matchSearch = t.full_name.toLowerCase().includes(search.toLowerCase()) || t.username?.toLowerCase().includes(search.toLowerCase());
    const matchSubject = !filterSubject || (teacherSubjectMap.get(t.id)?.has(filterSubject) ?? false);
    const matchClass   = !filterClass   || (teacherClassMap.get(t.id)?.has(filterClass) ?? false);
    return matchSearch && matchSubject && matchClass;
  });
  const activeCount = teachers.filter(t=>t.is_active).length;
  const classTeacherCount = teachers.filter(t => classTeacherMap[t.id]).length;
  const subjectOnlyCount = teachers.filter(t => !classTeacherMap[t.id] && subjectTeacherSet.has(t.id)).length;
  const unassignedCount  = teachers.filter(t => !classTeacherMap[t.id] && !subjectTeacherSet.has(t.id)).length;

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Teacher Management</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Manage teachers, assignments, and credentials</p>
        </div>
        <button onClick={()=>{setShowAdd(true);setFormError('');}} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg, #1E3A8A, #3B82F6)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(59,130,246,0.3)', whiteSpace:'nowrap' }}>
          <span style={{fontSize:16}}>+</span> Add Teacher
        </button>
      </div>

      {/* Stats */}
      <div className="three-col-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {[
          { label:'Total Teachers',   value:teachers.length,    color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' },
          { label:'Active',           value:activeCount,         color:'#16A34A', bg:'#F0FDF4', border:'#DCFCE7' },
          { label:'Inactive',         value:teachers.length-activeCount, color:'#DC2626', bg:'#FEF2F2', border:'#FEE2E2' },
        ].map((s,i)=>(
          <div key={i} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:'16px 20px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{s.label}</p>
            <p style={{ fontSize:28, fontWeight:800, color:'#0F172A', margin:'6px 0 0' }}>
              {loading?<span style={{ display:'inline-block', width:32, height:28, background:'rgba(0,0,0,0.08)', borderRadius:6 }}/>:s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Role breakdown row */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10 }}>
          <span style={{ fontSize:14 }}>🏫</span>
          <div>
            <p style={{ fontSize:10, fontWeight:700, color:'#15803D', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Class Teachers</p>
            <p style={{ fontSize:20, fontWeight:800, color:'#14532D', margin:0 }}>{loading ? '—' : classTeacherCount}</p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:10 }}>
          <span style={{ fontSize:14 }}>📚</span>
          <div>
            <p style={{ fontSize:10, fontWeight:700, color:'#1D4ED8', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Subject Teachers</p>
            <p style={{ fontSize:20, fontWeight:800, color:'#1E3A8A', margin:0 }}>{loading ? '—' : subjectOnlyCount}</p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:10 }}>
          <span style={{ fontSize:14 }}>⚪</span>
          <div>
            <p style={{ fontSize:10, fontWeight:700, color:'#64748B', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Unassigned</p>
            <p style={{ fontSize:20, fontWeight:800, color:'#334155', margin:0 }}>{loading ? '—' : unassignedCount}</p>
          </div>
        </div>
      </div>

      {/* Search + Filters */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" placeholder="Search by name or username..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...IS, paddingLeft:36 }}/>
        </div>
        <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} style={{ ...IS, width:'auto', minWidth:140 }}>
          <option value="">All Subjects</option>
          {allSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{ ...IS, width:'auto', minWidth:120 }}>
          <option value="">All Classes</option>
          {allClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(filterSubject || filterClass) && (
          <button onClick={() => { setFilterSubject(''); setFilterClass(''); }} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #FEE2E2', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:600, cursor:'pointer' }}>✕ Clear</button>
        )}
      </div>

      {/* List */}
      <div className="list-table-container">
        <div className="teacher-list-grid header-row" style={{ padding:'12px 20px', background:'#F8FAFC', borderBottom:'1px solid #F1F5F9' }}>
          {['Teacher','Employee ID','Contact','Status','Actions'].map((h,i)=>(
            <p key={h} style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0, textAlign:i===4?'right':'left' }}>{h}</p>
          ))}
        </div>
        {loading ? (
          <div style={{ padding:24, display:'flex', flexDirection:'column', gap:12 }}>
            {[1,2,3].map(i=><div key={i} style={{ height:52, background:'#F8FAFC', borderRadius:8 }}/>)}
          </div>
        ) : filtered.length===0 ? (
          <div style={{ padding:'60px 24px', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:14, background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:22 }}>👨‍🏫</div>
            <p style={{ fontWeight:700, color:'#1E293B', fontSize:15, margin:0 }}>No teachers yet</p>
            <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Click <strong>+ Add Teacher</strong> to get started</p>
          </div>
        ) : filtered.map((t,idx)=>(
          <div key={t.id} className="teacher-list-grid" style={{ padding:'14px 20px', borderBottom:idx<filtered.length-1?'1px solid #F8FAFC':'none', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background: classTeacherMap[t.id] ? 'linear-gradient(135deg, #065F46, #059669)' : subjectTeacherSet.has(t.id) ? 'linear-gradient(135deg, #1E3A8A, #3B82F6)' : 'linear-gradient(135deg, #475569, #94A3B8)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, flexShrink:0 }}>
                {t.full_name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
              </div>
              <div>
                <p style={{ fontWeight:700, fontSize:13, color:'#0F172A', margin:0 }}>{t.full_name}</p>
                <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2, flexWrap:'wrap' }}>
                  <code style={{ fontSize:10, color:'#94A3B8', background:'#F1F5F9', padding:'1px 5px', borderRadius:4 }}>{t.username}</code>
                  {/* Role badge */}
                  {classTeacherMap[t.id] ? (
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:99, background:'#DCFCE7', color:'#15803D', letterSpacing:'0.03em' }}>
                      🏫 Class Teacher · {classTeacherMap[t.id]}
                    </span>
                  ) : subjectTeacherSet.has(t.id) ? (
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:99, background:'#DBEAFE', color:'#1D4ED8', letterSpacing:'0.03em' }}>
                      📚 Subject Teacher
                    </span>
                  ) : (
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:99, background:'#F1F5F9', color:'#64748B', letterSpacing:'0.03em' }}>
                      ⚪ Unassigned
                    </span>
                  )}
                </div>
              </div>
            </div>
            <code style={{ fontSize:11, padding:'3px 8px', background:'#F1F5F9', color:'#475569', borderRadius:6 }}>{t.profile?.employee_id||'—'}</code>
            <div>
              <p style={{ fontSize:13, color:'#475569', margin:0 }}>{t.phone}</p>
              {t.email && <p style={{ fontSize:11, color:'#94A3B8', margin:'1px 0 0' }}>{t.email}</p>}
            </div>
            <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99, background:t.is_active?'#F0FDF4':'#FEF2F2', color:t.is_active?'#16A34A':'#DC2626', width:'fit-content' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:t.is_active?'#16A34A':'#DC2626' }}/>
              {t.is_active?'Active':'Inactive'}
            </span>
            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              <button onClick={()=>openAssign(t.id)} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #DBEAFE', background:'#EFF6FF', color:'#1D4ED8', cursor:'pointer' }}>Assign</button>
              <button onClick={()=>toggleActive(t.id,t.is_active)} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:`1px solid ${t.is_active?'#FEE2E2':'#DCFCE7'}`, background:t.is_active?'#FEF2F2':'#F0FDF4', color:t.is_active?'#DC2626':'#16A34A', cursor:'pointer' }}>
                {t.is_active?'Deactivate':'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Teacher Modal */}
      {showAdd && (
        <div style={overlay}>
          <div style={modal}>
            <div style={{ padding:'24px 28px 18px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div><h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Add Teacher</h3><p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Create teacher account and credentials</p></div>
              <button onClick={()=>setShowAdd(false)} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
            <div style={{ padding:'20px 28px', overflowY:'auto', flex:1 }}>
              {formError && <div style={{ marginBottom:14, padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{formError}</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div><label style={LS}>Full Name <span style={{color:'#EF4444'}}>*</span></label><input value={form.full_name} onChange={e=>setForm(f=>({...f,full_name:e.target.value}))} style={IS}/></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div><label style={LS}>Phone <span style={{color:'#EF4444'}}>*</span></label><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={IS}/></div>
                  <div><label style={LS}>Email</label><input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} style={IS}/></div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div><label style={LS}>Employee ID</label><input placeholder="Auto-generated" value={form.employee_id} onChange={e=>setForm(f=>({...f,employee_id:e.target.value}))} style={IS}/></div>
                  <div><label style={LS}>Joining Date</label><input type="date" value={form.joining_date} onChange={e=>setForm(f=>({...f,joining_date:e.target.value}))} style={IS}/></div>
                </div>
                <div><label style={LS}>Qualification</label><input value={form.qualification} onChange={e=>setForm(f=>({...f,qualification:e.target.value}))} style={IS}/></div>
                <div><label style={LS}>Specialization</label><input value={form.specialization} onChange={e=>setForm(f=>({...f,specialization:e.target.value}))} style={IS}/></div>
              </div>
            </div>
            <div style={{ padding:'16px 28px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, flexShrink:0 }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleAddTeacher} disabled={saving} style={{ flex:1, padding:11, borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                {saving?'Creating...':'Create Teacher'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCreds && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:420, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', overflow:'hidden' }}>
            <div style={{ padding:'28px 28px 20px', textAlign:'center', borderBottom:'1px solid #F1F5F9' }}>
              <div style={{ width:52, height:52, borderRadius:14, background:'#F0FDF4', border:'1px solid #DCFCE7', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:24 }}>🎉</div>
              <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Teacher Created!</h3>
              <p style={{ fontSize:13, color:'#64748B', marginTop:5 }}>Share these credentials with the teacher</p>
            </div>
            <div style={{ padding:'20px 28px' }}>
              <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:16, display:'flex', flexDirection:'column', gap:12 }}>
                {[{label:'Username',value:showCreds.username,color:'#1D4ED8'},{label:'Password',value:showCreds.password,color:'#DC2626'}].map(item=>(
                  <div key={item.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:13, color:'#64748B' }}>{item.label}</span>
                    <code style={{ fontSize:13, fontWeight:700, color:item.color, background:'white', border:'1px solid #E2E8F0', padding:'3px 10px', borderRadius:7 }}>{item.value}</code>
                  </div>
                ))}
              </div>
              <p style={{ fontSize:12, color:'#F59E0B', marginTop:12, textAlign:'center' }}>⚠ Password will be changed on first login</p>
            </div>
            <div style={{ padding:'0 28px 24px' }}>
              <button onClick={()=>setShowCreds(null)} style={{ width:'100%', padding:12, borderRadius:10, border:'none', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssign && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:520, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', overflow:'hidden', display:'flex', flexDirection:'column', maxHeight:'90vh' }}>
            <div style={{ padding:'24px 28px 18px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div>
                <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Assignments</h3>
                <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>
                  {teachers.find(t=>t.id===showAssign)?.full_name}
                </p>
              </div>
              <button onClick={()=>{setShowAssign(null);}} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            <div style={{ overflowY:'auto', flex:1 }}>
              {/* ── Section 1: Class Teacher Role ────────────────────────── */}
              <div style={{ padding:'20px 28px', borderBottom:'1px solid #F1F5F9' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <span style={{ fontSize:16 }}>🏫</span>
                  <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:0 }}>Class Teacher Assignment</p>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:'#F0FDF4', color:'#15803D', fontWeight:600 }}>Exclusive per section</span>
                </div>
                <p style={{ fontSize:12, color:'#64748B', margin:'0 0 12px' }}>
                  Class teachers take Period 1 attendance and manage their section. Only one teacher can be class teacher per section.
                </p>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <select value={classTeacherSection} onChange={e=>setClassTeacherSection(e.target.value)}
                    style={{ ...IS, flex:1, fontSize:12 }}>
                    <option value="">— Not a class teacher —</option>
                    {sections.map(s=>(
                      <option key={s.id} value={s.id}>
                        {s.class_name} – {s.name}
                        {(s as any).class_teacher_id && (s as any).class_teacher_id !== showAssign ? ' ⚠ Has teacher' : ''}
                        {(s as any).class_teacher_id === showAssign ? ' ✓ Current' : ''}
                      </option>
                    ))}
                  </select>
                  <button onClick={setAsClassTeacher} disabled={ctSaving}
                    style={{ padding:'10px 18px', borderRadius:10, border:'none', background:ctSaving?'#A7F3D0':'linear-gradient(135deg,#065F46,#059669)', color:'white', fontSize:13, fontWeight:700, cursor:ctSaving?'not-allowed':'pointer', flexShrink:0, whiteSpace:'nowrap' }}>
                    {ctSaving ? '...' : 'Save'}
                  </button>
                </div>
                {/* Warning if the chosen section already has a different class teacher */}
                {classTeacherSection && sections.find(s=>s.id===classTeacherSection) && (sections.find(s=>s.id===classTeacherSection) as any)?.class_teacher_id && (sections.find(s=>s.id===classTeacherSection) as any)?.class_teacher_id !== showAssign && (
                  <p style={{ fontSize:12, color:'#D97706', marginTop:8, display:'flex', gap:5, alignItems:'center' }}>
                    <span>⚠</span> This section already has a class teacher — saving will replace them.
                  </p>
                )}
              </div>

              {/* ── Section 2: Subject Assignments ──────────────────────── */}
              <div style={{ padding:'20px 28px 0' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <span style={{ fontSize:16 }}>📚</span>
                  <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:0 }}>Subject Assignments</p>
                </div>
                {assignments.length===0 ? (
                  <p style={{ textAlign:'center', fontSize:13, color:'#94A3B8', padding:'16px 0', fontStyle:'italic' }}>No subject assignments yet</p>
                ) : assignments.map(a=>{
                  const sec=sections.find(s=>s.id===a.section_id);
                  const sub=subjects.find(s=>s.id===a.subject_id);
                  return (
                    <div key={a.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:9, background:'#F8FAFC', border:'1px solid #F1F5F9', marginBottom:6 }}>
                      <span style={{ fontSize:13, color:'#334155' }}><strong>{sec?.class_name} – {sec?.name}</strong> → {sub?.name}</span>
                      <button onClick={()=>removeAssignment(a.id, a.subject_id)} style={{ fontSize:12, fontWeight:600, padding:'4px 10px', borderRadius:7, border:'1px solid #FEE2E2', background:'#FEF2F2', color:'#DC2626', cursor:'pointer' }}>Remove</button>
                    </div>
                  );
                })}
              </div>

              <div style={{ padding:'16px 28px', borderTop:'1px solid #F1F5F9', marginTop:12 }}>
                <p style={{ fontSize:12, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Add Subject Assignment</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  <select value={selectedSection} onChange={e=>setSelectedSection(e.target.value)} style={IS}>
                    <option value="">Select section...</option>
                    {sections.map(s=><option key={s.id} value={s.id}>{s.class_name} – {s.name}</option>)}
                  </select>
                  <select value={selectedSubject} onChange={e=>setSelectedSubject(e.target.value)} style={IS}>
                    <option value="">Select subject...</option>
                    {subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button onClick={addAssignment} disabled={!selectedSection||!selectedSubject} style={{ width:'100%', padding:11, borderRadius:10, border:'none', background:(!selectedSection||!selectedSubject)?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:(!selectedSection||!selectedSubject)?'not-allowed':'pointer' }}>
                  Add Assignment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
