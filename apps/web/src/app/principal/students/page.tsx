'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';
interface Student { id:string; full_name:string; admission_number:string|null; date_of_birth:string|null; gender:string|null; blood_group:string|null; roll_number:number|null; is_active:boolean; admission_date:string|null; class_name?:string; section_name?:string; class_id:string; section_id:string; }
interface ClassItem { id:string; name:string; }
interface SectionItem { id:string; name:string; class_id:string; }

const IS: React.CSSProperties = { width:'100%', padding:'10px 14px', border:'1px solid #E2E8F0', borderRadius:10, fontSize:13, outline:'none', background:'white', boxSizing:'border-box', fontFamily:'inherit' };
const LS: React.CSSProperties = { display:'block', fontSize:12, fontWeight:600, color:'#475569', marginBottom:5 };
const overlay: React.CSSProperties = { position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)' };
const modal: React.CSSProperties = { width:'100%', maxWidth:500, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column', maxHeight:'90vh' };

export default function StudentsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showProfile, setShowProfile] = useState<Student|null>(null);
  const [showEdit, setShowEdit] = useState<Student|null>(null);
  const [editForm, setEditForm] = useState({ full_name:'', class_id:'', section_id:'', reason:'' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ full_name:'', date_of_birth:'', gender:'', blood_group:'', class_id:'', section_id:'', roll_number:'', address:'', admission_number:'', admission_date:new Date().toISOString().split('T')[0] });

  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkData, setBulkData] = useState<any[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkSuccess, setBulkSuccess] = useState('');
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    const userId=(await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: cu } = await supabase.from('users').select('school_id').eq('id',userId).single();
    if (!cu?.school_id) { setLoading(false); return; }
    let q=supabase.from('students').select('*,classes(name),sections(name)').eq('school_id',cu.school_id).eq('is_active',true).order('full_name');
    if (filterClass) q=q.eq('class_id',filterClass);
    if (filterSection) q=q.eq('section_id',filterSection);
    const { data } = await q;
    if (data) setStudents(data.map((s:any)=>({...s,class_name:s.classes?.name,section_name:s.sections?.name})) as Student[]);
    setLoading(false);
  }, [supabase, filterClass, filterSection]);

  const fetchStructure = useCallback(async () => {
    const userId=(await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    const { data: ur } = await supabase.from('users').select('school_id').eq('id',userId).single();
    if (!ur?.school_id) return;
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current',true).eq('school_id',ur.school_id).maybeSingle();
    if (yr) {
      const { data: c } = await supabase.from('classes').select('id,name').eq('academic_year_id',yr.id).order('numeric_order');
      if (c) setClasses(c);
      const { data: s } = await supabase.from('sections').select('id,name,class_id').eq('academic_year_id',yr.id);
      if (s) setSections(s);
    } else {
      const { data: c } = await supabase.from('classes').select('id,name').eq('school_id',ur.school_id).order('numeric_order');
      if (c) setClasses(c);
      const { data: s } = await supabase.from('sections').select('id,name,class_id').eq('school_id',ur.school_id);
      if (s) setSections(s);
    }
  }, [supabase]);

  useEffect(() => { fetchStructure(); }, [fetchStructure]);
  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const filteredSections=sections.filter(s=>!form.class_id||s.class_id===form.class_id);
  const filterSections2=sections.filter(s=>!filterClass||s.class_id===filterClass);

  const handleAdd = async () => {
    if (!form.full_name||!form.date_of_birth||!form.gender||!form.class_id||!form.section_id) { setFormError('Name, DOB, gender, class & section required'); return; }
    setSaving(true); setFormError('');
    const userId=(await supabase.auth.getUser()).data.user?.id||'';
    const { data: ur } = await supabase.from('users').select('school_id').eq('id',userId).single();
    const schoolId=ur?.school_id;
    if (!schoolId) { setFormError('Could not determine school. Please refresh.'); setSaving(false); return; }
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current',true).eq('school_id',schoolId).maybeSingle();
    const year=new Date().getFullYear();
    const { count: sc } = await supabase.from('students').select('*',{count:'exact',head:true}).eq('school_id',schoolId);
    const admNum=form.admission_number||`STU-${year}-${String((sc||0)+1).padStart(4,'0')}`;
    const { data: ins, error } = await supabase.from('students').insert({ full_name:form.full_name, date_of_birth:form.date_of_birth, gender:form.gender, blood_group:form.blood_group||null, class_id:form.class_id, section_id:form.section_id, roll_number:form.roll_number?parseInt(form.roll_number):null, address:form.address||null, admission_number:admNum, admission_date:form.admission_date, academic_year_id:yr?.id||null, school_id:schoolId, is_active:true }).select();
    if (error) { setFormError(`Error: ${error.message}`); setSaving(false); return; }
    if (!ins||ins.length===0) { setFormError('Could not save. Permissions issue.'); setSaving(false); return; }
    setShowAdd(false);
    setForm({ full_name:'', date_of_birth:'', gender:'', blood_group:'', class_id:'', section_id:'', roll_number:'', address:'', admission_number:'', admission_date:new Date().toISOString().split('T')[0] });
    fetchStudents(); setSaving(false);
  };

  const toggleActive=async(id:string,current:boolean)=>{ await supabase.from('students').update({is_active:!current}).eq('id',id); fetchStudents(); };

  const openEdit=(s:Student)=>{ setShowEdit(s); setEditForm({ full_name:s.full_name, class_id:s.class_id, section_id:s.section_id, reason:'' }); setEditError(''); setEditSuccess(''); };

  const handleEdit=async()=>{
    if (!showEdit) return;
    if (!editForm.full_name.trim()) { setEditError('Name cannot be empty.'); return; }
    const classChanged=editForm.class_id!==showEdit.class_id||editForm.section_id!==showEdit.section_id;
    if (classChanged && !editForm.reason.trim()) { setEditError('Please provide a reason for the class/section change.'); return; }
    setEditSaving(true); setEditError('');
    const updates: Record<string,any> = { full_name: editForm.full_name.trim() };
    if (classChanged) { updates.class_id=editForm.class_id; updates.section_id=editForm.section_id; }
    const { error } = await supabase.from('students').update(updates).eq('id', showEdit.id);
    if (error) { setEditError(`Save failed: ${error.message}`); setEditSaving(false); return; }
    setEditSuccess('Student record updated successfully!');
    setEditSaving(false);
    fetchStudents();
    setTimeout(()=>{ setShowEdit(null); }, 1200);
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { "Full Name": "John Doe", "Date of Birth (YYYY-MM-DD)": "2010-05-15", "Gender (male/female/other)": "male", "Class Name": "Class 1", "Section Name": "A", "Admission No": "STU-1001", "Roll Number": "1", "Address": "123 School Lane" }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Student_Import_Template.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkError('');
    setBulkSuccess('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const parsed = data.map((row:any, index) => {
          let error = '';
          const name = row['Full Name'] || '';
          let dob = row['Date of Birth (YYYY-MM-DD)'] || '';
          
          // Handle excel date format parsing if it comes as number
          if (typeof dob === 'number') {
            const date = new Date(Math.round((dob - 25569) * 86400 * 1000));
            dob = date.toISOString().split('T')[0];
          } else if (typeof dob === 'string') {
            const parts = dob.split('/');
            if (parts.length === 3) {
              dob = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
          
          const gender = String(row['Gender (male/female/other)'] || '').toLowerCase();
          const className = String(row['Class Name'] || '').trim();
          const sectionName = String(row['Section Name'] || '').trim();
          
          if (!name || !dob || !gender || !className || !sectionName) error = 'Missing required fields';
          if (gender !== 'male' && gender !== 'female' && gender !== 'other') error = 'Invalid gender';
          
          const foundClass = classes.find(c => c.name.toLowerCase() === className.toLowerCase());
          const foundSection = foundClass ? sections.find(s => s.class_id === foundClass.id && s.name.toLowerCase() === sectionName.toLowerCase()) : null;
          
          if (!foundClass && !error) error = `Class '${className}' not found`;
          else if (!foundSection && !error) error = `Section '${sectionName}' not found in ${className}`;
          
          return {
            rowNum: index + 2,
            full_name: name,
            date_of_birth: dob,
            gender: gender,
            class_id: foundClass?.id || '',
            section_id: foundSection?.id || '',
            class_name: className,
            section_name: sectionName,
            admission_number: row['Admission No'] ? String(row['Admission No']) : null,
            roll_number: row['Roll Number'] ? parseInt(row['Roll Number']) : null,
            address: row['Address'] || null,
            error
          };
        });
        setBulkData(parsed);
      } catch (err) {
        setBulkError('Failed to parse Excel file. Please ensure it matches the template.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleBulkImport = async () => {
    const validRows = bulkData.filter(r => !r.error);
    if (validRows.length === 0) { setBulkError('No valid rows to import'); return; }
    setBulkLoading(true); setBulkError(''); setBulkSuccess('');
    
    const userId=(await supabase.auth.getUser()).data.user?.id||'';
    const { data: ur } = await supabase.from('users').select('school_id').eq('id',userId).single();
    const schoolId=ur?.school_id;
    if (!schoolId) { setBulkError('Could not determine school.'); setBulkLoading(false); return; }
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current',true).eq('school_id',schoolId).maybeSingle();
    
    const year=new Date().getFullYear();
    const { count: sc } = await supabase.from('students').select('*',{count:'exact',head:true}).eq('school_id',schoolId);
    let currentCount = sc || 0;

    const insertData = validRows.map(r => {
      currentCount++;
      return {
        full_name: r.full_name,
        date_of_birth: r.date_of_birth,
        gender: r.gender,
        class_id: r.class_id,
        section_id: r.section_id,
        admission_number: r.admission_number || `STU-${year}-${String(currentCount).padStart(4,'0')}`,
        roll_number: r.roll_number,
        address: r.address,
        academic_year_id: yr?.id||null,
        school_id: schoolId,
        is_active: true,
        admission_date: new Date().toISOString().split('T')[0]
      };
    });

    const { error } = await supabase.from('students').insert(insertData);
    if (error) { setBulkError(`Import failed: ${error.message}`); setBulkLoading(false); return; }
    
    setBulkSuccess(`Successfully imported ${validRows.length} students!`);
    fetchStudents();
    setBulkLoading(false);
    setTimeout(() => { setShowBulkImport(false); }, 2000);
  };

  const editFilteredSections=sections.filter(s=>!editForm.class_id||s.class_id===editForm.class_id);
  const searched=students.filter(s=>s.full_name.toLowerCase().includes(search.toLowerCase())||(s.admission_number||'').toLowerCase().includes(search.toLowerCase()));
  const genderColors: Record<string,string> = { male:'#EFF6FF', female:'#FDF2F8', other:'#F5F3FF' };

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Student Management</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Admissions, profiles, and academic tracking</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>{setShowBulkImport(true);setBulkData([]);setBulkError('');setBulkSuccess('');}} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'white', color:'#1E3A8A', border:'1px solid #1E3A8A', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
            <span style={{fontSize:16}}>⬇</span> Bulk Import
          </button>
          <button onClick={()=>{setShowAdd(true);setFormError('');}} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(59,130,246,0.3)', whiteSpace:'nowrap' }}>
            <span style={{fontSize:16}}>+</span> Admit Student
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="three-col-stats">
        {[{ label:'Total Students', value:students.length, color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' },
          { label:'Boys', value:students.filter(s=>s.gender==='male').length, color:'#0F766E', bg:'#F0FDF4', border:'#CCFBF1' },
          { label:'Girls', value:students.filter(s=>s.gender==='female').length, color:'#BE185D', bg:'#FDF2F8', border:'#FBCFE8' }
        ].map((s,i)=>(
          <div key={i} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:'16px 20px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{s.label}</p>
            <p style={{ fontSize:28, fontWeight:800, color:'#0F172A', margin:'6px 0 0' }}>
              {loading?<span style={{ display:'inline-block', width:32, height:28, background:'rgba(0,0,0,0.08)', borderRadius:6 }}/>:s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:220 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" placeholder="Search by name or admission number..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...IS, paddingLeft:36 }}/>
        </div>
        <select value={filterClass} onChange={e=>{setFilterClass(e.target.value);setFilterSection('');}} style={{ ...IS, width:'auto', minWidth:130 }}>
          <option value="">All Classes</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterSection} onChange={e=>setFilterSection(e.target.value)} style={{ ...IS, width:'auto', minWidth:130 }}>
          <option value="">All Sections</option>{filterSections2.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="list-table-container">
        <div className="student-list-grid header-row" style={{ padding:'12px 20px', background:'#F8FAFC', borderBottom:'1px solid #F1F5F9' }}>
          {['Student','Admission No.','Class','Roll No.','Gender','Actions'].map((h,i)=>(
            <p key={h} style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0, textAlign:i===5?'right':'left' }}>{h}</p>
          ))}
        </div>
        {loading ? (
          <div style={{ padding:24, display:'flex', flexDirection:'column', gap:12 }}>
            {[1,2,3].map(i=><div key={i} style={{ height:52, background:'#F8FAFC', borderRadius:8 }}/>)}
          </div>
        ) : searched.length===0 ? (
          <div style={{ padding:'60px 24px', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:14, background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:22 }}>👨‍🎓</div>
            <p style={{ fontWeight:700, color:'#1E293B', fontSize:15, margin:0 }}>No students found</p>
            <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Click <strong>+ Admit Student</strong> to enroll the first student</p>
          </div>
        ) : searched.map((s,idx)=>(
          <div key={s.id} className="student-list-grid" style={{ padding:'14px 20px', borderBottom:idx<searched.length-1?'1px solid #F8FAFC':'none', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg, #1E3A8A, #60A5FA)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, flexShrink:0 }}>
                {s.full_name.charAt(0).toUpperCase()}
              </div>
              <p style={{ fontWeight:700, fontSize:13, color:'#0F172A', margin:0 }}>{s.full_name}</p>
            </div>
            <code style={{ fontSize:11, padding:'3px 8px', background:'#F1F5F9', color:'#475569', borderRadius:6 }}>{s.admission_number||'—'}</code>
            <p style={{ fontSize:13, color:'#475569', margin:0 }}>{s.class_name} – {s.section_name}</p>
            <p style={{ fontSize:13, color:'#475569', margin:0 }}>{s.roll_number??'—'}</p>
            <span style={{ fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:6, background:s.gender?genderColors[s.gender]:'#F1F5F9', color:'#334155', textTransform:'capitalize' }}>{s.gender||'—'}</span>
            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              <button onClick={()=>router.push(`/principal/students/${s.id}/analysis`)} style={{ fontSize:12, fontWeight:700, padding:'6px 12px', borderRadius:8, border:'1px solid #DDD6FE', background:'linear-gradient(135deg,#F5F3FF,#EDE9FE)', color:'#7C3AED', cursor:'pointer' }}>📊 Analysis</button>
              <button onClick={()=>openEdit(s)} style={{ fontSize:12, fontWeight:700, padding:'6px 12px', borderRadius:8, border:'1px solid #D1FAE5', background:'linear-gradient(135deg,#ECFDF5,#D1FAE5)', color:'#065F46', cursor:'pointer' }}>✏️ Edit</button>
              <button onClick={()=>setShowProfile(s)} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #DBEAFE', background:'#EFF6FF', color:'#1D4ED8', cursor:'pointer' }}>View</button>
              <button onClick={()=>toggleActive(s.id,s.is_active)} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #FEE2E2', background:'#FEF2F2', color:'#DC2626', cursor:'pointer' }}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Student Modal */}
      {showAdd && (
        <div style={overlay}>
          <div style={modal}>
            <div style={{ padding:'24px 28px 18px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div><h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Admit New Student</h3><p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Fill in student details below</p></div>
              <button onClick={()=>setShowAdd(false)} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
            <div style={{ padding:'20px 28px', overflowY:'auto', flex:1 }}>
              {formError && <div style={{ marginBottom:14, padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{formError}</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div><label style={LS}>Full Name <span style={{color:'#EF4444'}}>*</span></label><input value={form.full_name} onChange={e=>setForm(f=>({...f,full_name:e.target.value}))} style={IS}/></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div><label style={LS}>Date of Birth <span style={{color:'#EF4444'}}>*</span></label><input type="date" value={form.date_of_birth} onChange={e=>setForm(f=>({...f,date_of_birth:e.target.value}))} style={IS}/></div>
                  <div><label style={LS}>Gender <span style={{color:'#EF4444'}}>*</span></label>
                    <select value={form.gender} onChange={e=>setForm(f=>({...f,gender:e.target.value}))} style={IS}><option value="">Select...</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div><label style={LS}>Class <span style={{color:'#EF4444'}}>*</span></label>
                    <select value={form.class_id} onChange={e=>setForm(f=>({...f,class_id:e.target.value,section_id:''}))} style={IS}><option value="">Select...</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  </div>
                  <div><label style={LS}>Section <span style={{color:'#EF4444'}}>*</span></label>
                    <select value={form.section_id} onChange={e=>setForm(f=>({...f,section_id:e.target.value}))} style={IS}><option value="">Select...</option>{filteredSections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div><label style={LS}>Admission No.</label><input placeholder="Auto-generated" value={form.admission_number} onChange={e=>setForm(f=>({...f,admission_number:e.target.value}))} style={IS}/></div>
                  <div><label style={LS}>Roll Number</label><input type="number" value={form.roll_number} onChange={e=>setForm(f=>({...f,roll_number:e.target.value}))} style={IS}/></div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div><label style={LS}>Blood Group</label>
                    <select value={form.blood_group} onChange={e=>setForm(f=>({...f,blood_group:e.target.value}))} style={IS}><option value="">Select...</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg=><option key={bg} value={bg}>{bg}</option>)}</select>
                  </div>
                  <div><label style={LS}>Admission Date</label><input type="date" value={form.admission_date} onChange={e=>setForm(f=>({...f,admission_date:e.target.value}))} style={IS}/></div>
                </div>
                <div><label style={LS}>Address</label><textarea value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} rows={2} style={{ ...IS, resize:'none' }}/></div>
              </div>
            </div>
            <div style={{ padding:'16px 28px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, flexShrink:0 }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleAdd} disabled={saving} style={{ flex:1, padding:11, borderRadius:10, border:'none', background:saving?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                {saving?'Admitting...':'Admit Student'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:420, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', overflow:'hidden' }}>
            <div style={{ padding:'24px 28px', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', textAlign:'center' }}>
              <div style={{ width:56, height:56, borderRadius:16, background:'rgba(255,255,255,0.15)', border:'2px solid rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontSize:24, color:'white' }}>
                {showProfile.full_name.charAt(0)}
              </div>
              <h4 style={{ fontSize:17, fontWeight:800, color:'white', margin:0 }}>{showProfile.full_name}</h4>
              <p style={{ fontSize:12, color:'rgba(191,219,254,0.9)', marginTop:4 }}>{showProfile.class_name} – {showProfile.section_name}</p>
            </div>
            <div style={{ padding:'20px 28px' }}>
              {[['Admission No.', showProfile.admission_number],['Roll Number',showProfile.roll_number],['Date of Birth',showProfile.date_of_birth?new Date(showProfile.date_of_birth).toLocaleDateString('en-IN'):null],['Gender',showProfile.gender],['Blood Group',showProfile.blood_group],['Admission Date',showProfile.admission_date?new Date(showProfile.admission_date).toLocaleDateString('en-IN'):null]].map(([label,value],i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:i<5?'1px solid #F1F5F9':'none' }}>
                  <span style={{ fontSize:13, color:'#64748B' }}>{label}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:'#0F172A', textTransform:'capitalize' }}>{String(value??'—')}</span>
                </div>
              ))}
            </div>
            <div style={{ padding:'0 28px 24px' }}>
              <button onClick={()=>setShowProfile(null)} style={{ width:'100%', padding:12, borderRadius:10, border:'none', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {showEdit && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth:480 }}>
            <div style={{ padding:'22px 26px 16px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div>
                <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>✏️ Edit Student</h3>
                <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Correct name or transfer class/section</p>
              </div>
              <button onClick={()=>setShowEdit(null)} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            <div style={{ padding:'20px 26px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:16 }}>
              {editError && <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{editError}</div>}
              {editSuccess && <div style={{ padding:'10px 14px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:9, fontSize:13, color:'#065F46', fontWeight:600 }}>✅ {editSuccess}</div>}

              {/* Name Correction */}
              <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 16px' }}>
                <p style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 10px' }}>📝 Name Correction</p>
                <div>
                  <label style={LS}>Full Name <span style={{color:'#EF4444'}}>*</span></label>
                  <input value={editForm.full_name} onChange={e=>setEditForm(f=>({...f,full_name:e.target.value}))} style={IS} placeholder="Corrected full name"/>
                </div>
                {editForm.full_name.trim()!==showEdit.full_name && (
                  <p style={{ fontSize:11, color:'#F59E0B', marginTop:6, fontWeight:600 }}>⚠ Was: "{showEdit.full_name}"</p>
                )}
              </div>

              {/* Class / Section Transfer */}
              <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 16px' }}>
                <p style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 10px' }}>🔁 Class / Section Transfer</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  <div>
                    <label style={LS}>Class <span style={{color:'#EF4444'}}>*</span></label>
                    <select value={editForm.class_id} onChange={e=>setEditForm(f=>({...f,class_id:e.target.value,section_id:''}))} style={IS}>
                      <option value="">Select...</option>
                      {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={LS}>Section <span style={{color:'#EF4444'}}>*</span></label>
                    <select value={editForm.section_id} onChange={e=>setEditForm(f=>({...f,section_id:e.target.value}))} style={IS}>
                      <option value="">Select...</option>
                      {editFilteredSections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                {(editForm.class_id!==showEdit.class_id||editForm.section_id!==showEdit.section_id) ? (
                  <div>
                    <div style={{ padding:'8px 12px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, marginBottom:10 }}>
                      <p style={{ fontSize:12, color:'#92400E', margin:0, fontWeight:600 }}>⚠ Transfer detected — was: {showEdit.class_name} – {showEdit.section_name}</p>
                    </div>
                    <div>
                      <label style={LS}>Reason for Transfer <span style={{color:'#EF4444'}}>*</span></label>
                      <textarea value={editForm.reason} onChange={e=>setEditForm(f=>({...f,reason:e.target.value}))} rows={2} placeholder="e.g. Parent requested section change, performance-based promotion..." style={{ ...IS, resize:'none' }}/>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize:12, color:'#94A3B8', margin:0 }}>Currently in <strong style={{color:'#0F172A'}}>{showEdit.class_name} – {showEdit.section_name}</strong>. Change above to trigger transfer.</p>
                )}
              </div>
            </div>

            <div style={{ padding:'14px 26px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, flexShrink:0 }}>
              <button onClick={()=>setShowEdit(null)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleEdit} disabled={editSaving} style={{ flex:1, padding:11, borderRadius:10, border:'none', background:editSaving?'#6EE7B7':'linear-gradient(135deg,#065F46,#059669)', color:'white', fontSize:13, fontWeight:700, cursor:editSaving?'not-allowed':'pointer' }}>
                {editSaving?'Saving...':'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth:800, maxHeight:'95vh' }}>
            <div style={{ padding:'24px 28px 18px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div>
                <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>Bulk Import Students</h3>
                <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Upload an Excel file to admit multiple students at once</p>
              </div>
              <button onClick={()=>setShowBulkImport(false)} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
            
            <div style={{ padding:'20px 28px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:16 }}>
              {bulkError && <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{bulkError}</div>}
              {bulkSuccess && <div style={{ padding:'10px 14px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:9, fontSize:13, color:'#065F46', fontWeight:600 }}>✅ {bulkSuccess}</div>}
              
              <div style={{ display:'flex', gap:16, alignItems:'center', padding:'16px', background:'#F8FAFC', borderRadius:12, border:'1px dashed #CBD5E1' }}>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:14, fontWeight:700, color:'#0F172A', margin:'0 0 4px' }}>1. Download Template</p>
                  <p style={{ fontSize:12, color:'#64748B', margin:0 }}>Use our exact Excel format. Do not change column headers.</p>
                </div>
                <button onClick={handleDownloadTemplate} style={{ padding:'8px 16px', background:'white', border:'1px solid #CBD5E1', borderRadius:8, fontSize:13, fontWeight:600, color:'#334155', cursor:'pointer' }}>Download .xlsx</button>
              </div>

              <div style={{ display:'flex', gap:16, alignItems:'center', padding:'16px', background:'#EFF6FF', borderRadius:12, border:'1px dashed #93C5FD' }}>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:14, fontWeight:700, color:'#1D4ED8', margin:'0 0 4px' }}>2. Upload Data File</p>
                  <p style={{ fontSize:12, color:'#3B82F6', margin:0 }}>Select the completed .xlsx file to preview data.</p>
                </div>
                <label style={{ padding:'8px 16px', background:'#1D4ED8', border:'none', borderRadius:8, fontSize:13, fontWeight:600, color:'white', cursor:'pointer' }}>
                  Select File
                  <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} style={{ display:'none' }} />
                </label>
              </div>

              {bulkData.length > 0 && (
                <div style={{ marginTop:8 }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:8 }}>Preview Data ({bulkData.length} rows)</p>
                  <div style={{ border:'1px solid #E2E8F0', borderRadius:8, overflow:'hidden', overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
                      <thead style={{ background:'#F8FAFC' }}>
                        <tr>
                          <th style={{ padding:'8px 12px', fontSize:11, fontWeight:700, color:'#64748B', textAlign:'left', borderBottom:'1px solid #E2E8F0' }}>Row</th>
                          <th style={{ padding:'8px 12px', fontSize:11, fontWeight:700, color:'#64748B', textAlign:'left', borderBottom:'1px solid #E2E8F0' }}>Name</th>
                          <th style={{ padding:'8px 12px', fontSize:11, fontWeight:700, color:'#64748B', textAlign:'left', borderBottom:'1px solid #E2E8F0' }}>Class/Sec</th>
                          <th style={{ padding:'8px 12px', fontSize:11, fontWeight:700, color:'#64748B', textAlign:'left', borderBottom:'1px solid #E2E8F0' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkData.map((r, i) => (
                          <tr key={i} style={{ borderBottom:i<bulkData.length-1?'1px solid #F1F5F9':'none', background:r.error?'#FEF2F2':'white' }}>
                            <td style={{ padding:'8px 12px', fontSize:12, color:'#475569' }}>{r.rowNum}</td>
                            <td style={{ padding:'8px 12px', fontSize:12, color:'#0F172A', fontWeight:500 }}>{r.full_name}</td>
                            <td style={{ padding:'8px 12px', fontSize:12, color:'#475569' }}>{r.class_name} - {r.section_name}</td>
                            <td style={{ padding:'8px 12px', fontSize:12 }}>
                              {r.error ? <span style={{ color:'#DC2626', fontWeight:600 }}>{r.error}</span> : <span style={{ color:'#059669', fontWeight:600 }}>Valid</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize:12, color:'#64748B', marginTop:8 }}>
                    {bulkData.filter(r=>!r.error).length} valid rows ready to import. {bulkData.filter(r=>r.error).length} rows have errors and will be skipped.
                  </p>
                </div>
              )}
            </div>

            <div style={{ padding:'16px 28px', borderTop:'1px solid #F1F5F9', display:'flex', gap:10, flexShrink:0 }}>
              <button onClick={()=>setShowBulkImport(false)} style={{ flex:1, padding:11, borderRadius:10, border:'1px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, color:'#475569', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleBulkImport} disabled={bulkLoading || bulkData.length===0 || bulkData.filter(r=>!r.error).length===0} style={{ flex:1, padding:11, borderRadius:10, border:'none', background:bulkLoading||bulkData.filter(r=>!r.error).length===0?'#93C5FD':'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:bulkLoading||bulkData.filter(r=>!r.error).length===0?'not-allowed':'pointer' }}>
                {bulkLoading?'Importing...':`Import ${bulkData.filter(r=>!r.error).length} Students`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
