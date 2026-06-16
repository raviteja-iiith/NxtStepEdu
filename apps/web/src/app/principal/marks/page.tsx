'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface ClassItem { id: string; name: string; }
interface SectionItem { id: string; name: string; class_id: string; }
interface ExamItem { id: string; name: string; exam_type: string; exam_date: string; total_marks: number; passing_marks: number | null; is_published: boolean; class_id: string | null; section_id: string | null; subject_name?: string; }
interface MarkRow { student_id: string; full_name: string; roll_number: number | null; marks_obtained: number | null; is_absent: boolean; remarks: string | null; }

function getGrade(obtained: number, total: number) {
  const pct = (obtained / total) * 100;
  if (pct >= 90) return { letter:'A+', color:'#065F46', bg:'#ECFDF5' };
  if (pct >= 75) return { letter:'A',  color:'#166534', bg:'#F0FDF4' };
  if (pct >= 60) return { letter:'B',  color:'#1D4ED8', bg:'#EFF6FF' };
  if (pct >= 45) return { letter:'C',  color:'#D97706', bg:'#FFFBEB' };
  if (pct >= 35) return { letter:'D',  color:'#EA580C', bg:'#FFF7ED' };
  return { letter:'F', color:'#DC2626', bg:'#FEF2F2' };
}

export default function PrincipalMarksPage() {
  const supabase = createClient();
  const router = useRouter();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [results, setResults] = useState<MarkRow[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [sortField, setSortField] = useState<'rank'|'name'|'marks'>('rank');
  const [schoolId, setSchoolId] = useState('');

  const fetchStructure = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setInitLoading(false); return; }
    const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!u?.school_id) { setInitLoading(false); return; }
    setSchoolId(u.school_id);
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).eq('school_id', u.school_id).maybeSingle();
    const query = yr?.id
      ? { classes: supabase.from('classes').select('id,name').eq('academic_year_id', yr.id).order('numeric_order'),
          sections: supabase.from('sections').select('id,name,class_id').eq('academic_year_id', yr.id) }
      : { classes: supabase.from('classes').select('id,name').eq('school_id', u.school_id).order('numeric_order'),
          sections: supabase.from('sections').select('id,name,class_id').eq('school_id', u.school_id) };
    const [{ data: cls }, { data: sec }] = await Promise.all([query.classes, query.sections]);
    if (cls) setClasses(cls);
    if (sec) setSections(sec);
    setInitLoading(false);
  }, [supabase]);

  useEffect(() => { fetchStructure(); }, [fetchStructure]);

  // Fetch exams when class/section changes
  useEffect(() => {
    if (!selectedClass) { setExams([]); setSelectedExam(''); setResults([]); return; }
    const fetchExams = async () => {
      let q = supabase.from('exams').select('*, subjects(name)')
        .eq('school_id', schoolId).eq('class_id', selectedClass).order('exam_date', { ascending: false });
      if (selectedSection) q = q.or(`section_id.eq.${selectedSection},section_id.is.null`);
      const { data } = await q;
      setExams((data||[]).map((e: any) => ({ ...e, subject_name: e.subjects?.name })));
      setSelectedExam(''); setResults([]);
    };
    if (schoolId) fetchExams();
  }, [supabase, selectedClass, selectedSection, schoolId]);

  // Fetch results when exam changes
  useEffect(() => {
    if (!selectedExam) { setResults([]); return; }
    const fetchResults = async () => {
      setLoading(true);
      const exam = exams.find(e => e.id === selectedExam);
      if (!exam) { setLoading(false); return; }
      // Get students for this exam
      let studentsQuery = supabase.from('students').select('id, full_name, roll_number').eq('is_active', true);
      if (exam.section_id) studentsQuery = studentsQuery.eq('section_id', exam.section_id);
      else if (exam.class_id) {
        if (selectedSection) studentsQuery = studentsQuery.eq('section_id', selectedSection);
        else studentsQuery = studentsQuery.eq('class_id', exam.class_id);
      }
      const { data: students } = await studentsQuery.order('roll_number');
      // Get marks
      const { data: marksData } = await supabase.from('marks')
        .select('student_id, marks_obtained, is_absent, remarks').eq('exam_id', selectedExam);
      const marksMap = new Map((marksData||[]).map((m: any) => [m.student_id, m]));
      const rows: MarkRow[] = (students||[]).map((s: any) => {
        const m: any = marksMap.get(s.id);
        return { student_id: s.id, full_name: s.full_name, roll_number: s.roll_number,
          marks_obtained: m?.marks_obtained ?? null, is_absent: !!m?.is_absent, remarks: m?.remarks || null };
      });
      setResults(rows);
      setLoading(false);
    };
    fetchResults();
  }, [supabase, selectedExam, exams, selectedSection]);

  const exam = exams.find(e => e.id === selectedExam);
  const passThresh = exam ? (exam.passing_marks || exam.total_marks * 0.35) : 0;

  const sortedResults = [...results].sort((a, b) => {
    if (sortField === 'name') return a.full_name.localeCompare(b.full_name);
    if (sortField === 'marks') {
      const am = a.marks_obtained ?? -1; const bm = b.marks_obtained ?? -1;
      return bm - am;
    }
    // rank: sort by marks desc, absent last
    if (a.is_absent && !b.is_absent) return 1;
    if (!a.is_absent && b.is_absent) return -1;
    return (b.marks_obtained ?? -1) - (a.marks_obtained ?? -1);
  });

  const enteredCount = results.filter(r => r.marks_obtained !== null || r.is_absent).length;
  const absentCount = results.filter(r => r.is_absent).length;
  const presentResults = results.filter(r => !r.is_absent && r.marks_obtained !== null);
  const passCount = presentResults.filter(r => (r.marks_obtained||0) >= passThresh).length;
  const avg = presentResults.length > 0 ? Math.round(presentResults.reduce((s,r) => s+(r.marks_obtained||0),0)/presentResults.length*10)/10 : null;
  const highest = presentResults.length > 0 ? Math.max(...presentResults.map(r => r.marks_obtained||0)) : null;
  const lowest = presentResults.length > 0 ? Math.min(...presentResults.map(r => r.marks_obtained||0)) : null;
  const passRate = presentResults.length > 0 ? Math.round((passCount/presentResults.length)*100) : null;

  const IS: React.CSSProperties = { width:'100%', padding:'10px 14px', border:'1px solid #E2E8F0', borderRadius:10, fontSize:13, outline:'none', background:'white', boxSizing:'border-box' };
  const filteredSections = sections.filter(s => !selectedClass || s.class_id === selectedClass);

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', flexDirection:'column', gap:24 }}>
      <div>
        <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Marks &amp; Results</h2>
        <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>View exam results for any class, section, and exam</p>
      </div>

      {/* Filters */}
      {initLoading ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:12 }}>
          {[1,2,3].map(i => <div key={i} style={{ height:44, background:'#F1F5F9', borderRadius:10 }} />)}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:12 }}>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Class</label>
            <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedSection(''); }} style={IS}>
              <option value="">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Section</label>
            <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} disabled={!selectedClass} style={{ ...IS, opacity:selectedClass?1:0.5 }}>
              <option value="">All Sections</option>
              {filteredSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Exam</label>
            <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)} disabled={!selectedClass} style={{ ...IS, opacity:selectedClass?1:0.5 }}>
              <option value="">Select Exam...</option>
              {exams.map(e => <option key={e.id} value={e.id}>{e.name} · {e.subject_name} · {new Date(e.exam_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}{!e.is_published?' [DRAFT]':''}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {selectedExam && exam && !loading && results.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
          {[
            { label:'Students', value:results.length, icon:'🎓', color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' },
            { label:'Entered', value:enteredCount, icon:'✏️', color:'#0F766E', bg:'#F0FDF4', border:'#CCFBF1' },
            { label:'Pass Rate', value:passRate!=null?`${passRate}%`:'—', icon:'🏆', color:'#16A34A', bg:'#DCFCE7', border:'#BBF7D0' },
            { label:'Average', value:avg!=null?`${avg}`:' —', icon:'📊', color:'#7C3AED', bg:'#F5F3FF', border:'#EDE9FE' },
            { label:'Absent', value:absentCount, icon:'❌', color:'#DC2626', bg:'#FEF2F2', border:'#FEE2E2' },
          ].map((stat,i) => (
            <div key={i} style={{ background:stat.bg, border:`1px solid ${stat.border}`, borderRadius:12, padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <p style={{ fontSize:10, fontWeight:700, color:stat.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{stat.label}</p>
                <span style={{ fontSize:16 }}>{stat.icon}</span>
              </div>
              <p style={{ fontSize:22, fontWeight:800, color:'#0F172A', margin:0 }}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Highest / Lowest / Pass bar */}
      {selectedExam && exam && !loading && presentResults.length > 0 && (
        <div style={{ background:'white', border:'1px solid #E8ECF0', borderRadius:12, padding:'16px 20px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:'0 0 12px' }}>Class Performance Overview</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 2fr', gap:16, alignItems:'center' }}>
            <div style={{ textAlign:'center' }}>
              <p style={{ fontSize:11, color:'#94A3B8', margin:'0 0 4px', fontWeight:600 }}>HIGHEST</p>
              <p style={{ fontSize:22, fontWeight:800, color:'#16A34A', margin:0 }}>{highest ?? '—'}</p>
              <p style={{ fontSize:11, color:'#94A3B8', margin:'2px 0 0' }}>/ {exam.total_marks}</p>
            </div>
            <div style={{ textAlign:'center' }}>
              <p style={{ fontSize:11, color:'#94A3B8', margin:'0 0 4px', fontWeight:600 }}>LOWEST</p>
              <p style={{ fontSize:22, fontWeight:800, color:'#DC2626', margin:0 }}>{lowest ?? '—'}</p>
              <p style={{ fontSize:11, color:'#94A3B8', margin:'2px 0 0' }}>/ {exam.total_marks}</p>
            </div>
            <div style={{ textAlign:'center' }}>
              <p style={{ fontSize:11, color:'#94A3B8', margin:'0 0 4px', fontWeight:600 }}>AVERAGE</p>
              <p style={{ fontSize:22, fontWeight:800, color:'#7C3AED', margin:0 }}>{avg ?? '—'}</p>
              <p style={{ fontSize:11, color:'#94A3B8', margin:'2px 0 0' }}>/ {exam.total_marks}</p>
            </div>
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:12, fontWeight:600, color:'#475569' }}>Pass Rate</span>
                <span style={{ fontSize:13, fontWeight:800, color: passRate!=null&&passRate>=50?'#16A34A':'#DC2626' }}>{passRate ?? 0}%</span>
              </div>
              <div style={{ height:10, background:'#E2E8F0', borderRadius:99, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:99, width:`${passRate ?? 0}%`, background: passRate!=null&&passRate>=50?'linear-gradient(90deg,#16A34A,#22C55E)':'linear-gradient(90deg,#DC2626,#EF4444)', transition:'width 0.5s' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                <span style={{ fontSize:11, color:'#94A3B8' }}>{passCount} passed</span>
                <span style={{ fontSize:11, color:'#94A3B8' }}>{presentResults.length-passCount} failed</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!selectedExam && (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', padding:'64px 24px', textAlign:'center' }}>
          <div style={{ width:64, height:64, borderRadius:18, background:'linear-gradient(135deg,#EFF6FF,#DBEAFE)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:28 }}>📋</div>
          <p style={{ fontWeight:700, color:'#1E293B', fontSize:16, margin:0 }}>Select a Class &amp; Exam</p>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Use the filters above to view results for any exam</p>
        </div>
      )}

      {/* Results Table */}
      {selectedExam && !loading && results.length > 0 && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <p style={{ fontSize:13, fontWeight:600, color:'#475569', margin:0 }}>{results.length} students · {enteredCount} marks entered</p>
            <div style={{ display:'flex', gap:8 }}>
              {(['rank','name','marks'] as const).map(f => (
                <button key={f} onClick={() => setSortField(f)}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #E2E8F0', fontSize:12, fontWeight:600, cursor:'pointer', background:sortField===f?'#1E3A8A':'white', color:sortField===f?'white':'#475569' }}>
                  {f === 'rank' ? 'Rank' : f === 'name' ? 'Name' : 'Marks'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ background:'white', borderRadius:14, border:'1px solid #E8ECF0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'56px 2fr 80px 100px 80px 100px 1fr 100px', padding:'10px 20px', background:'#F8FAFC', borderBottom:'1px solid #F1F5F9', gap:12 }}>
              {['Rank','Student','Roll','Marks','%','Grade','Remarks','Analysis'].map((h,i) => (
                <p key={h} style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0, textAlign:i>=2?'center':'left' }}>{h}</p>
              ))}
            </div>
            {sortedResults.map((row, idx) => {
              const pct = row.marks_obtained != null && exam ? Math.round((row.marks_obtained/exam.total_marks)*100) : null;
              const grade = row.marks_obtained != null && exam ? getGrade(row.marks_obtained, exam.total_marks) : null;
              const isPassing = row.marks_obtained != null && row.marks_obtained >= passThresh;
              const rank = sortField === 'rank' || sortField === 'marks' ? idx+1 : '—';
              return (
                <div key={row.student_id}
                  style={{ display:'grid', gridTemplateColumns:'56px 2fr 80px 100px 80px 100px 1fr 100px', padding:'12px 20px', borderBottom:idx<sortedResults.length-1?'1px solid #F1F5F9':'none', alignItems:'center', gap:12, background:row.is_absent?'#F8FAFC':'white', cursor:'pointer', transition:'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = row.is_absent ? '#F1F5F9' : '#F8FAFF'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = row.is_absent ? '#F8FAFC' : 'white'}
                >
                  <span style={{ fontSize:13, fontWeight:700, color:'#94A3B8', textAlign:'center' }}>{!row.is_absent && pct != null ? `#${rank}` : '—'}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background:`linear-gradient(135deg,${isPassing?'#1D4ED8':'#DC2626'},${isPassing?'#60A5FA':'#FCA5A5'})`, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>
                      {row.full_name.charAt(0)}
                    </div>
                    <span style={{ fontSize:13, fontWeight:600, color:'#0F172A' }}>{row.full_name}</span>
                  </div>
                  <span style={{ fontSize:13, color:'#94A3B8', textAlign:'center' }}>{row.roll_number ?? '—'}</span>
                  <div style={{ textAlign:'center' }}>
                    {row.is_absent ? <span style={{ fontSize:12, fontWeight:600, padding:'3px 9px', borderRadius:99, background:'#FEF2F2', color:'#DC2626' }}>Absent</span>
                    : row.marks_obtained != null ? <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>{row.marks_obtained}</span>
                    : <span style={{ fontSize:12, color:'#CBD5E1' }}>Not entered</span>}
                  </div>
                  <span style={{ fontSize:13, fontWeight:700, textAlign:'center', color:pct!=null?(isPassing?'#16A34A':'#DC2626'):'#CBD5E1' }}>{pct!=null?`${pct}%`:'—'}</span>
                  <div style={{ textAlign:'center' }}>
                    {grade && !row.is_absent ? <span style={{ fontSize:12, fontWeight:800, padding:'3px 9px', borderRadius:6, background:grade.bg, color:grade.color }}>{grade.letter}</span> : <span style={{ fontSize:12, color:'#CBD5E1' }}>—</span>}
                  </div>
                  <span style={{ fontSize:12, color:'#64748B' }}>{row.remarks || '—'}</span>
                  <div style={{ display:'flex', justifyContent:'center' }}>
                    <button
                      onClick={() => router.push(`/principal/students/${row.student_id}/analysis`)}
                      style={{ padding:'5px 12px', borderRadius:8, border:'1px solid #DDD6FE', background:'linear-gradient(135deg,#F5F3FF,#EDE9FE)', color:'#7C3AED', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}
                    >
                      📊 View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {selectedExam && loading && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[1,2,3,4,5].map(i => <div key={i} style={{ height:52, background:'#F8FAFC', borderRadius:10 }} />)}
        </div>
      )}

      {selectedExam && !loading && results.length === 0 && (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #E8ECF0', padding:'48px 24px', textAlign:'center' }}>
          <p style={{ fontSize:28 }}>📭</p>
          <p style={{ fontWeight:600, color:'#475569' }}>No students found for this exam.</p>
        </div>
      )}
    </div>
  );
}
