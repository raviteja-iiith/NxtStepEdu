'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ClassItem  { id:string; name:string; }
interface SectionItem{ id:string; name:string; class_id:string; }
interface ExamRow    { id:string; name:string; exam_date:string; exam_type:string; total_marks:number; subject_id:string; subject_name:string; class_id:string; section_id:string|null; }
interface Student    { id:string; full_name:string; roll_number:number|null; }
interface MarkEntry  { student_id:string; exam_id:string; marks_obtained:number|null; is_absent:boolean; }
interface SmsLogEntry{ exam_name:string; sent_at:string; sms_username:string; status:string; }
interface ProgressEv { type:'progress'|'done'|'error'; done?:number; total?:number; studentName?:string; status?:'sent'|'failed'|'skipped'; reason?:string; error?:string; sent?:number; failed?:number; skipped?:number; message?:string; }
type Tab   = 'results'|'absent'|'fees';
type Phase = 'idle'|'credentials'|'sending'|'done';

const IS:React.CSSProperties={width:'100%',padding:'10px 14px',border:'1px solid #E2E8F0',borderRadius:10,fontSize:13,outline:'none',background:'white',boxSizing:'border-box'};
const LS:React.CSSProperties={display:'block',fontSize:11,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5};

const DEFAULT_ABSENT_TPL=`Dear {PARENT_NAME},
Your ward {STUDENT_NAME} was marked absent on {DATE}.
Please ensure regular attendance.
- {SCHOOL_NAME}`;

const DEFAULT_FEE_TPL=`Dear {PARENT_NAME},
This is a reminder that {STUDENT_NAME} has a pending fee of {AMOUNT_DUE} due by {DUE_DATE}.
Please clear the dues at the earliest.
- {SCHOOL_NAME}`;

function groupByExam(rows:ExamRow[]){
  const map=new Map<string,ExamRow[]>();
  for(const r of rows){const k=`${r.name}§${r.exam_date}§${r.class_id}`;if(!map.has(k))map.set(k,[]);map.get(k)!.push(r);}
  return Array.from(map.values());
}

function TokenChips({tokens,onInsert}:{tokens:string[];onInsert:(t:string)=>void}){
  return(
    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
      {tokens.map(t=>(
        <button key={t} onClick={()=>onInsert(`{${t}}`)}
          style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:99,border:'1px solid #BFDBFE',background:'#EFF6FF',color:'#1D4ED8',cursor:'pointer'}}>
          {`{${t}}`}
        </button>
      ))}
    </div>
  );
}

export default function SmsPage(){
  const supabase=createClient();
  const [tab,setTab]=useState<Tab>('results');
  const [classes,setClasses]=useState<ClassItem[]>([]);
  const [sections,setSections]=useState<SectionItem[]>([]);
  const [schoolId,setSchoolId]=useState('');
  const [initLoad,setInitLoad]=useState(true);

  // ── Shared send modal state ───────────────────────────────────────────────
  const [phase,setPhase]=useState<Phase>('idle');
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [showPwd,setShowPwd]=useState(false);
  const [credError,setCredError]=useState('');
  const [progressDone,setProgressDone]=useState(0);
  const [progressTotal,setProgressTotal]=useState(0);
  const [currentStudent,setCurrentStudent]=useState('');
  const [progressRows,setProgressRows]=useState<{name:string;status:string;reason?:string;error?:string}[]>([]);
  const [finalSent,setFinalSent]=useState(0);
  const [finalFailed,setFinalFailed]=useState(0);
  const [finalSkipped,setFinalSkipped]=useState(0);
  const [sseError,setSseError]=useState('');
  const [showErrLog,setShowErrLog]=useState(false);
  const abortRef=useRef<AbortController|null>(null);

  // ── Tab 1: Exam Results state ─────────────────────────────────────────────
  const [allExams,setAllExams]=useState<ExamRow[]>([]);
  const [students,setStudents]=useState<Student[]>([]);
  const [marks,setMarks]=useState<MarkEntry[]>([]);
  const [recentLog,setRecentLog]=useState<SmsLogEntry|null>(null);
  const [selClass,setSelClass]=useState('');
  const [selSection,setSelSection]=useState('');
  const [selGroup,setSelGroup]=useState('');

  // ── Tab 2: Absent state ───────────────────────────────────────────────────
  const [abClass,setAbClass]=useState('');
  const [abSection,setAbSection]=useState('');
  const [abDate,setAbDate]=useState(()=>new Date().toISOString().slice(0,10));
  const [abCount,setAbCount]=useState<number|null>(null);
  const [abChecking,setAbChecking]=useState(false);
  const [abTemplate,setAbTemplate]=useState(DEFAULT_ABSENT_TPL);

  // ── Tab 3: Fee state ──────────────────────────────────────────────────────
  const [feeClass,setFeeClass]=useState('');
  const [feeSection,setFeeSection]=useState('');
  const [feeDueBefore,setFeeDueBefore]=useState('');
  const [feeCount,setFeeCount]=useState<number|null>(null);
  const [feeChecking,setFeeChecking]=useState(false);
  const [feeTemplate,setFeeTemplate]=useState(DEFAULT_FEE_TPL);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    (async()=>{
      const uid=(await supabase.auth.getUser()).data.user?.id;
      if(!uid){setInitLoad(false);return;}
      const {data:u}=await supabase.from('users').select('school_id').eq('id',uid).single();
      if(!u?.school_id){setInitLoad(false);return;}
      setSchoolId(u.school_id);
      const {data:yr}=await supabase.from('academic_years').select('id').eq('is_current',true).eq('school_id',u.school_id).maybeSingle();
      const yid=yr?.id;
      const [{data:c},{data:sec}]=await Promise.all([
        yid?supabase.from('classes').select('id,name').eq('academic_year_id',yid).order('numeric_order'):supabase.from('classes').select('id,name').eq('school_id',u.school_id).order('numeric_order'),
        yid?supabase.from('sections').select('id,name,class_id').eq('academic_year_id',yid):supabase.from('sections').select('id,name,class_id').eq('school_id',u.school_id),
      ]);
      if(c)setClasses(c);
      if(sec)setSections(sec);
      setInitLoad(false);
    })();
  },[supabase]);

  // ── Load exams (Tab 1) ────────────────────────────────────────────────────
  useEffect(()=>{
    if(!selClass||!schoolId){setAllExams([]);setSelGroup('');return;}
    (async()=>{
      const {data}=await supabase.from('exams')
        .select('id,name,exam_date,exam_type,total_marks,subject_id,class_id,section_id,subjects(name)')
        .eq('school_id',schoolId).eq('class_id',selClass).order('exam_date',{ascending:false});
      setAllExams((data??[]).map((e:any)=>({...e,subject_name:e.subjects?.name??'Unknown'})));
      setSelGroup('');
    })();
  },[supabase,selClass,schoolId]);

  // ── Load students+marks (Tab 1) ───────────────────────────────────────────
  const activeGroup=useMemo(()=>groupByExam(allExams).find(g=>`${g[0].name}§${g[0].exam_date}§${g[0].class_id}`===selGroup)??null,[allExams,selGroup]);

  useEffect(()=>{
    if(!activeGroup){setStudents([]);setMarks([]);setRecentLog(null);return;}
    (async()=>{
      let q=supabase.from('students').select('id,full_name,roll_number').eq('is_active',true).eq('class_id',activeGroup[0].class_id);
      if(selSection)q=q.eq('section_id',selSection);
      const {data:sts}=await q.order('roll_number');
      setStudents(sts??[]);
      const {data:mks}=await supabase.from('marks').select('student_id,exam_id,marks_obtained,is_absent').in('exam_id',activeGroup.map(e=>e.id));
      setMarks(mks??[]);
      const {data:log}=await supabase.from('sms_logs').select('exam_name,sent_at,sms_username,status').eq('school_id',schoolId).eq('exam_name',activeGroup[0].name).eq('class_id',activeGroup[0].class_id).order('sent_at',{ascending:false}).limit(1).maybeSingle();
      setRecentLog(log??null);
    })();
  },[supabase,activeGroup,selSection,schoolId]);

  // ── Check absent count (Tab 2) ────────────────────────────────────────────
  useEffect(()=>{
    if(!abClass||!abDate||!schoolId){setAbCount(null);return;}
    setAbChecking(true);
    (async()=>{
      let q=supabase.from('attendance').select('student_id',{count:'exact',head:true}).eq('school_id',schoolId).eq('date',abDate).eq('status','absent');
      if(abSection)q=q.eq('section_id',abSection);
      // filter by class via students join — use a subquery approach: get section_ids of class
      const classSections=sections.filter(s=>s.class_id===abClass).map(s=>s.id);
      if(classSections.length>0&&!abSection)q=q.in('section_id',classSections);
      const {count}=await q;
      setAbCount(count??0);
      setAbChecking(false);
    })();
  },[supabase,abClass,abSection,abDate,schoolId,sections]);

  // ── Check fee count (Tab 3) ───────────────────────────────────────────────
  useEffect(()=>{
    if(!feeClass||!schoolId){setFeeCount(null);return;}
    setFeeChecking(true);
    (async()=>{
      const classSections=sections.filter(s=>s.class_id===feeClass).map(s=>s.id);
      let studentQ=supabase.from('students').select('id',{count:'exact',head:false}).eq('school_id',schoolId).eq('is_active',true).eq('class_id',feeClass);
      if(feeSection)studentQ=studentQ.eq('section_id',feeSection);
      const {data:stds}=await studentQ;
      if(!stds||stds.length===0){setFeeCount(0);setFeeChecking(false);return;}
      const sids=stds.map((s:any)=>s.id);
      let feesQ=supabase.from('fees').select('student_id',{count:'exact',head:false}).eq('school_id',schoolId).in('student_id',sids).in('status',['pending','overdue','partially_paid']);
      if(feeDueBefore)feesQ=feesQ.lte('due_date',feeDueBefore);
      const {data:feeRows}=await feesQ;
      const unique=new Set((feeRows??[]).map((f:any)=>f.student_id));
      setFeeCount(unique.size);
      setFeeChecking(false);
    })();
  },[supabase,feeClass,feeSection,feeDueBefore,schoolId,sections]);

  // ── Send handler (original proven pattern — inline fetch) ─────────────────
  const handleSend = async () => {
    if (!username.trim() || !password.trim()) {
      setCredError('Please enter both username and password.');
      return;
    }

    // Build request body based on active tab
    let endpoint = '';
    let body: object = {};
    let totalCount = 0;

    if (tab === 'results') {
      if (!activeGroup) return;
      endpoint = '/api/sms/send-results';
      body = {
        smsUsername: username.trim(),
        smsPassword: password.trim(),
        examName:    activeGroup[0].name,
        examDate:    activeGroup[0].exam_date,
        examIds:     activeGroup.map(e => e.id),
        classId:     activeGroup[0].class_id,
        sectionId:   selSection || null,
      };
      totalCount = students.length;
    } else if (tab === 'absent') {
      if (!abClass || !abDate) return;
      endpoint = '/api/sms/send-absent-alert';
      body = {
        smsUsername: username.trim(),
        smsPassword: password.trim(),
        date:        abDate,
        classId:     abClass,
        sectionId:   abSection || null,
        template:    abTemplate,
      };
      totalCount = abCount ?? 0;
    } else if (tab === 'fees') {
      if (!feeClass) return;
      endpoint = '/api/sms/send-fee-reminder';
      body = {
        smsUsername:   username.trim(),
        smsPassword:   password.trim(),
        classId:       feeClass,
        sectionId:     feeSection || null,
        template:      feeTemplate,
        dueBeforeDate: feeDueBefore || null,
      };
      totalCount = feeCount ?? 0;
    } else {
      return;
    }

    setCredError('');
    setPhase('sending');
    setProgressDone(0);
    setProgressTotal(totalCount);
    setCurrentStudent('');
    setProgressRows([]);
    setSseError('');
    setFinalSent(0);
    setFinalFailed(0);
    setFinalSkipped(0);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setSseError(err.error ?? 'Unknown error');
        setPhase('done');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev: ProgressEv = JSON.parse(line.slice(6));
            if (ev.type === 'progress') {
              setProgressDone(ev.done ?? 0);
              setCurrentStudent(ev.studentName ?? '');
              setProgressRows(prev => [...prev, {
                name:   ev.studentName ?? '',
                status: ev.status ?? '',
                reason: ev.reason,
                error:  ev.error ?? undefined,
              }]);
            }
            if (ev.type === 'error') { setSseError(ev.message ?? 'An error occurred'); setPhase('done'); return; }
            if (ev.type === 'done')  { setFinalSent(ev.sent ?? 0); setFinalFailed(ev.failed ?? 0); setFinalSkipped(ev.skipped ?? 0); setProgressDone(ev.total ?? 0); setPhase('done'); }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') { setSseError(err?.message ?? 'Connection lost'); setPhase('done'); }
    }
  };


  const closeModal=()=>{setPhase('idle');setUsername('');setPassword('');setShowPwd(false);setCredError('');setSseError('');setProgressRows([]);setShowErrLog(false);};
  const openCreds=()=>{setPhase('credentials');setCredError('');};

  const groups=groupByExam(allExams);
  const filtSecs=(cls:string)=>sections.filter(s=>s.class_id===cls);

  // Exam completion stats
  const stats=useMemo(()=>{
    if(!activeGroup||students.length===0)return null;
    const examIds=activeGroup.map(e=>e.id);
    let entered=0;const total=students.length*examIds.length;
    for(const s of students)for(const eid of examIds){const m=marks.find(x=>x.student_id===s.id&&x.exam_id===eid);if(m&&(m.marks_obtained!==null||m.is_absent))entered++;}
    const pct=total>0?Math.round((entered/total)*100):0;
    const perSubject=activeGroup.map(ex=>{const e=students.filter(s=>{const m=marks.find(x=>x.student_id===s.id&&x.exam_id===ex.id);return m&&(m.marks_obtained!==null||m.is_absent);}).length;return{subjectName:ex.subject_name,entered:e,total:students.length};});
    return{pct,entered,total,perSubject};
  },[activeGroup,students,marks]);

  if(initLoad)return(<div className="dashboard-container"><div style={{display:'flex',flexDirection:'column',gap:12}}>{[1,2,3].map(i=><div key={i} style={{height:48,background:'#F1F5F9',borderRadius:10}}/>)}</div></div>);

  // ── Modal send count label ────────────────────────────────────────────────
  const modalSendCount=tab==='results'?students.length:tab==='absent'?(abCount??0):(feeCount??0);
  const modalLabel=tab==='results'?`${activeGroup?.[0]?.name} results`:tab==='absent'?`Absent Alert — ${abDate}`:'Fee Reminders';

  return(
    <div className="dashboard-container">
      {/* Header */}
      <div>
        <h2 style={{fontSize:22,fontWeight:800,color:'#0F172A',letterSpacing:'-0.02em',margin:0}}>📱 SMS Notifications</h2>
        <p style={{fontSize:13,color:'#94A3B8',marginTop:4}}>Send personalised SMS to parents — exam results, absent alerts, and fee reminders</p>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,padding:4,background:'#F1F5F9',borderRadius:12,width:'fit-content'}}>
        {([['results','📊 Exam Results'],['absent','📋 Absent Alerts'],['fees','💰 Fee Reminders']] as [Tab,string][]).map(([t,label])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:'9px 18px',borderRadius:9,border:'none',fontSize:13,fontWeight:tab===t?700:500,cursor:'pointer',background:tab===t?'white':'transparent',color:tab===t?'#1E3A8A':'#64748B',boxShadow:tab===t?'0 1px 4px rgba(0,0,0,0.08)':'none',transition:'all 0.15s'}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: EXAM RESULTS ─────────────────────────────────────────────────── */}
      {tab==='results'&&(
        <>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 2fr',gap:12}}>
            <div><label style={LS}>Class *</label>
              <select value={selClass} onChange={e=>{setSelClass(e.target.value);setSelSection('');setSelGroup('');}} style={IS}>
                <option value="">Select class...</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label style={LS}>Section</label>
              <select value={selSection} onChange={e=>setSelSection(e.target.value)} disabled={!selClass} style={{...IS,opacity:selClass?1:0.5}}>
                <option value="">All sections</option>{filtSecs(selClass).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label style={LS}>Exam Group *</label>
              <select value={selGroup} onChange={e=>setSelGroup(e.target.value)} disabled={!selClass||groups.length===0} style={{...IS,opacity:selClass?1:0.5}}>
                <option value="">Select exam...</option>
                {groups.map(g=>{const key=`${g[0].name}§${g[0].exam_date}§${g[0].class_id}`;const d=new Date(g[0].exam_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'});return<option key={key} value={key}>{g.length>1?`${g[0].name} · ${d} · ${g.length} subjects`:`${g[0].name} · ${g[0].subject_name} · ${d}`}</option>;})}
              </select></div>
          </div>

          {!activeGroup&&(<div style={{background:'white',borderRadius:16,border:'1px solid #E8ECF0',padding:'64px 24px',textAlign:'center'}}><p style={{fontSize:28,margin:'0 0 10px'}}>📱</p><p style={{fontWeight:700,color:'#1E293B',fontSize:16,margin:0}}>Select a Class & Exam Group</p><p style={{fontSize:13,color:'#94A3B8',marginTop:6}}>Pick an exam to send result SMS</p></div>)}

          {activeGroup&&(<>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              {activeGroup.map(e=>(<div key={e.id} style={{padding:'8px 14px',background:'white',border:'1px solid #DBEAFE',borderRadius:10}}><p style={{fontSize:12,fontWeight:700,color:'#1D4ED8',margin:0}}>{e.subject_name}</p><p style={{fontSize:11,color:'#64748B',margin:0}}>Max: {e.total_marks}</p></div>))}
              <div style={{padding:'8px 14px',background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10}}><p style={{fontSize:12,fontWeight:700,color:'#475569',margin:0}}>Grand Total</p><p style={{fontSize:13,fontWeight:800,color:'#0F172A',margin:0}}>{activeGroup.reduce((s,e)=>s+e.total_marks,0)} marks</p></div>
            </div>
            {stats&&(<div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:14,padding:'18px 20px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                <p style={{fontSize:13,fontWeight:700,color:'#0F172A',margin:0}}>📊 Marks Entry Completion</p>
                <span style={{fontSize:13,fontWeight:800,color:stats.pct===100?'#15803D':stats.pct>=60?'#D97706':'#DC2626',background:stats.pct===100?'#F0FDF4':stats.pct>=60?'#FFFBEB':'#FEF2F2',padding:'3px 10px',borderRadius:8}}>{stats.pct}%</span>
              </div>
              <div style={{height:8,background:'#E2E8F0',borderRadius:99,overflow:'hidden',marginBottom:10}}><div style={{height:'100%',borderRadius:99,width:`${stats.pct}%`,background:stats.pct===100?'linear-gradient(90deg,#15803D,#22C55E)':stats.pct>=60?'linear-gradient(90deg,#D97706,#FBBF24)':'linear-gradient(90deg,#DC2626,#EF4444)',transition:'width 0.4s'}}/></div>
              <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>{stats.perSubject.map(ps=>(<div key={ps.subjectName} style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:8,height:8,borderRadius:'50%',background:ps.entered===ps.total?'#22C55E':ps.entered>0?'#FBBF24':'#EF4444',flexShrink:0}}/><span style={{fontSize:12,color:'#475569'}}>{ps.subjectName}: <strong>{ps.entered}/{ps.total}</strong></span></div>))}</div>
            </div>)}
            {recentLog&&(<div style={{padding:'10px 16px',background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:10,display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:16}}>⚠️</span><p style={{fontSize:12,color:'#92400E',margin:0}}>SMS was previously sent for this exam on <strong>{new Date(recentLog.sent_at).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</strong> using username <strong>{recentLog.sms_username}</strong>.</p></div>)}
            <div style={{background:'linear-gradient(135deg,#F0FDF4,#DCFCE7)',border:'1px solid #86EFAC',borderRadius:14,padding:'20px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
              <div><p style={{fontSize:14,fontWeight:700,color:'#14532D',margin:0}}>Ready to notify parents</p><p style={{fontSize:12,color:'#166534',marginTop:4}}>{students.length} students · {activeGroup.length} subject{activeGroup.length!==1?'s':''} · {stats?.pct??0}% marks entered</p></div>
              <button onClick={openCreds} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 24px',background:'linear-gradient(135deg,#059669,#10B981)',color:'white',border:'none',borderRadius:12,fontSize:14,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 14px rgba(5,150,105,0.35)',whiteSpace:'nowrap'}}>📱 Send SMS to Parents</button>
            </div>
          </>)}
        </>
      )}

      {/* ── TAB 2: ABSENT ALERTS ────────────────────────────────────────────────── */}
      {tab==='absent'&&(
        <>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            <div><label style={LS}>Class *</label>
              <select value={abClass} onChange={e=>{setAbClass(e.target.value);setAbSection('');}} style={IS}>
                <option value="">Select class...</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label style={LS}>Section</label>
              <select value={abSection} onChange={e=>setAbSection(e.target.value)} disabled={!abClass} style={{...IS,opacity:abClass?1:0.5}}>
                <option value="">All sections</option>{filtSecs(abClass).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label style={LS}>Date *</label><input type="date" value={abDate} onChange={e=>setAbDate(e.target.value)} style={IS}/></div>
          </div>

          {abClass&&(<div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:14,padding:'16px 20px',display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:44,height:44,borderRadius:12,background:'#FEF2F2',border:'1px solid #FEE2E2',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>📋</div>
            <div>
              <p style={{fontSize:13,fontWeight:700,color:'#0F172A',margin:0}}>{abChecking?'Checking...':abCount===null?'Select class and date':abCount===0?'No absent students found':`${abCount} student${abCount!==1?'s':''} absent on ${new Date(abDate+' ').toLocaleDateString('en-IN',{day:'numeric',month:'long'})}`}</p>
              <p style={{fontSize:12,color:'#94A3B8',marginTop:2}}>Parents of these students will receive the SMS below</p>
            </div>
          </div>)}

          <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:14,padding:'18px 20px'}}>
            <p style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:8,marginTop:0}}>✏️ Message Template</p>
            <p style={{fontSize:11,color:'#94A3B8',marginBottom:8,marginTop:0}}>Click a token to insert it. These are replaced with real values per student.</p>
            <TokenChips tokens={['PARENT_NAME','STUDENT_NAME','DATE','SCHOOL_NAME']} onInsert={t=>{const ta=document.getElementById('ab-tpl') as HTMLTextAreaElement;if(!ta)return;const s=ta.selectionStart,e=ta.selectionEnd;setAbTemplate(v=>v.slice(0,s)+t+v.slice(e));setTimeout(()=>{ta.focus();ta.selectionStart=ta.selectionEnd=s+t.length;},0);}}/>
            <textarea id="ab-tpl" value={abTemplate} onChange={e=>setAbTemplate(e.target.value)} rows={5} style={{...IS,fontFamily:'monospace',fontSize:12,lineHeight:1.6,resize:'vertical'}}/>
            <button onClick={()=>setAbTemplate(DEFAULT_ABSENT_TPL)} style={{fontSize:11,color:'#94A3B8',background:'none',border:'none',cursor:'pointer',marginTop:4,padding:0}}>↺ Reset to default</button>
          </div>

          <div style={{background:'linear-gradient(135deg,#FEF2F2,#FEE2E2)',border:'1px solid #FCA5A5',borderRadius:14,padding:'20px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
            <div><p style={{fontSize:14,fontWeight:700,color:'#7F1D1D',margin:0}}>Send Absent Alert SMS</p><p style={{fontSize:12,color:'#991B1B',marginTop:4}}>{abCount??0} parents will be notified</p></div>
            <button onClick={openCreds} disabled={!abClass||!abDate||!abCount||abCount===0}
              style={{padding:'12px 24px',background:(!abClass||!abDate||!abCount||abCount===0)?'#FCA5A5':'linear-gradient(135deg,#DC2626,#EF4444)',color:'white',border:'none',borderRadius:12,fontSize:14,fontWeight:700,cursor:(!abClass||!abDate||!abCount||abCount===0)?'not-allowed':'pointer',whiteSpace:'nowrap'}}>
              📋 Send Absent Alert
            </button>
          </div>
        </>
      )}

      {/* ── TAB 3: FEE REMINDERS ─────────────────────────────────────────────── */}
      {tab==='fees'&&(
        <>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            <div><label style={LS}>Class *</label>
              <select value={feeClass} onChange={e=>{setFeeClass(e.target.value);setFeeSection('');}} style={IS}>
                <option value="">Select class...</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label style={LS}>Section</label>
              <select value={feeSection} onChange={e=>setFeeSection(e.target.value)} disabled={!feeClass} style={{...IS,opacity:feeClass?1:0.5}}>
                <option value="">All sections</option>{filtSecs(feeClass).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label style={LS}>Due Before (optional)</label><input type="date" value={feeDueBefore} onChange={e=>setFeeDueBefore(e.target.value)} style={IS}/></div>
          </div>
          {feeClass&&(<div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:14,padding:'16px 20px',display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:44,height:44,borderRadius:12,background:'#FFFBEB',border:'1px solid #FDE68A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>💰</div>
            <div>
              <p style={{fontSize:13,fontWeight:700,color:'#0F172A',margin:0}}>{feeChecking?'Checking...':feeCount===null?'Select a class':feeCount===0?'No students with pending fees found':`${feeCount} student${feeCount!==1?'s have':' has'} pending fees`}</p>
              <p style={{fontSize:12,color:'#94A3B8',marginTop:2}}>Each parent receives their child's individual due amount</p>
            </div>
          </div>)}
          <div style={{background:'white',border:'1px solid #E2E8F0',borderRadius:14,padding:'18px 20px'}}>
            <p style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:8,marginTop:0}}>✏️ Message Template</p>
            <p style={{fontSize:11,color:'#94A3B8',marginBottom:8,marginTop:0}}>Click a token to insert it. Amount and date are personalised per student.</p>
            <TokenChips tokens={['PARENT_NAME','STUDENT_NAME','AMOUNT_DUE','DUE_DATE','SCHOOL_NAME']} onInsert={t=>{const ta=document.getElementById('fee-tpl') as HTMLTextAreaElement;if(!ta)return;const s=ta.selectionStart,e=ta.selectionEnd;setFeeTemplate(v=>v.slice(0,s)+t+v.slice(e));setTimeout(()=>{ta.focus();ta.selectionStart=ta.selectionEnd=s+t.length;},0);}}/>
            <textarea id="fee-tpl" value={feeTemplate} onChange={e=>setFeeTemplate(e.target.value)} rows={5} style={{...IS,fontFamily:'monospace',fontSize:12,lineHeight:1.6,resize:'vertical'}}/>
            <button onClick={()=>setFeeTemplate(DEFAULT_FEE_TPL)} style={{fontSize:11,color:'#94A3B8',background:'none',border:'none',cursor:'pointer',marginTop:4,padding:0}}>Reset to default</button>
          </div>
          <div style={{background:'linear-gradient(135deg,#FFFBEB,#FEF9C3)',border:'1px solid #FDE68A',borderRadius:14,padding:'20px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
            <div><p style={{fontSize:14,fontWeight:700,color:'#78350F',margin:0}}>Send Fee Reminder SMS</p><p style={{fontSize:12,color:'#92400E',marginTop:4}}>{feeCount??0} parents will receive personalised due amount</p></div>
            <button onClick={openCreds} disabled={!feeClass||!feeCount||feeCount===0}
              style={{padding:'12px 24px',background:(!feeClass||!feeCount||feeCount===0)?'#FDE68A':'linear-gradient(135deg,#D97706,#F59E0B)',color:'white',border:'none',borderRadius:12,fontSize:14,fontWeight:700,cursor:(!feeClass||!feeCount||feeCount===0)?'not-allowed':'pointer',whiteSpace:'nowrap'}}>
              Send Fee Reminder
            </button>
          </div>
        </>
      )}

      {/* ── SHARED CREDENTIAL + PROGRESS MODAL ───────────────────────────────── */}
      {(phase==='credentials'||phase==='sending'||phase==='done')&&(
        <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(15,23,42,0.6)',backdropFilter:'blur(4px)'}}>
          <div style={{width:'100%',maxWidth:480,background:'white',borderRadius:20,boxShadow:'0 24px 64px rgba(0,0,0,0.22)',overflow:'hidden'}}>
            {phase==='credentials'&&(<>
              <div style={{padding:'24px 28px 16px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div><h3 style={{fontSize:17,fontWeight:800,color:'#0F172A',margin:0}}>SMS Gateway Credentials</h3><p style={{fontSize:12,color:'#94A3B8',marginTop:3}}>Enter your SMS Gate credentials to proceed</p></div>
                <button onClick={closeModal} style={{width:34,height:34,borderRadius:'50%',border:'1px solid #E2E8F0',background:'white',cursor:'pointer',color:'#64748B',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>X</button>
              </div>
              <div style={{padding:'20px 28px',display:'flex',flexDirection:'column',gap:14}}>
                <div style={{padding:'10px 14px',background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:10}}><p style={{fontSize:12,color:'#15803D',margin:0,fontWeight:600}}>Sending: <strong>{modalLabel}</strong> to <strong>{modalSendCount} recipient{modalSendCount!==1?'s':''}</strong></p></div>
                {credError&&<div style={{padding:'10px 14px',background:'#FEF2F2',border:'1px solid #FEE2E2',borderRadius:9,fontSize:13,color:'#DC2626'}}>{credError}</div>}
                <div><label style={LS}>SMS Gateway Username</label><input type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="e.g. FBNWSW" style={IS} autoFocus/></div>
                <div><label style={LS}>SMS Gateway Password</label>
                  <div style={{position:'relative'}}>
                    <input type={showPwd?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSend()} placeholder="*****" style={{...IS,paddingRight:44}}/>
                    <button type="button" onClick={()=>setShowPwd(p=>!p)} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:16,color:'#94A3B8'}}>{showPwd?'Hide':'Show'}</button>
                  </div>
                  <p style={{fontSize:11,color:'#94A3B8',marginTop:5}}>Credentials are used once and never stored.</p>
                </div>
              </div>
              <div style={{padding:'14px 28px',borderTop:'1px solid #F1F5F9',display:'flex',gap:10}}>
                <button onClick={closeModal} style={{flex:1,padding:12,borderRadius:10,border:'1px solid #E2E8F0',background:'white',fontSize:13,fontWeight:600,color:'#475569',cursor:'pointer'}}>Cancel</button>
                <button onClick={handleSend} disabled={!username.trim()||!password.trim()} style={{flex:2,padding:12,borderRadius:10,border:'none',background:(!username.trim()||!password.trim())?'#D1FAE5':'linear-gradient(135deg,#059669,#10B981)',color:'white',fontSize:13,fontWeight:700,cursor:(!username.trim()||!password.trim())?'not-allowed':'pointer'}}>
                  Send Now ({modalSendCount} SMS)
                </button>
              </div>
            </>)}
            {(phase==='sending'||phase==='done')&&(<>
              <div style={{padding:'24px 28px 16px',borderBottom:'1px solid #F1F5F9'}}>
                <h3 style={{fontSize:17,fontWeight:800,color:'#0F172A',margin:0}}>{phase==='sending'?'Sending SMS...':'SMS Sending Complete'}</h3>
                <p style={{fontSize:12,color:'#94A3B8',marginTop:3}}>{phase==='sending'?`Processing ${progressDone} of ${progressTotal}...`:`Finished: ${modalLabel}`}</p>
              </div>
              <div style={{padding:'20px 28px',display:'flex',flexDirection:'column',gap:16}}>
                {sseError&&<div style={{padding:'12px 16px',background:'#FEF2F2',border:'1px solid #FEE2E2',borderRadius:10,fontSize:13,color:'#DC2626',fontWeight:600}}>Error: {sseError}</div>}
                <div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <span style={{fontSize:12,color:'#475569',fontWeight:600}}>{phase==='sending'?`Sending to: ${currentStudent}`:'All done'}</span>
                    <span style={{fontSize:13,fontWeight:800,color:'#0F172A'}}>{progressDone}/{progressTotal}</span>
                  </div>
                  <div style={{height:10,background:'#E2E8F0',borderRadius:99,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:99,width:`${progressTotal>0?Math.round((progressDone/progressTotal)*100):0}%`,background:phase==='done'&&!sseError?'linear-gradient(90deg,#059669,#10B981)':'linear-gradient(90deg,#3B82F6,#06B6D4)',transition:'width 0.3s'}}/>
                  </div>
                </div>
                {phase==='done'&&!sseError&&(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                    {[{label:'Sent',value:finalSent,color:'#15803D',bg:'#F0FDF4',border:'#BBF7D0'},{label:'Failed',value:finalFailed,color:'#DC2626',bg:'#FEF2F2',border:'#FEE2E2'},{label:'Skipped',value:finalSkipped,color:'#D97706',bg:'#FFFBEB',border:'#FDE68A'}].map(card=>(
                      <div key={card.label} style={{background:card.bg,border:`1px solid ${card.border}`,borderRadius:10,padding:12,textAlign:'center'}}>
                        <p style={{fontSize:22,fontWeight:800,color:'#0F172A',margin:'4px 0 2px'}}>{card.value}</p>
                        <p style={{fontSize:11,fontWeight:700,color:card.color,textTransform:'uppercase',margin:0}}>{card.label}</p>
                      </div>
                    ))}
                  </div>
                )}
                {phase==='done'&&progressRows.some(r=>r.status!=='sent')&&(
                  <div>
                    <button onClick={()=>setShowErrLog(v=>!v)} style={{fontSize:12,fontWeight:700,color:'#64748B',background:'none',border:'none',cursor:'pointer',padding:0}}>{showErrLog?'Hide':'Show'} failed/skipped details</button>
                    {showErrLog&&(<div style={{marginTop:8,maxHeight:160,overflowY:'auto',display:'flex',flexDirection:'column',gap:4}}>
                      {progressRows.filter(r=>r.status!=='sent').map((r,i)=>(<div key={i} style={{padding:'6px 10px',background:r.status==='failed'?'#FEF2F2':'#FFFBEB',borderRadius:7,fontSize:12}}><span style={{fontWeight:600,color:r.status==='failed'?'#DC2626':'#D97706'}}>{r.name}</span> - {r.error??r.reason??r.status}</div>))}
                    </div>)}
                  </div>
                )}
                {finalSkipped>0&&phase==='done'&&<p style={{fontSize:11,color:'#94A3B8',margin:0}}>Skipped students have no phone number on their parent account.</p>}
              </div>
              <div style={{padding:'14px 28px',borderTop:'1px solid #F1F5F9'}}>
                <button onClick={closeModal} disabled={phase==='sending'} style={{width:'100%',padding:12,borderRadius:10,border:'none',background:phase==='sending'?'#E2E8F0':'linear-gradient(135deg,#0F172A,#1E293B)',color:phase==='sending'?'#94A3B8':'white',fontSize:13,fontWeight:700,cursor:phase==='sending'?'not-allowed':'pointer'}}>
                  {phase==='sending'?'Please wait...':'Close'}
                </button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
