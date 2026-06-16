'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface ExamItem {
  id: string; name: string; exam_type: string; exam_date: string;
  total_marks: number; passing_marks: number | null; is_published: boolean;
  class_id: string | null; section_id: string | null;
  subject_name?: string; class_name?: string;
}
interface Student { id: string; full_name: string; roll_number: number | null; }
interface MarkEntry { marks: string; absent: boolean; remarks: string; }

function getGrade(obtained: number, total: number) {
  const pct = (obtained / total) * 100;
  if (pct >= 90) return { letter: 'A+', color: '#065F46', bg: '#ECFDF5' };
  if (pct >= 75) return { letter: 'A',  color: '#166534', bg: '#F0FDF4' };
  if (pct >= 60) return { letter: 'B',  color: '#1D4ED8', bg: '#EFF6FF' };
  if (pct >= 45) return { letter: 'C',  color: '#D97706', bg: '#FFFBEB' };
  if (pct >= 35) return { letter: 'D',  color: '#EA580C', bg: '#FFF7ED' };
  return { letter: 'F', color: '#DC2626', bg: '#FEF2F2' };
}

export default function MarksPage() {
  const supabase = createClient();
  const router = useRouter();
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [marks, setMarks] = useState<Record<string, MarkEntry>>({});
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle'|'success'|'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchExams = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: assignments } = await supabase
      .from('teacher_section_assignments').select('subject_id, section_id').eq('teacher_id', userId);
    const subjectIds = [...new Set((assignments || []).map((a: any) => a.subject_id).filter(Boolean))];
    const sectionIds = [...new Set((assignments || []).map((a: any) => a.section_id).filter(Boolean))];
    if (subjectIds.length > 0) {
      const { data } = await supabase.from('exams')
        .select('*, subjects(name), classes(name)').in('subject_id', subjectIds)
        .order('exam_date', { ascending: false });
      const filtered = (data || []).filter((e: any) => !e.section_id || sectionIds.includes(e.section_id));
      setExams(filtered.map((e: any) => ({ ...e, subject_name: e.subjects?.name, class_name: e.classes?.name })));
    } else {
      const { data: ur } = await supabase.from('users').select('school_id').eq('id', userId).single();
      if (ur?.school_id) {
        const { data } = await supabase.from('exams').select('*, subjects(name), classes(name)')
          .eq('school_id', ur.school_id).order('exam_date', { ascending: false });
        setExams((data || []).map((e: any) => ({ ...e, subject_name: e.subjects?.name, class_name: e.classes?.name })));
      }
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const selectExam = async (examId: string) => {
    setSelectedExam(examId); setStudents([]); setMarks({}); setSaveError('');
    if (!examId) return;
    setLoadingStudents(true);
    const exam = exams.find(e => e.id === examId);
    if (!exam) { setLoadingStudents(false); return; }
    let stds: Student[] | null = null;
    if (exam.section_id) {
      const { data } = await supabase.from('students').select('id, full_name, roll_number')
        .eq('section_id', exam.section_id).eq('is_active', true).order('roll_number');
      stds = data;
    } else if (exam.class_id) {
      const { data } = await supabase.from('students').select('id, full_name, roll_number')
        .eq('class_id', exam.class_id).eq('is_active', true).order('roll_number');
      stds = data;
    }
    if (stds) {
      setStudents(stds);
      const { data: existing } = await supabase.from('marks')
        .select('student_id, marks_obtained, is_absent, remarks').eq('exam_id', examId);
      const map: Record<string, MarkEntry> = {};
      stds.forEach(s => {
        const e = existing?.find((m: any) => m.student_id === s.id);
        map[s.id] = { marks: e ? (e.marks_obtained != null ? String(e.marks_obtained) : '') : '', absent: !!e?.is_absent, remarks: e?.remarks || '' };
      });
      setMarks(map);
    }
    setLoadingStudents(false);
  };

  const updateMark = (studentId: string, field: keyof MarkEntry, value: string | boolean) => {
    setMarks(m => ({ ...m, [studentId]: { ...m[studentId], [field]: value, ...(field === 'absent' && value === true ? { marks: '' } : {}) } }));
  };

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = students[idx + 1];
      if (next && inputRefs.current[next.id]) inputRefs.current[next.id]!.focus();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = students[idx - 1];
      if (prev && inputRefs.current[prev.id]) inputRefs.current[prev.id]!.focus();
    }
  };

  const handleSave = async () => {
    setSaving(true); setSaveStatus('idle'); setSaveError('');
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setSaving(false); return; }
    const { data: userData } = await supabase.from('users').select('school_id').eq('id', userId).single();
    const exam = exams.find(e => e.id === selectedExam);
    const invalid = students.find(s => {
      const entry = marks[s.id];
      if (!entry || entry.absent || !entry.marks) return false;
      return parseFloat(entry.marks) > (exam?.total_marks || Infinity);
    });
    if (invalid) { setSaveError(`Marks for "${invalid.full_name}" exceed total (${exam?.total_marks})`); setSaving(false); return; }
    const records = students.map(s => {
      const entry = marks[s.id] || { marks: '', absent: false, remarks: '' };
      return { exam_id: selectedExam, student_id: s.id, school_id: userData?.school_id,
        marks_obtained: entry.absent ? null : (entry.marks ? parseFloat(entry.marks) : null),
        is_absent: entry.absent, remarks: entry.remarks || null, entered_by: userId };
    });
    const { error } = await supabase.from('marks').upsert(records, { onConflict: 'exam_id,student_id' });
    if (error) { setSaveError(error.message); setSaveStatus('error'); }
    else { setSaveStatus('success'); setTimeout(() => setSaveStatus('idle'), 3000); }
    setSaving(false);
  };

  const exam = exams.find(e => e.id === selectedExam);
  const filledCount = students.filter(s => marks[s.id]?.absent || (marks[s.id]?.marks !== '' && marks[s.id]?.marks !== undefined)).length;
  const passThresh = exam ? (exam.passing_marks || exam.total_marks * 0.35) : 0;
  const passCount = exam ? students.filter(s => { const m = marks[s.id]; return m && !m.absent && m.marks && parseFloat(m.marks) >= passThresh; }).length : 0;
  const failCount = exam ? students.filter(s => { const m = marks[s.id]; return m && !m.absent && m.marks && parseFloat(m.marks) < passThresh; }).length : 0;
  const IS: React.CSSProperties = { width:'100%', padding:'7px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' };

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', flexDirection:'column', gap:24 }}>
      <div>
        <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Marks Entry</h2>
        <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Enter marks for any exam across your assigned subjects</p>
      </div>

      {/* Exam Selector */}
      {loading ? <div style={{ height:48, background:'#F1F5F9', borderRadius:12 }} /> : (
        <select value={selectedExam} onChange={e => selectExam(e.target.value)}
          style={{ ...IS, fontSize:14, fontWeight:500, cursor:'pointer', padding:'11px 14px' }}>
          <option value="">— Select an Exam —</option>
          {exams.map(e => (
            <option key={e.id} value={e.id}>
              {e.name} · {e.subject_name} · {e.class_name} · {new Date(e.exam_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
              {!e.is_published ? ' [DRAFT]' : ''}
            </option>
          ))}
        </select>
      )}

      {/* Exam Info */}
      {exam && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { label:'Subject', value:exam.subject_name||'—', icon:'📚' },
            { label:'Class', value:exam.class_name||'—', icon:'🏫' },
            { label:'Total Marks', value:exam.total_marks, icon:'📊' },
            { label:'Pass Marks', value:exam.passing_marks||`${Math.round(exam.total_marks*0.35)} (35%)`, icon:'✅' },
          ].map((item,i) => (
            <div key={i} style={{ background:'white', border:'1px solid #E8ECF0', borderRadius:12, padding:'14px 18px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{item.icon} {item.label}</p>
              <p style={{ fontSize:17, fontWeight:700, color:'#0F172A', margin:'6px 0 0' }}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      {!selectedExam ? (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', padding:'64px 24px', textAlign:'center' }}>
          <div style={{ width:64, height:64, borderRadius:18, background:'linear-gradient(135deg,#EFF6FF,#DBEAFE)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:28 }}>📊</div>
          <p style={{ fontWeight:700, color:'#1E293B', fontSize:16, margin:0 }}>Select an Exam to Begin</p>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Choose an exam from the dropdown above to start entering marks</p>
        </div>
      ) : loadingStudents ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ height:52, background:'#F8FAFC', borderRadius:10 }} />)}
        </div>
      ) : students.length === 0 ? (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', padding:'48px 24px', textAlign:'center' }}>
          <p style={{ fontSize:28 }}>😕</p>
          <p style={{ fontWeight:600, color:'#475569' }}>No students found for this exam&apos;s class/section.</p>
        </div>
      ) : (
        <>
          {/* Progress + Actions */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:'#475569' }}>Progress:</span>
                  <span style={{ fontSize:13, fontWeight:800, color:'#0F172A' }}>{filledCount}/{students.length}</span>
                  {filledCount === students.length && <span style={{ fontSize:12, fontWeight:600, color:'#059669', background:'#ECFDF5', padding:'2px 9px', borderRadius:99 }}>✓ All filled</span>}
                </div>
                <div style={{ width:220, height:6, background:'#E2E8F0', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:99, width:`${(filledCount/students.length)*100}%`, background:'linear-gradient(90deg,#0F766E,#10B981)', transition:'width 0.3s ease' }} />
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setMarks(m => { const u={...m}; students.forEach(s => { u[s.id]={...u[s.id], absent:false}; }); return u; })}
                style={{ padding:'8px 14px', border:'1px solid #E2E8F0', borderRadius:9, background:'white', fontSize:12, fontWeight:600, color:'#475569', cursor:'pointer' }}>
                ✅ Mark All Present
              </button>
              {exam && !exam.is_published && <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99, background:'#FFFBEB', color:'#D97706', border:'1px solid #FDE68A', display:'flex', alignItems:'center' }}>DRAFT</span>}
            </div>
          </div>

          {saveError && <div style={{ padding:'12px 16px', background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:10, fontSize:13, color:'#DC2626', fontWeight:600 }}>⚠️ {saveError}</div>}

          {/* Table */}
          <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'48px 2fr 90px 110px 1fr 68px 90px', padding:'10px 20px', background:'#F8FAFC', borderBottom:'1px solid #F1F5F9', gap:12 }}>
              {['#','Student','Marks','% / Grade','Remarks','Absent','Analysis'].map((h,i) => (
                <p key={h} style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0, textAlign:i>=5?'center':'left' }}>{h}</p>
              ))}
            </div>
            {students.map((s, idx) => {
              const entry = marks[s.id] || { marks:'', absent:false, remarks:'' };
              const marksNum = entry.marks ? parseFloat(entry.marks) : null;
              const grade = marksNum != null && exam ? getGrade(marksNum, exam.total_marks) : null;
              const pct = marksNum != null && exam ? Math.round((marksNum/exam.total_marks)*100) : null;
              const isPassing = marksNum != null && exam && marksNum >= passThresh;
              const rowBg = entry.absent ? '#F8FAFC' : pct !== null ? (isPassing ? '#F0FDF4' : '#FFF5F5') : 'white';
              return (
                <div key={s.id} style={{ display:'grid', gridTemplateColumns:'48px 2fr 90px 110px 1fr 68px 90px', padding:'10px 20px', borderBottom:idx<students.length-1?'1px solid #F1F5F9':'none', alignItems:'center', gap:12, background:rowBg, transition:'background 0.2s' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#94A3B8' }}>{s.roll_number||idx+1}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,#6366F1,#8B5CF6)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                      {s.full_name.charAt(0)}
                    </div>
                    <span style={{ fontSize:13, fontWeight:600, color:'#0F172A' }}>{s.full_name}</span>
                  </div>
                  <input
                    ref={el => { inputRefs.current[s.id] = el; }}
                    type="number" placeholder="—" disabled={entry.absent}
                    value={entry.marks}
                    onChange={e => updateMark(s.id,'marks',e.target.value)}
                    onKeyDown={e => handleKeyDown(e,idx)}
                    min={0} max={exam?.total_marks}
                    style={{ width:'100%', padding:'7px 10px', border:`1.5px solid ${entry.absent?'#E2E8F0':pct!==null?(isPassing?'#86EFAC':'#FCA5A5'):'#E2E8F0'}`, borderRadius:8, fontSize:14, fontWeight:700, textAlign:'center', outline:'none', background:entry.absent?'#F8FAFC':'white', color:'#0F172A', cursor:entry.absent?'not-allowed':'text', opacity:entry.absent?0.4:1, boxSizing:'border-box' }}
                  />
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    {entry.absent ? <span style={{ fontSize:12, fontWeight:600, padding:'3px 9px', borderRadius:99, background:'#F1F5F9', color:'#94A3B8' }}>Absent</span>
                    : pct!==null&&grade ? <>
                      <span style={{ fontSize:13, fontWeight:700, color:grade.color }}>{pct}%</span>
                      <span style={{ fontSize:11, fontWeight:800, padding:'2px 7px', borderRadius:6, background:grade.bg, color:grade.color }}>{grade.letter}</span>
                    </> : <span style={{ fontSize:12, color:'#CBD5E1' }}>—</span>}
                  </div>
                  <input type="text" placeholder="Remarks..." value={entry.remarks}
                    onChange={e => updateMark(s.id,'remarks',e.target.value)}
                    style={{ width:'100%', padding:'7px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:12, outline:'none', boxSizing:'border-box', color:'#475569' }}
                  />
                  <div style={{ display:'flex', justifyContent:'center' }}>
                    <input type="checkbox" checked={entry.absent} onChange={e => updateMark(s.id,'absent',e.target.checked)}
                      style={{ width:18, height:18, cursor:'pointer', accentColor:'#DC2626' }} />
                  </div>
                  <div style={{ display:'flex', justifyContent:'center' }}>
                    <button
                      onClick={() => router.push(`/teacher/students/${s.id}/analysis`)}
                      title="View full analysis"
                      style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #DDD6FE', background:'linear-gradient(135deg,#F5F3FF,#EDE9FE)', color:'#7C3AED', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}
                    >
                      📊 Chart
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stats */}
          {filledCount > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
              {[{ label:'Total', value:students.length, color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' },
                { label:'Filled', value:filledCount, color:'#0F766E', bg:'#F0FDF4', border:'#CCFBF1' },
                { label:'Passing', value:passCount, color:'#16A34A', bg:'#DCFCE7', border:'#BBF7D0' },
                { label:'Failing', value:failCount, color:'#DC2626', bg:'#FEF2F2', border:'#FEE2E2' },
              ].map((stat,i) => (
                <div key={i} style={{ background:stat.bg, border:`1px solid ${stat.border}`, borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:12, fontWeight:600, color:stat.color }}>{stat.label}</span>
                  <span style={{ fontSize:20, fontWeight:800, color:'#0F172A' }}>{stat.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Save */}
          <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:16 }}>
            {saveStatus==='success' && <span style={{ fontSize:13, fontWeight:600, color:'#16A34A' }}>✅ Marks saved successfully!</span>}
            {saveStatus==='error' && !saveError && <span style={{ fontSize:13, fontWeight:600, color:'#DC2626' }}>❌ Failed to save.</span>}
            <button onClick={handleSave} disabled={saving||students.length===0}
              style={{ padding:'11px 32px', borderRadius:11, border:'none', fontSize:14, fontWeight:700, color:'white', cursor:saving?'not-allowed':'pointer', background:saving?'#6B7280':'linear-gradient(135deg,#0F766E,#059669)', boxShadow:saving?'none':'0 4px 14px rgba(15,118,110,0.3)', opacity:saving?0.8:1 }}>
              {saving ? 'Saving...' : '💾 Save Marks'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
