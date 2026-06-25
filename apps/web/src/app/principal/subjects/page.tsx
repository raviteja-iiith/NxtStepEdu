'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Subject { id:string; name:string; code:string|null; class_id:string|null; teacher_id:string|null; teacher_name?:string; class_name?:string; }
interface Teacher { id:string; full_name:string; }
interface ClassItem { id:string; name:string; }

const IS: React.CSSProperties = { width:'100%', padding:'10px 14px', border:'1px solid #E2E8F0', borderRadius:10, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS: React.CSSProperties = { display:'block', fontSize:12, fontWeight:600, color:'#475569', marginBottom:5 };
const overlay: React.CSSProperties = { position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)' };

// Subject color palette by index
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
  const [saving, setSaving] = useState(false);

  // Add subject state
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name:'', code:'', class_id:'' });
  const [addError, setAddError] = useState('');

  // Assign teacher state — per subject (inline)
  const [editingId, setEditingId] = useState<string|null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [filterClass, setFilterClass] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!u?.school_id) { setLoading(false); return; }
    const sid = u.school_id;
    setSchoolId(sid);

    // Subjects
    const { data: subs } = await supabase.from('subjects').select('id,name,code,class_id,teacher_id,classes(name)').eq('school_id', sid).order('name');
    if (subs) {
      const teacherIds = [...new Set((subs as any[]).filter((s:any)=>s.teacher_id).map((s:any)=>s.teacher_id))];
      let teacherMap: Record<string,string> = {};
      if (teacherIds.length > 0) {
        const { data: td } = await supabase.from('users').select('id,full_name').in('id', teacherIds as string[]);
        if (td) td.forEach((t:any) => { teacherMap[t.id] = t.full_name; });
      }
      setSubjects((subs as any[]).map((s:any) => ({ ...s, teacher_name: s.teacher_id ? teacherMap[s.teacher_id] : null, class_name: (s.classes as any)?.name || null })));
    }

    // Teachers
    const { data: tList } = await supabase.from('users').select('id,full_name').eq('school_id', sid).eq('role','teacher').eq('is_active',true).order('full_name');
    if (tList) setTeachers(tList);

    // Classes
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current',true).eq('school_id',sid).maybeSingle();
    if (yr) {
      const { data: cls } = await supabase.from('classes').select('id,name').eq('academic_year_id', yr.id).order('numeric_order');
      if (cls) setClasses(cls);
    } else {
      const { data: cls } = await supabase.from('classes').select('id,name').eq('school_id', sid).order('numeric_order');
      if (cls) setClasses(cls);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Add subject
  const handleAddSubject = async () => {
    if (!addForm.name.trim()) { setAddError('Subject name is required'); return; }
    setSaving(true); setAddError('');
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current',true).eq('school_id',schoolId).maybeSingle();
    const { error } = await supabase.from('subjects').insert({
      name: addForm.name.trim(),
      code: addForm.code.trim() || null,
      class_id: addForm.class_id || null,
      school_id: schoolId,
      academic_year_id: yr?.id || null,
    });
    if (error) { setAddError(error.message); setSaving(false); return; }
    setShowAdd(false);
    setAddForm({ name:'', code:'', class_id:'' });
    fetchAll();
    setSaving(false);
  };

  // Assign teacher to subject (also syncs teacher_section_assignments)
  const handleAssignTeacher = async (subjectId: string, classId: string|null) => {
    setSaving(true);
    await supabase.from('subjects').update({ teacher_id: selectedTeacher || null }).eq('id', subjectId);
    // Always clear old assignments for this subject before re-creating
    await supabase.from('teacher_section_assignments').delete().eq('subject_id', subjectId);
    if (selectedTeacher) {
      const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current',true).maybeSingle();
      // If subject has a class_id, assign to sections of that class only.
      // If class_id is null (school-wide subject), assign to ALL school sections.
      const secQuery = classId
        ? supabase.from('sections').select('id').eq('class_id', classId)
        : supabase.from('sections').select('id').eq('school_id', schoolId);
      const { data: secs } = await secQuery;
      if (secs && secs.length > 0) {
        const assignments = secs.map((s:any) => ({ teacher_id:selectedTeacher, section_id:s.id, subject_id:subjectId, school_id:schoolId, academic_year_id:yr?.id||null }));
        await supabase.from('teacher_section_assignments').upsert(assignments, { onConflict:'teacher_id,section_id,subject_id,academic_year_id', ignoreDuplicates:true });
      }
    }
    setEditingId(null); setSelectedTeacher('');
    fetchAll(); setSaving(false);
  };

  // Delete subject — delegates to DB function (SECURITY DEFINER bypasses RLS)
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this subject? This will also remove related timetable slots and teacher assignments.')) return;
    const { error } = await supabase.rpc('delete_subject_cascade', { p_subject_id: id });
    if (error) { alert(`Cannot delete subject.\n(Error: ${error.message})`); return; }
    fetchAll();
  };

  const displayed = subjects.filter(s => !filterClass || s.class_id === filterClass);
  const assignedCount = subjects.filter(s => s.teacher_id).length;

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Subjects</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Add subjects and assign teachers</p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddError(''); }} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(59,130,246,0.3)', whiteSpace:'nowrap' }}>
          <span style={{fontSize:16}}>+</span> Add Subject
        </button>
      </div>

      {/* Stat Cards */}
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

      {/* Filter */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <select value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{ ...IS, width:'auto', minWidth:160 }}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {filterClass && <button onClick={() => setFilterClass('')} style={{ fontSize:12, fontWeight:600, padding:'8px 14px', borderRadius:8, border:'1px solid #E2E8F0', background:'white', color:'#64748B', cursor:'pointer' }}>Clear ×</button>}
        <span style={{ marginLeft:'auto', fontSize:13, color:'#94A3B8' }}>{displayed.length} subject{displayed.length!==1?'s':''}</span>
      </div>

      {/* Subject List */}
      <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
        {/* Table Header */}
        <div style={{ display:'grid', gridTemplateColumns:'2fr 120px 1.5fr 140px 100px', padding:'12px 20px', background:'#F8FAFC', borderBottom:'1px solid #F1F5F9' }}>
          {['Subject', 'Code', 'Class', 'Assigned Teacher', 'Actions'].map((h,i) => (
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
            <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Click <strong>+ Add Subject</strong> to create the first subject</p>
          </div>
        ) : displayed.map((sub, idx) => {
          const c = COLORS[idx % COLORS.length];
          const isEditing = editingId === sub.id;
          return (
            <div key={sub.id} style={{ display:'grid', gridTemplateColumns:'2fr 120px 1.5fr 140px 100px', padding:'14px 20px', borderBottom:idx<displayed.length-1?'1px solid #F8FAFC':'none', alignItems:'center' }}>
              {/* Subject Name */}
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:c.bg, border:`1px solid ${c.border}`, color:c.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 }}>
                  {sub.name.charAt(0).toUpperCase()}
                </div>
                <p style={{ fontWeight:700, fontSize:13, color:'#0F172A', margin:0 }}>{sub.name}</p>
              </div>

              {/* Code */}
              <code style={{ fontSize:11, padding:'3px 8px', background:'#F1F5F9', color:'#475569', borderRadius:6, width:'fit-content' }}>
                {sub.code || '—'}
              </code>

              {/* Class */}
              <p style={{ fontSize:13, color:'#475569', margin:0 }}>{sub.class_name || <span style={{ color:'#CBD5E1', fontStyle:'italic' }}>All Classes</span>}</p>

              {/* Assigned Teacher */}
              {isEditing ? (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <select value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)} style={{ ...IS, padding:'6px 10px', fontSize:12 }}>
                    <option value="">— Remove —</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                  <button onClick={() => handleAssignTeacher(sub.id, sub.class_id)} disabled={saving} style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'#1D4ED8', color:'white', fontSize:12, fontWeight:700, cursor:saving?'not-allowed':'pointer', flexShrink:0 }}>
                    {saving?'…':'Save'}
                  </button>
                  <button onClick={() => { setEditingId(null); setSelectedTeacher(''); }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #E2E8F0', background:'white', fontSize:12, color:'#64748B', cursor:'pointer', flexShrink:0 }}>✕</button>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:13, color:sub.teacher_name?'#334155':'#CBD5E1', fontStyle:sub.teacher_name?'normal':'italic', fontWeight:sub.teacher_name?600:400 }}>
                    {sub.teacher_name || 'Not assigned'}
                  </span>
                  <button onClick={() => { setEditingId(sub.id); setSelectedTeacher(sub.teacher_id||''); }}
                    style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:6, border:`1px solid ${sub.teacher_name?'#DBEAFE':'#E2E8F0'}`, background:sub.teacher_name?'#EFF6FF':'#F8FAFC', color:sub.teacher_name?'#1D4ED8':'#64748B', cursor:'pointer', flexShrink:0 }}>
                    {sub.teacher_name ? 'Change' : 'Assign'}
                  </button>
                </div>
              )}

              {/* Actions */}
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button onClick={() => handleDelete(sub.id)} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #FEE2E2', background:'#FEF2F2', color:'#DC2626', cursor:'pointer' }}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Subject Modal */}
      {showAdd && (
        <div style={overlay}>
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
                    <option value="">All Classes (no specific class)</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ padding:'12px 14px', background:'#F8FAFC', borderRadius:10, border:'1px solid #F1F5F9' }}>
                  <p style={{ fontSize:12, color:'#64748B', margin:0 }}>
                    💡 You can assign a teacher to this subject after it&apos;s created.
                  </p>
                </div>
              </div>
            </div>
            <div style={{ padding:'0 28px 24px', display:'flex', gap:10 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleAddSubject} disabled={saving} style={{ flex:1, padding:11, borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                {saving ? 'Creating...' : 'Create Subject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
