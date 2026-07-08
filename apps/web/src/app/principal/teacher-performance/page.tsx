'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface TeacherMetric {
  teacher_id: string;
  teacher_name: string;
  username: string;
  is_class_teacher: boolean;
  total_exams: number;
  total_students: number;
  average_score: number;
  pass_rate: number;
  exams_breakdown: any[];
}

export default function TeacherPerformancePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherMetric[]>([]);
  const [search, setSearch] = useState('');
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: cu } = await supabase.from('users').select('school_id').eq('id', (await supabase.auth.getUser()).data.user?.id || '').single();
    if (!cu?.school_id) { setLoading(false); return; }
    const sid = cu.school_id;

    // 1. Fetch all teachers
    const { data: allUsers } = await supabase.from('users').select('id, full_name, username').eq('school_id', sid).eq('role', 'teacher');
    if (!allUsers) return;

    // 2. Fetch assignments & class teachers
    const { data: assignments } = await supabase.from('teacher_section_assignments').select('teacher_id, section_id, subject_id').eq('school_id', sid);
    const { data: sections } = await supabase.from('sections').select('id, class_teacher_id, class_id, name, classes(name)').eq('school_id', sid);
    const { data: subjects } = await supabase.from('subjects').select('id, name, class_id').eq('school_id', sid);

    // 3. Fetch published exams
    const { data: exams } = await supabase.from('exams').select('id, title, subject_id, class_id, section_id, total_marks').eq('school_id', sid).eq('is_published', true);

    // 4. Fetch marks
    const { data: marks } = await supabase.from('marks').select('exam_id, marks_obtained, is_absent');

    // Build the metrics
    const teacherMetrics: TeacherMetric[] = [];

    for (const user of allUsers) {
      const isClassTeacher = (sections || []).some((s: any) => s.class_teacher_id === user.id);
      const userAssignments = (assignments || []).filter((a: any) => a.teacher_id === user.id);
      
      if (!isClassTeacher && userAssignments.length === 0) continue; // Skip unassigned teachers

      let totalExamScore = 0;
      let totalMaxScore = 0;
      let passCount = 0;
      let totalStudentEvaluations = 0;
      const examsBreakdown: any[] = [];
      const uniqueStudents = new Set<string>();

      // Find exams related to this teacher's assignments
      for (const assign of userAssignments) {
        const assignSection = (sections || []).find((s: any) => s.id === assign.section_id);
        if (!assignSection) continue;

        const relatedExams = (exams || []).filter((e: any) => 
          e.subject_id === assign.subject_id &&
          e.class_id === assignSection.class_id &&
          (!e.section_id || e.section_id === assign.section_id)
        );

        for (const exam of relatedExams) {
          // If we already processed this exam for this teacher, skip (in case of duplicate assignments)
          if (examsBreakdown.some(eb => eb.exam_id === exam.id)) continue;

          const examMarks = (marks || []).filter((m: any) => m.exam_id === exam.id && !m.is_absent && m.marks_obtained !== null);
          if (examMarks.length === 0) continue;

          let examTotalScore = 0;
          let examPassCount = 0;
          let highest = -1;
          let lowest = 999999;

          examMarks.forEach((m: any) => {
            const score = Number(m.marks_obtained);
            examTotalScore += score;
            if (score >= (exam.total_marks * 0.35)) examPassCount++; // Assuming 35% pass mark
            if (score > highest) highest = score;
            if (score < lowest) lowest = score;
            // Note: student_id is not in marks query above to save bandwidth, just counting evaluations
            totalStudentEvaluations++;
          });

          const examAvgScore = (examTotalScore / (examMarks.length * exam.total_marks)) * 100;
          const examPassRate = (examPassCount / examMarks.length) * 100;

          totalExamScore += examTotalScore;
          totalMaxScore += (examMarks.length * exam.total_marks);
          passCount += examPassCount;

          const subjectName = (subjects || []).find((s: any) => s.id === exam.subject_id)?.name || 'Subject';
          
          examsBreakdown.push({
            exam_id: exam.id,
            title: exam.title,
            subject_name: subjectName,
            class_section: `${assignSection.classes?.name} - ${assignSection.name}`,
            total_students: examMarks.length,
            avg_score: examAvgScore,
            pass_rate: examPassRate,
            highest,
            lowest
          });
        }
      }

      teacherMetrics.push({
        teacher_id: user.id,
        teacher_name: user.full_name,
        username: user.username,
        is_class_teacher: isClassTeacher,
        total_exams: examsBreakdown.length,
        total_students: totalStudentEvaluations, // rough metric
        average_score: totalMaxScore > 0 ? (totalExamScore / totalMaxScore) * 100 : 0,
        pass_rate: totalStudentEvaluations > 0 ? (passCount / totalStudentEvaluations) * 100 : 0,
        exams_breakdown: examsBreakdown
      });
    }

    // Sort by average score descending
    teacherMetrics.sort((a, b) => b.average_score - a.average_score);
    setTeachers(teacherMetrics);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = teachers.filter(t => t.teacher_name.toLowerCase().includes(search.toLowerCase()));

  const schoolAvg = teachers.length > 0 ? teachers.reduce((acc, t) => acc + t.average_score, 0) / teachers.length : 0;
  const topPerformer = teachers.length > 0 ? teachers[0] : null;
  const needsAttention = teachers.filter(t => t.average_score > 0 && t.average_score < 50).length;

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', margin:0 }}>Teacher Performance</h2>
          <p style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>Analyze teacher effectiveness based on student exam results</p>
        </div>
      </div>

      {/* Stats */}
      <div className="three-col-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        {[
          { label:'Evaluated Teachers', value:teachers.length, color:'#1D4ED8', bg:'#EFF6FF', border:'#DBEAFE' },
          { label:'School Average', value:`${schoolAvg.toFixed(1)}%`, color:'#16A34A', bg:'#F0FDF4', border:'#DCFCE7' },
          { label:'Top Performer', value:topPerformer?.teacher_name?.split(' ')[0] || '—', color:'#6D28D9', bg:'#F5F3FF', border:'#EDE9FE' },
          { label:'Needs Attention (<50%)', value:needsAttention, color:'#DC2626', bg:'#FEF2F2', border:'#FEE2E2' },
        ].map((s,i)=>(
          <div key={i} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:'16px 20px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{s.label}</p>
            <p style={{ fontSize:24, fontWeight:800, color:'#0F172A', margin:'6px 0 0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {loading?<span style={{ display:'inline-block', width:32, height:28, background:'rgba(0,0,0,0.08)', borderRadius:6 }}/>:s.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{ position:'relative', marginBottom: 20, maxWidth: 300 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="text" placeholder="Search teacher..." value={search} onChange={e=>setSearch(e.target.value)} 
          style={{ width:'100%', padding:'10px 14px 10px 36px', border:'1px solid #E2E8F0', borderRadius:10, fontSize:13, outline:'none', background:'white' }}/>
      </div>

      <div className="list-table-container">
        <div className="teacher-list-grid header-row" style={{ padding:'12px 20px', background:'#F8FAFC', borderBottom:'1px solid #F1F5F9', display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr auto', gap:10 }}>
          {['Teacher','Avg Score','Pass Rate','Exams Evaluated','Students Taught',''].map((h)=>(
            <p key={h} style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{h}</p>
          ))}
        </div>
        
        {loading ? (
          <div style={{ padding:24, display:'flex', flexDirection:'column', gap:12 }}>
            {[1,2,3].map(i=><div key={i} style={{ height:52, background:'#F8FAFC', borderRadius:8 }}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:'60px 24px', textAlign:'center' }}>
            <p style={{ fontWeight:700, color:'#1E293B', fontSize:15, margin:0 }}>No performance data found</p>
          </div>
        ) : filtered.map((t, idx) => (
          <div key={t.teacher_id} style={{ borderBottom:idx<filtered.length-1?'1px solid #F8FAFC':'none' }}>
            <div style={{ padding:'14px 20px', display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr auto', gap:10, alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, flexShrink:0 }}>
                  {t.teacher_name.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <p style={{ fontWeight:700, fontSize:13, color:'#0F172A', margin:0 }}>{t.teacher_name}</p>
                  <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:99, background:t.is_class_teacher?'#DCFCE7':'#DBEAFE', color:t.is_class_teacher?'#15803D':'#1D4ED8', letterSpacing:'0.03em', display:'inline-block', marginTop:4 }}>
                    {t.is_class_teacher ? '🏫 Class Teacher' : '📚 Subject Teacher'}
                  </span>
                </div>
              </div>
              
              <div>
                <p style={{ fontSize:16, fontWeight:800, color:t.average_score >= 75 ? '#16A34A' : t.average_score >= 50 ? '#D97706' : '#DC2626', margin:0 }}>
                  {t.average_score > 0 ? `${t.average_score.toFixed(1)}%` : '—'}
                </p>
              </div>
              
              <div>
                <p style={{ fontSize:14, fontWeight:600, color:'#334155', margin:0 }}>
                  {t.pass_rate > 0 ? `${t.pass_rate.toFixed(1)}%` : '—'}
                </p>
              </div>
              
              <div><p style={{ fontSize:14, fontWeight:600, color:'#64748B', margin:0 }}>{t.total_exams}</p></div>
              <div><p style={{ fontSize:14, fontWeight:600, color:'#64748B', margin:0 }}>{t.total_students}</p></div>
              
              <div>
                <button 
                  onClick={() => setExpandedTeacher(expandedTeacher === t.teacher_id ? null : t.teacher_id)}
                  style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #E2E8F0', background:'white', color:'#0F172A', cursor:'pointer' }}>
                  {expandedTeacher === t.teacher_id ? 'Hide Details' : 'View Details'}
                </button>
              </div>
            </div>

            {/* Drilldown view */}
            {expandedTeacher === t.teacher_id && (
              <div style={{ background:'#F8FAFC', padding:'20px', borderTop:'1px solid #F1F5F9' }}>
                <h4 style={{ fontSize:13, fontWeight:700, color:'#0F172A', margin:'0 0 12px', textTransform:'uppercase', letterSpacing:'0.05em' }}>Per-Exam Breakdown</h4>
                {t.exams_breakdown.length === 0 ? (
                  <p style={{ fontSize:13, color:'#94A3B8' }}>No exams evaluated yet.</p>
                ) : (
                  <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:10, overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead style={{ background:'#F1F5F9', borderBottom:'1px solid #E2E8F0' }}>
                        <tr>
                          {['Exam', 'Subject', 'Class', 'Avg Score', 'Pass Rate'].map(th => (
                            <th key={th} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>{th}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {t.exams_breakdown.map(eb => (
                          <tr key={eb.exam_id} style={{ borderBottom:'1px solid #F1F5F9' }}>
                            <td style={{ padding:'10px 14px', fontSize:13, fontWeight:600, color:'#0F172A' }}>{eb.title}</td>
                            <td style={{ padding:'10px 14px', fontSize:13, color:'#334155' }}>{eb.subject_name}</td>
                            <td style={{ padding:'10px 14px', fontSize:13, color:'#334155' }}>{eb.class_section}</td>
                            <td style={{ padding:'10px 14px', fontSize:13, fontWeight:700, color:eb.avg_score >= 75 ? '#16A34A' : eb.avg_score >= 50 ? '#D97706' : '#DC2626' }}>{eb.avg_score.toFixed(1)}%</td>
                            <td style={{ padding:'10px 14px', fontSize:13, fontWeight:600, color:'#475569' }}>{eb.pass_rate.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
