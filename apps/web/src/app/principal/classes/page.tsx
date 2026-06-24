'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Section { id:string; name:string; class_teacher_id:string|null; teacher_name?:string; }
interface ClassItem { id:string; name:string; numeric_order:number|null; sections:Section[]; }
interface Teacher { id:string; full_name:string; }

const IS: React.CSSProperties = { width:'100%', padding:'10px 14px', border:'1px solid #E2E8F0', borderRadius:10, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS: React.CSSProperties = { display:'block', fontSize:12, fontWeight:600, color:'#475569', marginBottom:5 };
const overlay: React.CSSProperties = { position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)' };

// Class color bands
const CLASS_COLORS = [
  { bg:'#EFF6FF', accent:'#1D4ED8', border:'#DBEAFE', light:'#BFDBFE' },
  { bg:'#F0FDF4', accent:'#16A34A', border:'#DCFCE7', light:'#BBF7D0' },
  { bg:'#F5F3FF', accent:'#7C3AED', border:'#EDE9FE', light:'#DDD6FE' },
  { bg:'#FFFBEB', accent:'#D97706', border:'#FDE68A', light:'#FCD34D' },
  { bg:'#FDF2F8', accent:'#BE185D', border:'#FBCFE8', light:'#F9A8D4' },
  { bg:'#F0FDFA', accent:'#0F766E', border:'#CCFBF1', light:'#99F6E4' },
];

export default function PrincipalClassesPage() {
  const supabase = createClient();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState('');
  const [academicYearId, setAcademicYearId] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);

  // Add Class modal
  const [showAddClass, setShowAddClass] = useState(false);
  const [classForm, setClassForm] = useState({ name:'', numeric_order:'' });
  const [classError, setClassError] = useState('');

  // Add Section modal
  const [showAddSection, setShowAddSection] = useState<string|null>(null); // class_id
  const [sectionForm, setSectionForm] = useState({ name:'', class_teacher_id:'' });
  const [sectionError, setSectionError] = useState('');

  // Assign class teacher inline
  const [editingSection, setEditingSection] = useState<string|null>(null);
  const [editTeacher, setEditTeacher] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!u?.school_id) { setLoading(false); return; }
    const sid = u.school_id;
    setSchoolId(sid);

    // Academic year
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).eq('school_id', sid).maybeSingle();
    setAcademicYearId(yr?.id || null);

    // Classes + sections — no academic_year_id filter so newly created entries always appear
    const { data: cls } = await supabase
      .from('classes').select('id,name,numeric_order,sections(id,name,class_teacher_id)')
      .eq('school_id', sid).order('numeric_order');

    if (cls) {
      // Resolve class teacher names
      const allSections = (cls as any[]).flatMap((c:any) => c.sections || []);
      const teacherIds = [...new Set(allSections.filter((s:any)=>s.class_teacher_id).map((s:any)=>s.class_teacher_id))];
      let tMap: Record<string,string> = {};
      if (teacherIds.length > 0) {
        const { data: td } = await supabase.from('users').select('id,full_name').in('id', teacherIds as string[]);
        if (td) td.forEach((t:any) => { tMap[t.id] = t.full_name; });
      }
      setClasses((cls as any[]).map((c:any) => ({
        ...c,
        sections: (c.sections||[]).map((s:any) => ({ ...s, teacher_name: s.class_teacher_id ? tMap[s.class_teacher_id] : null }))
      })));
    }

    // Teachers for dropdowns
    const { data: tl } = await supabase.from('users').select('id,full_name').eq('school_id', sid).eq('role','teacher').eq('is_active',true).order('full_name');
    if (tl) setTeachers(tl);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Create class
  const handleAddClass = async () => {
    if (!classForm.name.trim()) { setClassError('Class name is required'); return; }
    setSaving(true); setClassError('');
    const { error } = await supabase.from('classes').insert({
      name: classForm.name.trim(),
      numeric_order: classForm.numeric_order ? parseInt(classForm.numeric_order) : null,
      school_id: schoolId,
      academic_year_id: academicYearId,
    });
    if (error) { setClassError(error.message); setSaving(false); return; }
    setShowAddClass(false); setClassForm({ name:'', numeric_order:'' });
    fetchAll(); setSaving(false);
  };

  // Create section inside a class
  const handleAddSection = async (classId: string) => {
    if (!sectionForm.name.trim()) { setSectionError('Section name is required'); return; }
    setSaving(true); setSectionError('');
    const { error } = await supabase.from('sections').insert({
      name: sectionForm.name.trim(),
      class_id: classId,
      class_teacher_id: sectionForm.class_teacher_id || null,
      school_id: schoolId,
      academic_year_id: academicYearId,
    });
    if (error) { setSectionError(error.message); setSaving(false); return; }
    setShowAddSection(null); setSectionForm({ name:'', class_teacher_id:'' });
    fetchAll(); setSaving(false);
  };

  // Assign class teacher to section
  const handleAssignClassTeacher = async (sectionId: string) => {
    setSaving(true);
    await supabase.from('sections').update({ class_teacher_id: editTeacher || null }).eq('id', sectionId);
    setEditingSection(null); setEditTeacher('');
    fetchAll(); setSaving(false);
  };

  // Delete section — delegates to DB function (SECURITY DEFINER bypasses RLS)
  const handleDeleteSection = async (sectionId: string) => {
    if (!confirm('Delete this section? All related timetable, attendance, and assignment data will also be removed.')) return;
    const { error } = await supabase.rpc('delete_section_cascade', { p_section_id: sectionId });
    if (error) {
      alert(`Cannot delete section.\n(Error: ${error.message})`);
      return;
    }
    fetchAll();
  };

  // Delete class — delegates to DB function (SECURITY DEFINER bypasses RLS)
  const handleDeleteClass = async (classId: string, sectionCount: number) => {
    if (sectionCount > 0) { alert('Remove all sections from this class before deleting it.'); return; }
    if (!confirm('Delete this class? This will also clear class references from any removed/inactive students.')) return;
    const { error } = await supabase.rpc('delete_class_cascade', { p_class_id: classId });
    if (error) {
      alert(`Cannot delete class.\n(Error: ${error.message})`);
      return;
    }
    fetchAll();
  };

  const totalSections = classes.reduce((a, c) => a + c.sections.length, 0);

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Classes & Sections</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Create classes, add sections, and assign class teachers</p>
        </div>
        <button onClick={() => { setShowAddClass(true); setClassError(''); }} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(59,130,246,0.3)', whiteSpace:'nowrap' }}>
          <span style={{fontSize:16}}>+</span> Add Class
        </button>
      </div>

      {/* Stat Cards */}
      <div className="three-col-stats">
        {[{ label:'Total Classes', value:classes.length, color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' },
          { label:'Total Sections', value:totalSections, color:'#7C3AED', bg:'#F5F3FF', border:'#EDE9FE' },
          { label:'Class Teachers Assigned', value:classes.reduce((a,c)=>a+c.sections.filter(s=>s.class_teacher_id).length,0), color:'#16A34A', bg:'#F0FDF4', border:'#DCFCE7' }
        ].map((s,i) => (
          <div key={i} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:'16px 20px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{s.label}</p>
            <p style={{ fontSize:28, fontWeight:800, color:'#0F172A', margin:'6px 0 0' }}>
              {loading ? <span style={{ display:'inline-block', width:32, height:28, background:'rgba(0,0,0,0.08)', borderRadius:6 }}/> : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Academic Year Notice */}
      {!academicYearId && !loading && (
        <div style={{ padding:'12px 18px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{fontSize:18}}>⚠️</span>
          <p style={{ fontSize:13, color:'#92400E', margin:0 }}>No active academic year found. Classes will be created without an academic year link.</p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {[1,2,3].map(i => <div key={i} style={{ height:100, background:'white', borderRadius:14, border:'1px solid #E8ECF0' }}/>)}
        </div>
      ) : classes.length === 0 ? (
        <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', padding:'60px 24px', textAlign:'center' }}>
          <div style={{ width:56, height:56, borderRadius:16, background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:26 }}>🏫</div>
          <p style={{ fontWeight:700, color:'#1E293B', fontSize:15, margin:0 }}>No classes yet</p>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Click <strong>+ Add Class</strong> to create the first class (e.g. "Class 1")</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {classes.map((cls, ci) => {
            const col = CLASS_COLORS[ci % CLASS_COLORS.length];
            return (
              <div key={cls.id} style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                {/* Class Header */}
                <div style={{ padding:'14px 20px', background:col.bg, borderBottom:`1px solid ${col.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:col.accent, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, flexShrink:0 }}>
                      {cls.name.charAt(0)}
                    </div>
                    <div>
                      <h3 style={{ fontSize:15, fontWeight:800, color:'#0F172A', margin:0 }}>{cls.name}</h3>
                      <p style={{ fontSize:12, color:'#64748B', marginTop:2 }}>{cls.sections.length} section{cls.sections.length!==1?'s':''}</p>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => { setShowAddSection(cls.id); setSectionError(''); setSectionForm({name:'',class_teacher_id:''}); }} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:`1px solid ${col.border}`, background:'white', color:col.accent, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      + Add Section
                    </button>
                    <button onClick={() => handleDeleteClass(cls.id, cls.sections.length)} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #FEE2E2', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      Delete
                    </button>
                  </div>
                </div>

                {/* Sections */}
                {cls.sections.length === 0 ? (
                  <div style={{ padding:'16px 20px', textAlign:'center' }}>
                    <p style={{ fontSize:13, color:'#CBD5E1', fontStyle:'italic', margin:0 }}>No sections yet — click <strong style={{color:'#64748B'}}>+ Add Section</strong></p>
                  </div>
                ) : cls.sections.map((sec, si) => (
                  <div key={sec.id} style={{ display:'grid', gridTemplateColumns:'120px 1fr 180px', alignItems:'center', padding:'12px 20px', borderBottom:si<cls.sections.length-1?'1px solid #F8FAFC':'none', gap:16 }}>
                    {/* Section Badge */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                      <div style={{ width:32, height:32, borderRadius:8, background:col.bg, border:`1px solid ${col.light}`, color:col.accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, flexShrink:0, overflow:'hidden' }}>
                        {sec.name.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize:13, fontWeight:600, color:'#334155', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>Section {sec.name}</span>
                    </div>

                    {/* Class Teacher */}
                    {editingSection === sec.id ? (
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <select value={editTeacher} onChange={e => setEditTeacher(e.target.value)} style={{ ...IS, padding:'7px 10px', fontSize:12, flex:1 }}>
                          <option value="">— Remove teacher —</option>
                          {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                        </select>
                        <button onClick={() => handleAssignClassTeacher(sec.id)} disabled={saving} style={{ padding:'7px 12px', borderRadius:8, border:'none', background:'#1D4ED8', color:'white', fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                          {saving?'…':'Save'}
                        </button>
                        <button onClick={() => { setEditingSection(null); setEditTeacher(''); }} style={{ padding:'7px 10px', borderRadius:8, border:'1px solid #E2E8F0', background:'white', fontSize:12, color:'#64748B', cursor:'pointer', flexShrink:0 }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={sec.teacher_name?'#16A34A':'#CBD5E1'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <span style={{ fontSize:13, color:sec.teacher_name?'#334155':'#CBD5E1', fontStyle:sec.teacher_name?'normal':'italic', fontWeight:sec.teacher_name?600:400 }}>
                          {sec.teacher_name ? `${sec.teacher_name}` : 'No class teacher'}
                        </span>
                        <button onClick={() => { setEditingSection(sec.id); setEditTeacher(sec.class_teacher_id||''); }}
                          style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:6, border:'1px solid #DBEAFE', background:'#EFF6FF', color:'#1D4ED8', cursor:'pointer', flexShrink:0 }}>
                          {sec.teacher_name ? 'Change' : 'Assign'}
                        </button>
                      </div>
                    )}

                    {/* Delete section */}
                    <div style={{ display:'flex', justifyContent:'flex-end' }}>
                      <button onClick={() => handleDeleteSection(sec.id)} style={{ fontSize:12, fontWeight:600, padding:'5px 12px', borderRadius:8, border:'1px solid #FEE2E2', background:'#FEF2F2', color:'#DC2626', cursor:'pointer' }}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Class Modal */}
      {showAddClass && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:420, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', overflow:'hidden' }}>
            <div style={{ padding:'24px 28px 18px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Add Class</h3>
                <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Create a new class (e.g. "Class 6", "Grade 10")</p>
              </div>
              <button onClick={() => setShowAddClass(false)} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
            <div style={{ padding:'20px 28px' }}>
              {classError && <div style={{ marginBottom:14, padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{classError}</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <label style={LS}>Class Name <span style={{color:'#EF4444'}}>*</span></label>
                  <input value={classForm.name} onChange={e => setClassForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Class 6 or Grade 10" style={IS} autoFocus
                    onKeyDown={e => e.key==='Enter' && handleAddClass()}/>
                </div>
                <div>
                  <label style={LS}>Display Order</label>
                  <input type="number" value={classForm.numeric_order} onChange={e => setClassForm(f=>({...f,numeric_order:e.target.value}))} placeholder="e.g. 6 (for sorting)" style={IS}/>
                  <p style={{ fontSize:11, color:'#94A3B8', marginTop:5 }}>Used to sort classes in the correct order</p>
                </div>
              </div>
            </div>
            <div style={{ padding:'0 28px 24px', display:'flex', gap:10 }}>
              <button onClick={() => setShowAddClass(false)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleAddClass} disabled={saving} style={{ flex:1, padding:11, borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                {saving ? 'Creating...' : 'Create Class'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Section Modal */}
      {showAddSection && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:420, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', overflow:'hidden' }}>
            <div style={{ padding:'24px 28px 18px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Add Section</h3>
                <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Add a section to <strong>{classes.find(c=>c.id===showAddSection)?.name}</strong></p>
              </div>
              <button onClick={() => setShowAddSection(null)} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
            <div style={{ padding:'20px 28px' }}>
              {sectionError && <div style={{ marginBottom:14, padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{sectionError}</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <label style={LS}>Section Name <span style={{color:'#EF4444'}}>*</span></label>
                  <input value={sectionForm.name} onChange={e => setSectionForm(f=>({...f,name:e.target.value}))} placeholder="e.g. A or B or Rose" style={IS} autoFocus
                    onKeyDown={e => e.key==='Enter' && showAddSection && handleAddSection(showAddSection)}/>
                </div>
                <div>
                  <label style={LS}>Class Teacher (optional)</label>
                  <select value={sectionForm.class_teacher_id} onChange={e => setSectionForm(f=>({...f,class_teacher_id:e.target.value}))} style={IS}>
                    <option value="">Assign later</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ padding:'0 28px 24px', display:'flex', gap:10 }}>
              <button onClick={() => setShowAddSection(null)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={() => showAddSection && handleAddSection(showAddSection)} disabled={saving} style={{ flex:1, padding:11, borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                {saving ? 'Creating...' : 'Add Section'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
