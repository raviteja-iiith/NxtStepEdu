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
  const [editForm, setEditForm] = useState({ full_name:'', date_of_birth:'', gender:'', blood_group:'', admission_number:'', pen_number:'', roll_number:'', address:'', class_id:'', section_id:'', reason:'' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ full_name:'', date_of_birth:'', gender:'', blood_group:'', class_id:'', section_id:'', roll_number:'', address:'', admission_number:'', admission_date:new Date().toISOString().split('T')[0], addParent:false, parentName:'', parentPhone:'', parentRel:'father' });

  const [showInactive, setShowInactive] = useState(false);

  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkData, setBulkData] = useState<any[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkSuccess, setBulkSuccess] = useState('');
  const [parentCredentials, setParentCredentials] = useState<{name:string;phone:string;pin:string}|null>(null);
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    const userId=(await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: cu } = await supabase.from('users').select('school_id').eq('id',userId).single();
    if (!cu?.school_id) { setLoading(false); return; }
    let q=supabase.from('students').select('*,classes(name),sections(name)').eq('school_id',cu.school_id).order('full_name');
    if (!showInactive) {
      q = q.eq('is_active',true);
    }
    if (filterClass) q=q.eq('class_id',filterClass);
    if (filterSection) q=q.eq('section_id',filterSection);
    const { data } = await q;
    if (data) setStudents(data.map((s:any)=>({...s,class_name:s.classes?.name,section_name:s.sections?.name})) as Student[]);
    setLoading(false);
  }, [supabase, filterClass, filterSection, showInactive]);

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

  const filteredSections = form.class_id
    ? sections.filter(s => s.class_id === form.class_id)
    : [...new Map(sections.map(s => [s.name, s])).values()];
  const filterSections2 = filterClass
    ? sections.filter(s => s.class_id === filterClass)
    : [];
  const editFilteredSections = editForm.class_id
    ? sections.filter(s => s.class_id === editForm.class_id)
    : [...new Map(sections.map(s => [s.name, s])).values()];

  const handleAdd = async () => {
    if (!form.full_name||!form.date_of_birth||!form.gender||!form.class_id||!form.section_id) { setFormError('Name, DOB, gender, class & section required'); return; }
    if (form.addParent && form.parentPhone && form.parentPhone.replace(/\D/g,'').length !== 10) { setFormError('Parent phone must be exactly 10 digits.'); return; }
    if (form.addParent && !form.parentName.trim()) { setFormError('Parent name is required when adding parent details.'); return; }
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
    const studentId = ins[0].id;

    // ── Optional parent creation ──────────────────────────────────────────────
    if (form.addParent && form.parentName.trim() && form.parentPhone) {
      const phone = form.parentPhone.replace(/\D/g,'');
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      try {
        const res = await fetch('/api/auth/create-user', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email:`${phone}@parent.schoolerp.local`, password:pin, role:'parent', full_name:form.parentName.trim(), phone, username:phone, school_id:schoolId, profile_data:{} }),
        });
        const result = await res.json();
        if (res.ok && result.userId) {
          await supabase.from('student_parent_links').insert({ student_id:studentId, parent_id:result.userId, relationship:form.parentRel, is_primary_contact:true });
          setParentCredentials({ name:form.parentName.trim(), phone, pin });
        } else {
          setFormError(`Student admitted, but parent account failed: ${result.error||'Unknown error'}`);
        }
      } catch { setFormError('Student admitted, but parent account network error.'); }
    }

    setShowAdd(false);
    setForm({ full_name:'', date_of_birth:'', gender:'', blood_group:'', class_id:'', section_id:'', roll_number:'', address:'', admission_number:'', admission_date:new Date().toISOString().split('T')[0], addParent:false, parentName:'', parentPhone:'', parentRel:'father' });
    fetchStudents(); setSaving(false);
  };

  const toggleActive=async(id:string,current:boolean)=>{ await supabase.from('students').update({is_active:!current}).eq('id',id); fetchStudents(); };

  const openEdit=(s:Student)=>{
    setShowEdit(s);
    setEditForm({
      full_name: s.full_name,
      date_of_birth: s.date_of_birth||'',
      gender: s.gender||'',
      blood_group: s.blood_group||'',
      admission_number: s.admission_number||'',
      pen_number: (s as any).pen_number||'',
      roll_number: s.roll_number!=null ? String(s.roll_number) : '',
      address: (s as any).address||'',
      class_id: s.class_id,
      section_id: s.section_id,
      reason:''
    });
    setEditError(''); setEditSuccess('');
  };

  const handleEdit=async()=>{
    if (!showEdit) return;
    if (!editForm.full_name.trim()) { setEditError('Name cannot be empty.'); return; }
    if (!editForm.gender) { setEditError('Gender is required.'); return; }
    const classChanged=editForm.class_id!==showEdit.class_id||editForm.section_id!==showEdit.section_id;
    if (classChanged && !editForm.reason.trim()) { setEditError('Please provide a reason for the class/section change.'); return; }
    setEditSaving(true); setEditError('');
    const updates: Record<string,any> = {
      full_name: editForm.full_name.trim(),
      date_of_birth: editForm.date_of_birth||null,
      gender: editForm.gender||null,
      blood_group: editForm.blood_group||null,
      admission_number: editForm.admission_number||null,
      pen_number: editForm.pen_number||null,
      roll_number: editForm.roll_number ? parseInt(editForm.roll_number) : null,
      address: editForm.address||null,
    };
    if (classChanged) { updates.class_id=editForm.class_id; updates.section_id=editForm.section_id; }
    const { error } = await supabase.from('students').update(updates).eq('id', showEdit.id);
    if (error) { setEditError(`Save failed: ${error.message}`); setEditSaving(false); return; }
    setEditSuccess('Student record updated successfully!');
    setEditSaving(false);
    fetchStudents();
    setTimeout(()=>{ setShowEdit(null); }, 1200);
  };

  const handleDownloadTemplate = () => {
    const header = [['Full Name', 'Date of Birth (DD/MM/YYYY)', 'Gender (male/female/other)', 'Class Name', 'Section Name', 'Roll Number']];
    const sample = [['Rahul Kumar', '15/06/2012', 'male', '6', 'A', 1], ['Priya Sharma', '22/03/2013', 'female', '7', 'B', 2]];
    const ws = XLSX.utils.aoa_to_sheet([...header, ...sample]);
    ws['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'Student_Import_Template.xlsx');
  };

  // ── Bulk import: re-validate a single row after inline edit ──────────────
  const validateRow = (row: any): any => {
    let error = '';
    const cn = (row.class_name||'').trim();
    const sn = (row.section_name||'').trim();
    const foundClass = classes.find(c => c.name.toLowerCase() === cn.toLowerCase());
    const foundSection = foundClass ? sections.find(s => s.class_id===foundClass.id && s.name.toLowerCase()===sn.toLowerCase()) : null;
    if (!(row.full_name||'').trim()) error='Missing Full Name';
    else if (!row.date_of_birth) error='Missing Date of Birth';
    else if (!['male','female','other'].includes((row.gender||'').toLowerCase())) error=`Invalid gender: '${row.gender}'`;
    else if (!cn) error='Missing Class Name';
    else if (!sn) error='Missing Section Name';
    else if (!foundClass) error=`Class '${cn}' not found`;
    else if (!foundSection) error=`Section '${sn}' not found in ${cn}`;
    return { ...row, class_id:foundClass?.id||'', section_id:foundSection?.id||'', error };
  };

  const handleBulkEdit = (idx: number, field: string, value: string) => {
    setBulkData(prev => { const u=[...prev]; u[idx]=validateRow({...u[idx],[field]:value}); return u; });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkError(''); setBulkSuccess('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        // Support both old single-sheet files and new master template (Sheet 1 = Students)
        const wsName = wb.SheetNames.find(n => n.toLowerCase().includes('student')) ?? wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        const parsed = data.map((row: any, index: number) => {
          let error = '';

          // Helper to find column regardless of line breaks or exact spaces
          const getVal = (keywords: string[]) => {
            const key = Object.keys(row).find(k => keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
            return key ? row[key] : undefined;
          };

          const name = String(getVal(['full name']) ?? '').trim();

          let dob = getVal(['date of birth', 'dob']);
          if (typeof dob === 'number') {
            dob = new Date(Math.round((dob - 25569) * 86400 * 1000)).toISOString().split('T')[0];
          } else {
            dob = String(dob ?? '').trim();
            const parts = dob.split('/');
            if (parts.length === 3) dob = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
          }

          const gender = String(getVal(['gender']) ?? '').trim().toLowerCase();
          const className = String(getVal(['class name']) ?? '').trim();
          const sectionName = String(getVal(['section name']) ?? '').trim();
          
          const rawRoll = getVal(['roll number', 'roll no']);
          const rollNumber = rawRoll ? parseInt(String(rawRoll)) : null;

          // Validate
          if (!name) error = 'Missing Full Name';
          else if (!dob) error = 'Missing Date of Birth';
          else if (!['male','female','other'].includes(gender)) error = `Invalid gender: '${gender}'`;
          else if (!className) error = 'Missing Class Name';
          else if (!sectionName) error = 'Missing Section Name';

          const foundClass = classes.find(c => c.name.toLowerCase() === className.toLowerCase());
          const foundSection = foundClass
            ? sections.find(s => s.class_id === foundClass.id && s.name.toLowerCase() === sectionName.toLowerCase())
            : null;

          if (!error && !foundClass) error = `Class '${className}' not found in system`;
          else if (!error && !foundSection) error = `Section '${sectionName}' not found in ${className}`;

          return {
            rowNum: index + 2,
            full_name: name,
            date_of_birth: dob,
            gender,
            class_id: foundClass?.id || '',
            section_id: foundSection?.id || '',
            class_name: className,
            section_name: sectionName,
            roll_number: rollNumber,
            error,
          };
        });
        setBulkData(parsed);
      } catch { setBulkError('Failed to parse file. Ensure it matches the master template.'); }
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
        admission_number: `STU-${year}-${String(currentCount).padStart(4,'0')}`,
        roll_number: r.roll_number ?? null,
        admission_date: new Date().toISOString().split('T')[0],
        academic_year_id: yr?.id || null,
        school_id: schoolId,
        is_active: true,
      };
    });

    const { error } = await supabase.from('students').insert(insertData);
    if (error) { setBulkError(`Import failed: ${error.message}`); setBulkLoading(false); return; }
    
    setBulkSuccess(`Successfully imported ${validRows.length} students!`);
    fetchStudents();
    setBulkLoading(false);
    setTimeout(() => { setShowBulkImport(false); }, 2000);
  };

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
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom: 16 }}>
        <div style={{ position:'relative', flex:1, minWidth:220 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" placeholder="Search by name or admission number..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...IS, paddingLeft:36 }}/>
        </div>
        <select value={filterClass} onChange={e=>{setFilterClass(e.target.value);setFilterSection('');}} style={{ ...IS, width:'auto', minWidth:130 }}>
          <option value="">All Classes</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {filterClass && (
          <select value={filterSection} onChange={e=>setFilterSection(e.target.value)} style={{ ...IS, width:'auto', minWidth:130 }}>
            <option value="">All Sections</option>{filterSections2.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {(filterClass || filterSection) && (
          <button onClick={() => { setFilterClass(''); setFilterSection(''); }} style={{ padding:'7px 12px', borderRadius:10, border:'1px solid #FEE2E2', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:600, cursor:'pointer' }}>✕ Clear</button>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569', cursor: 'pointer', background: 'white', border: '1px solid #E2E8F0', padding: '0 14px', borderRadius: 10, fontWeight: 600 }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ cursor: 'pointer', accentColor: '#1E3A8A' }} />
          Show Removed Students
        </label>
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
          <div key={s.id} className="student-list-grid" style={{ padding:'14px 20px', borderBottom:idx<searched.length-1?'1px solid #F8FAFC':'none', alignItems:'center', opacity: s.is_active ? 1 : 0.6 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:s.is_active?'linear-gradient(135deg, #1E3A8A, #60A5FA)':'#CBD5E1', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, flexShrink:0 }}>
                {s.full_name.charAt(0).toUpperCase()}
              </div>
              <p style={{ fontWeight:700, fontSize:13, color:s.is_active?'#0F172A':'#64748B', margin:0, textDecoration:s.is_active?'none':'line-through' }}>
                {s.full_name} {!s.is_active && <span style={{ fontSize: 10, background: '#FEE2E2', color: '#DC2626', padding: '2px 6px', borderRadius: 4, marginLeft: 6, textDecoration: 'none' }}>Removed</span>}
              </p>
            </div>
            <code style={{ fontSize:11, padding:'3px 8px', background:'#F1F5F9', color:'#475569', borderRadius:6 }}>{s.admission_number||'—'}</code>
            <p style={{ fontSize:13, color:'#475569', margin:0 }}>{s.class_name} – {s.section_name}</p>
            <p style={{ fontSize:13, color:'#475569', margin:0 }}>{s.roll_number??'—'}</p>
            <span style={{ fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:6, background:s.gender?genderColors[s.gender]:'#F1F5F9', color:'#334155', textTransform:'capitalize' }}>{s.gender||'—'}</span>
            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              {s.is_active && <button onClick={()=>router.push(`/principal/students/${s.id}/analysis`)} style={{ fontSize:12, fontWeight:700, padding:'6px 12px', borderRadius:8, border:'1px solid #DDD6FE', background:'linear-gradient(135deg,#F5F3FF,#EDE9FE)', color:'#7C3AED', cursor:'pointer' }}>📊 Analysis</button>}
              <button onClick={()=>openEdit(s)} style={{ fontSize:12, fontWeight:700, padding:'6px 12px', borderRadius:8, border:'1px solid #D1FAE5', background:'linear-gradient(135deg,#ECFDF5,#D1FAE5)', color:'#065F46', cursor:'pointer' }}>✏️ Edit</button>
              <button onClick={()=>setShowProfile(s)} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #DBEAFE', background:'#EFF6FF', color:'#1D4ED8', cursor:'pointer' }}>View</button>
              <button onClick={()=>toggleActive(s.id,s.is_active)} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #FEE2E2', background:'#FEF2F2', color:'#DC2626', cursor:'pointer' }}>{s.is_active ? 'Remove' : 'Restore'}</button>
              {!s.is_active && (
                <button onClick={async () => {
                  if (confirm('Permanently delete this student from the database? This cannot be undone.')) {
                    const { error } = await supabase.from('students').delete().eq('id', s.id);
                    if (error) alert(`Failed to delete: ${error.message}`);
                    fetchStudents();
                  }
                }} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #EF4444', background:'#DC2626', color:'white', cursor:'pointer' }}>
                  Delete DB
                </button>
              )}
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

                {/* ── Optional Parent Section ── */}
                <div style={{ borderTop:'1px solid #E2E8F0', paddingTop:14 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, fontWeight:700, color:'#1E3A8A' }}>
                    <input type="checkbox" checked={form.addParent} onChange={e=>setForm(f=>({...f,addParent:e.target.checked}))} style={{ accentColor:'#1E3A8A', cursor:'pointer', width:15, height:15 }}/>
                    👨‍👩‍👧 Add Parent Details (optional)
                  </label>
                  {form.addParent && (
                    <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:12 }}>
                      <div><label style={LS}>Parent Full Name <span style={{color:'#EF4444'}}>*</span></label><input value={form.parentName} onChange={e=>setForm(f=>({...f,parentName:e.target.value}))} placeholder="e.g. Ramakrishna Rao" style={IS}/></div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                        <div><label style={LS}>Phone (Login ID) <span style={{color:'#EF4444'}}>*</span></label><input value={form.parentPhone} onChange={e=>setForm(f=>({...f,parentPhone:e.target.value.replace(/\D/g,'').slice(0,10)}))} placeholder="10-digit number" maxLength={10} style={IS}/></div>
                        <div><label style={LS}>Relationship</label>
                          <select value={form.parentRel} onChange={e=>setForm(f=>({...f,parentRel:e.target.value}))} style={IS}>
                            <option value="father">Father</option><option value="mother">Mother</option><option value="guardian">Guardian</option><option value="other">Other</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ padding:'8px 12px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, fontSize:12, color:'#92400E' }}>💡 A 6-digit PIN will be auto-generated. Save it from the credentials screen that appears after admission.</div>
                    </div>
                  )}
                </div>
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
          <div style={{ ...modal, maxWidth:520 }}>
            <div style={{ padding:'22px 26px 16px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div>
                <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>✏️ Edit Student</h3>
                <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Update any student detail below</p>
              </div>
              <button onClick={()=>setShowEdit(null)} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E2E8F0', background:'white', cursor:'pointer', color:'#64748B', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            <div style={{ padding:'20px 26px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:14 }}>
              {editError && <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:9, fontSize:13, color:'#DC2626' }}>{editError}</div>}
              {editSuccess && <div style={{ padding:'10px 14px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:9, fontSize:13, color:'#065F46', fontWeight:600 }}>✅ {editSuccess}</div>}

              {/* Basic Info */}
              <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 16px' }}>
                <p style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 12px' }}>📝 Basic Information</p>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div>
                    <label style={LS}>Full Name <span style={{color:'#EF4444'}}>*</span></label>
                    <input value={editForm.full_name} onChange={e=>setEditForm(f=>({...f,full_name:e.target.value}))} style={IS} placeholder="Student full name"/>
                    {editForm.full_name.trim()!==showEdit.full_name && <p style={{ fontSize:11, color:'#F59E0B', marginTop:4, fontWeight:600 }}>⚠ Was: "{showEdit.full_name}"</p>}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <div>
                      <label style={LS}>Date of Birth</label>
                      <input type="date" value={editForm.date_of_birth} onChange={e=>setEditForm(f=>({...f,date_of_birth:e.target.value}))} style={IS}/>
                    </div>
                    <div>
                      <label style={LS}>Gender <span style={{color:'#EF4444'}}>*</span></label>
                      <select value={editForm.gender} onChange={e=>setEditForm(f=>({...f,gender:e.target.value}))} style={IS}>
                        <option value="">Select...</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={LS}>Blood Group</label>
                    <select value={editForm.blood_group} onChange={e=>setEditForm(f=>({...f,blood_group:e.target.value}))} style={IS}>
                      <option value="">Select...</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg=><option key={bg} value={bg}>{bg}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Academic Info */}
              <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 16px' }}>
                <p style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 12px' }}>📋 Academic Details</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div><label style={LS}>Admission No.</label><input value={editForm.admission_number} onChange={e=>setEditForm(f=>({...f,admission_number:e.target.value}))} style={IS} placeholder="e.g. STU-2024-001"/></div>
                  <div><label style={LS}>Roll Number</label><input type="number" value={editForm.roll_number} onChange={e=>setEditForm(f=>({...f,roll_number:e.target.value}))} style={IS}/></div>
                  <div><label style={LS}>PEN Number</label><input value={editForm.pen_number} onChange={e=>setEditForm(f=>({...f,pen_number:e.target.value}))} style={IS}/></div>
                </div>
                <div style={{ marginTop:10 }}>
                  <label style={LS}>Address</label>
                  <textarea value={editForm.address} onChange={e=>setEditForm(f=>({...f,address:e.target.value}))} rows={2} style={{ ...IS, resize:'none' }}/>
                </div>
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
                <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:0 }}>📥 Bulk Import Students</h3>
                <p style={{ fontSize:12, color:'#94A3B8', marginTop:3 }}>Upload the master template (Sheet 1 – Students) to admit multiple students at once</p>
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
                  <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:8 }}>
                    Preview — {bulkData.filter(r=>!r.error).length} valid, {bulkData.filter(r=>r.error).length} invalid (of {bulkData.length} rows)
                  </p>
                  <div style={{ border:'1px solid #E2E8F0', borderRadius:8, overflow:'hidden', overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
                      <thead style={{ background:'#1E3A8A' }}>
                        <tr>
                          {['Row','Full Name *','Date of Birth *','Gender *','Class Name *','Section Name *','Roll No','Status'].map(h=>(
                            <th key={h} style={{ padding:'8px 12px', fontSize:11, fontWeight:700, color:'white', textAlign:'left', borderBottom:'1px solid #2563EB', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkData.map((r, i) => {
                          const cellIS: React.CSSProperties = { width:'100%', padding:'4px 6px', border:'1px solid #E2E8F0', borderRadius:6, fontSize:11, outline:'none', background:'transparent', fontFamily:'inherit', boxSizing:'border-box' };
                          const errCellIS: React.CSSProperties = { ...cellIS, borderColor:'#FCA5A5', background:'#FFF1F2' };
                          const rowSections = sections.filter(s => s.class_id === (classes.find(c=>c.name.toLowerCase()===r.class_name?.toLowerCase())?.id||''));
                          return (
                          <tr key={i} style={{ borderBottom:'1px solid #F1F5F9', background:r.error?'#FEF2F2':i%2===0?'#F8FAFC':'white' }}>
                            <td style={{ padding:'6px 10px', fontSize:11, color:'#94A3B8', textAlign:'center' }}>{r.rowNum}</td>
                            <td style={{ padding:'4px 6px', minWidth:140 }}><input value={r.full_name||''} onChange={e=>handleBulkEdit(i,'full_name',e.target.value)} style={r.error&&!r.full_name?errCellIS:cellIS}/></td>
                            <td style={{ padding:'4px 6px', minWidth:120 }}><input type="date" value={r.date_of_birth||''} onChange={e=>handleBulkEdit(i,'date_of_birth',e.target.value)} style={r.error&&!r.date_of_birth?errCellIS:cellIS}/></td>
                            <td style={{ padding:'4px 6px', minWidth:90 }}>
                              <select value={r.gender||''} onChange={e=>handleBulkEdit(i,'gender',e.target.value)} style={cellIS}>
                                <option value="">--</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                              </select>
                            </td>
                            <td style={{ padding:'4px 6px', minWidth:80 }}>
                              <select value={r.class_name||''} onChange={e=>handleBulkEdit(i,'class_name',e.target.value)} style={cellIS}>
                                <option value="">--</option>{classes.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
                              </select>
                            </td>
                            <td style={{ padding:'4px 6px', minWidth:80 }}>
                              <select value={r.section_name||''} onChange={e=>handleBulkEdit(i,'section_name',e.target.value)} style={cellIS}>
                                <option value="">--</option>{rowSections.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                              </select>
                            </td>
                            <td style={{ padding:'4px 6px', minWidth:70 }}><input type="number" value={r.roll_number??''} onChange={e=>handleBulkEdit(i,'roll_number',e.target.value)} style={cellIS}/></td>
                            <td style={{ padding:'6px 10px', fontSize:11, whiteSpace:'nowrap' }}>
                              {r.error ? <span style={{ color:'#DC2626', fontWeight:600 }}>{r.error}</span> : <span style={{ color:'#059669', fontWeight:700 }}>✓ Valid</span>}
                            </td>
                          </tr>);
                        })}
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

      {/* ── Parent Credentials Modal ─────────────────────────────────────────── */}
      {parentCredentials && (
        <div style={overlay}>
          <div style={{ width:'100%', maxWidth:400, background:'white', borderRadius:18, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', padding:'32px 28px', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:14, background:'#F0FDF4', border:'2px solid #BBF7D0', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:24 }}>✅</div>
            <h3 style={{ fontSize:17, fontWeight:800, color:'#0F172A', margin:'0 0 6px' }}>Student & Parent Added!</h3>
            <p style={{ fontSize:13, color:'#64748B', margin:'0 0 20px' }}>Parent account created. Share these login credentials with the parent:</p>
            <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:12, padding:'18px 20px', textAlign:'left', marginBottom:20, display:'flex', flexDirection:'column', gap:12 }}>
              <div><p style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', margin:0 }}>Parent Name</p><p style={{ fontSize:15, fontWeight:700, color:'#0F172A', margin:'4px 0 0' }}>{parentCredentials.name}</p></div>
              <div><p style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', margin:0 }}>Phone / Login ID</p><p style={{ fontSize:16, fontWeight:700, color:'#1E3A8A', margin:'4px 0 0', fontFamily:'monospace', letterSpacing:1 }}>{parentCredentials.phone}</p></div>
              <div><p style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', margin:0 }}>Generated PIN</p><p style={{ fontSize:26, fontWeight:800, color:'#7C3AED', margin:'4px 0 0', fontFamily:'monospace', letterSpacing:6 }}>{parentCredentials.pin}</p></div>
            </div>
            <p style={{ fontSize:11, color:'#94A3B8', marginBottom:20 }}>⚠ Parent must change PIN on first login. Save these credentials now.</p>
            <button onClick={()=>setParentCredentials(null)} style={{ width:'100%', padding:12, borderRadius:10, border:'none', background:'linear-gradient(135deg,#1E3A8A,#3B82F6)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>Got it — Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
