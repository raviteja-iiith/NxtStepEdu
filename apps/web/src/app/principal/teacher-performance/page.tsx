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
  exams_breakdown: ExamBreakdown[];
}

interface ExamBreakdown {
  exam_id: string;
  name: string;
  subject_name: string;
  class_section: string;
  total_marks: number;
  total_students: number;
  avg_score: number;
  pass_rate: number;
  highest: number;
  lowest: number;
}

export default function TeacherPerformancePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherMetric[]>([]);
  const [search, setSearch] = useState('');
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      
      const { data: cu } = await supabase.from('users').select('school_id').eq('id', user.id).single();
      if (!cu?.school_id) { setLoading(false); return; }
      const sid = cu.school_id;

      // 1. Fetch all teachers for this school
      const { data: allUsers } = await supabase
        .from('users')
        .select('id, full_name, username')
        .eq('school_id', sid)
        .eq('role', 'teacher');

      // 2. Fetch teacher-section assignments
      const { data: assignments } = await supabase
        .from('teacher_section_assignments')
        .select('teacher_id, section_id, subject_id')
        .eq('school_id', sid);

      // 3. Fetch all sections with class info
      const { data: sections } = await supabase
        .from('sections')
        .select('id, class_teacher_id, class_id, name, classes(name)')
        .eq('school_id', sid);

      // 4. Fetch all subjects
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id, name, class_id, teacher_id')
        .eq('school_id', sid);

      // 5. Fetch ALL exams for this school (both published and unpublished — marks may exist)
      const { data: exams } = await supabase
        .from('exams')
        .select('id, name, subject_id, class_id, section_id, total_marks, passing_marks, is_published')
        .eq('school_id', sid);

      // 6. Fetch marks scoped to this school
      const { data: marks } = await supabase
        .from('marks')
        .select('exam_id, student_id, marks_obtained, is_absent')
        .eq('school_id', sid);

      // Debug info
      const debugStr = `Teachers: ${allUsers?.length || 0}, Assignments: ${assignments?.length || 0}, Sections: ${sections?.length || 0}, Subjects: ${subjects?.length || 0}, Exams: ${exams?.length || 0}, Marks: ${marks?.length || 0}`;
      setDebugInfo(debugStr);
      console.log('[TeacherPerformance]', debugStr);

      if (!allUsers || allUsers.length === 0) {
        setTeachers([]);
        setLoading(false);
        return;
      }

      // Build a section lookup: section_id -> { class_id, name, class_name, class_teacher_id }
      const sectionMap = new Map<string, { class_id: string; name: string; class_name: string; class_teacher_id: string | null }>();
      (sections || []).forEach((s: any) => {
        sectionMap.set(s.id, {
          class_id: s.class_id,
          name: s.name,
          class_name: s.classes?.name || '',
          class_teacher_id: s.class_teacher_id
        });
      });

      // Build subject lookup
      const subjectMap = new Map<string, { name: string; class_id: string; teacher_id: string | null }>();
      (subjects || []).forEach((s: any) => {
        subjectMap.set(s.id, { name: s.name, class_id: s.class_id, teacher_id: s.teacher_id });
      });

      // Build exam lookup
      const examMap = new Map<string, any>();
      (exams || []).forEach((e: any) => { examMap.set(e.id, e); });

      // Build marks by exam_id
      const marksByExam = new Map<string, any[]>();
      (marks || []).forEach((m: any) => {
        if (!marksByExam.has(m.exam_id)) marksByExam.set(m.exam_id, []);
        marksByExam.get(m.exam_id)!.push(m);
      });

      // For each teacher, find what exams they're linked to via:
      //   - teacher_section_assignments (teacher_id → section_id + subject_id)
      //   - OR subjects.teacher_id (fallback legacy link)
      const teacherMetrics: TeacherMetric[] = [];

      for (const user of allUsers) {
        const isClassTeacher = (sections || []).some((s: any) => s.class_teacher_id === user.id);
        const userAssignments = (assignments || []).filter((a: any) => a.teacher_id === user.id);

        // Also check subjects directly assigned to this teacher (legacy fallback)
        const directSubjects = (subjects || []).filter((s: any) => s.teacher_id === user.id);

        // Skip teachers with zero assignments AND no direct subjects AND not a class teacher
        if (!isClassTeacher && userAssignments.length === 0 && directSubjects.length === 0) continue;

        let totalExamScore = 0;
        let totalMaxScore = 0;
        let passCount = 0;
        let totalStudentEvaluations = 0;
        const examsBreakdown: ExamBreakdown[] = [];
        const processedExamIds = new Set<string>();

        // Method 1: Via teacher_section_assignments
        for (const assign of userAssignments) {
          const sec = sectionMap.get(assign.section_id);
          if (!sec) continue;

          // Find exams matching this subject_id + class_id
          const relatedExams = (exams || []).filter((e: any) =>
            e.subject_id === assign.subject_id &&
            e.class_id === sec.class_id &&
            (!e.section_id || e.section_id === assign.section_id)
          );

          for (const exam of relatedExams) {
            if (processedExamIds.has(exam.id)) continue;
            processedExamIds.add(exam.id);

            const examMarks = (marksByExam.get(exam.id) || []).filter(
              (m: any) => !m.is_absent && m.marks_obtained !== null && m.marks_obtained !== undefined
            );
            if (examMarks.length === 0) continue;

            const passThreshold = exam.passing_marks || Math.round(exam.total_marks * 0.35);
            let examTotalScore = 0;
            let examPassCount = 0;
            let highest = -Infinity;
            let lowest = Infinity;

            examMarks.forEach((m: any) => {
              const score = Number(m.marks_obtained);
              examTotalScore += score;
              if (score >= passThreshold) examPassCount++;
              if (score > highest) highest = score;
              if (score < lowest) lowest = score;
              totalStudentEvaluations++;
            });

            const examAvgPct = (examTotalScore / (examMarks.length * exam.total_marks)) * 100;
            const examPassRate = (examPassCount / examMarks.length) * 100;

            totalExamScore += examTotalScore;
            totalMaxScore += (examMarks.length * exam.total_marks);
            passCount += examPassCount;

            const subName = subjectMap.get(exam.subject_id)?.name || 'Subject';

            examsBreakdown.push({
              exam_id: exam.id,
              name: exam.name,
              subject_name: subName,
              class_section: `${sec.class_name} - ${sec.name}`,
              total_marks: exam.total_marks,
              total_students: examMarks.length,
              avg_score: examAvgPct,
              pass_rate: examPassRate,
              highest: highest === -Infinity ? 0 : highest,
              lowest: lowest === Infinity ? 0 : lowest
            });
          }
        }

        // Method 2: Via subjects.teacher_id (fallback for teachers not in teacher_section_assignments)
        for (const sub of directSubjects) {
          // Find exams for this subject
          const relatedExams = (exams || []).filter((e: any) => e.subject_id === sub.id);

          for (const exam of relatedExams) {
            if (processedExamIds.has(exam.id)) continue;
            processedExamIds.add(exam.id);

            const examMarks = (marksByExam.get(exam.id) || []).filter(
              (m: any) => !m.is_absent && m.marks_obtained !== null && m.marks_obtained !== undefined
            );
            if (examMarks.length === 0) continue;

            const passThreshold = exam.passing_marks || Math.round(exam.total_marks * 0.35);
            let examTotalScore = 0;
            let examPassCount = 0;
            let highest = -Infinity;
            let lowest = Infinity;

            examMarks.forEach((m: any) => {
              const score = Number(m.marks_obtained);
              examTotalScore += score;
              if (score >= passThreshold) examPassCount++;
              if (score > highest) highest = score;
              if (score < lowest) lowest = score;
              totalStudentEvaluations++;
            });

            const examAvgPct = (examTotalScore / (examMarks.length * exam.total_marks)) * 100;
            const examPassRate = (examPassCount / examMarks.length) * 100;

            totalExamScore += examTotalScore;
            totalMaxScore += (examMarks.length * exam.total_marks);
            passCount += examPassCount;

            // Figure out class-section label
            let classSection = '';
            if (exam.section_id && sectionMap.has(exam.section_id)) {
              const sec = sectionMap.get(exam.section_id)!;
              classSection = `${sec.class_name} - ${sec.name}`;
            } else {
              // Find class name from subjects or classes
              const subInfo = subjectMap.get(exam.subject_id);
              if (subInfo) {
                // Find the class name from sections
                const classSections = Array.from(sectionMap.values()).filter(s => s.class_id === exam.class_id);
                classSection = classSections.length > 0 ? `${classSections[0].class_name} (All)` : 'Class';
              }
            }

            examsBreakdown.push({
              exam_id: exam.id,
              name: exam.name,
              subject_name: sub.name,
              class_section: classSection,
              total_marks: exam.total_marks,
              total_students: examMarks.length,
              avg_score: examAvgPct,
              pass_rate: examPassRate,
              highest: highest === -Infinity ? 0 : highest,
              lowest: lowest === Infinity ? 0 : lowest
            });
          }
        }

        teacherMetrics.push({
          teacher_id: user.id,
          teacher_name: user.full_name,
          username: user.username || '',
          is_class_teacher: isClassTeacher,
          total_exams: examsBreakdown.length,
          total_students: totalStudentEvaluations,
          average_score: totalMaxScore > 0 ? (totalExamScore / totalMaxScore) * 100 : 0,
          pass_rate: totalStudentEvaluations > 0 ? (passCount / totalStudentEvaluations) * 100 : 0,
          exams_breakdown: examsBreakdown
        });
      }

      // Sort: teachers with exam data first (by average desc), then those without
      teacherMetrics.sort((a, b) => {
        if (a.total_exams > 0 && b.total_exams === 0) return -1;
        if (a.total_exams === 0 && b.total_exams > 0) return 1;
        return b.average_score - a.average_score;
      });

      setTeachers(teacherMetrics);
    } catch (err) {
      console.error('[TeacherPerformance] Error:', err);
      setDebugInfo(`Error: ${err}`);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = teachers.filter(t => t.teacher_name.toLowerCase().includes(search.toLowerCase()));

  const teachersWithData = teachers.filter(t => t.total_exams > 0);
  const schoolAvg = teachersWithData.length > 0 ? teachersWithData.reduce((acc, t) => acc + t.average_score, 0) / teachersWithData.length : 0;
  const topPerformer = teachersWithData.length > 0 ? teachersWithData[0] : null;
  const needsAttention = teachersWithData.filter(t => t.average_score < 50).length;

  const getScoreColor = (score: number) => {
    if (score >= 75) return '#16A34A';
    if (score >= 50) return '#D97706';
    return '#DC2626';
  };

  return (
    <div className="dashboard-container">
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Teacher Performance</h2>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>Analyze teacher effectiveness based on student exam results</p>
        </div>
      </div>

      {/* Debug info — helps diagnose data issues */}
      {debugInfo && (
        <div style={{ padding: '8px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 11, color: '#64748B', marginBottom: 12 }}>
          📊 Data: {debugInfo}
        </div>
      )}

      {/* Stats */}
      <div className="three-col-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        {[
          { label: 'Total Teachers', value: teachers.length, color: '#1D4ED8', bg: '#EFF6FF', border: '#DBEAFE' },
          { label: 'School Average', value: teachersWithData.length > 0 ? `${schoolAvg.toFixed(1)}%` : '—', color: '#16A34A', bg: '#F0FDF4', border: '#DCFCE7' },
          { label: 'Top Performer', value: topPerformer?.teacher_name?.split(' ')[0] || '—', color: '#6D28D9', bg: '#F5F3FF', border: '#EDE9FE' },
          { label: 'Needs Attention (<50%)', value: needsAttention, color: '#DC2626', bg: '#FEF2F2', border: '#FEE2E2' },
        ].map((s, i) => (
          <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '16px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{s.label}</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {loading ? <span style={{ display: 'inline-block', width: 32, height: 28, background: 'rgba(0,0,0,0.08)', borderRadius: 6 }} /> : s.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 300 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
        <input type="text" placeholder="Search teacher..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '10px 14px 10px 36px', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13, outline: 'none', background: 'white' }} />
      </div>

      <div className="list-table-container">
        {/* Header */}
        <div style={{ padding: '12px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 10 }}>
          {['Teacher', 'Avg Score', 'Pass Rate', 'Exams', 'Students', ''].map((h) => (
            <p key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{h}</p>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map(i => <div key={i} style={{ height: 52, background: '#F8FAFC', borderRadius: 8 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 22 }}>📊</div>
            <p style={{ fontWeight: 700, color: '#1E293B', fontSize: 15, margin: 0 }}>No performance data found</p>
            <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Ensure teachers have subject assignments and exams have marks entered</p>
          </div>
        ) : filtered.map((t, idx) => (
          <div key={t.teacher_id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
            {/* Main row */}
            <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: t.is_class_teacher ? 'linear-gradient(135deg, #065F46, #059669)' : 'linear-gradient(135deg, #1E3A8A, #3B82F6)',
                  color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0
                }}>
                  {t.teacher_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#0F172A', margin: 0 }}>{t.teacher_name}</p>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                    background: t.is_class_teacher ? '#DCFCE7' : '#DBEAFE',
                    color: t.is_class_teacher ? '#15803D' : '#1D4ED8',
                    letterSpacing: '0.03em', display: 'inline-block', marginTop: 4
                  }}>
                    {t.is_class_teacher ? '🏫 Class Teacher' : '📚 Subject Teacher'}
                  </span>
                </div>
              </div>

              {/* Avg Score */}
              <div>
                {t.total_exams > 0 ? (
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 800, color: getScoreColor(t.average_score), margin: 0 }}>
                      {t.average_score.toFixed(1)}%
                    </p>
                    <div style={{ width: '100%', height: 4, background: '#E2E8F0', borderRadius: 99, marginTop: 4 }}>
                      <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(t.average_score, 100)}%`, background: getScoreColor(t.average_score), transition: 'width 0.5s' }} />
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: '#CBD5E1', margin: 0 }}>No data</p>
                )}
              </div>

              {/* Pass Rate */}
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: t.total_exams > 0 ? '#334155' : '#CBD5E1', margin: 0 }}>
                  {t.total_exams > 0 ? `${t.pass_rate.toFixed(1)}%` : 'No data'}
                </p>
              </div>

              {/* Exams count */}
              <div><p style={{ fontSize: 14, fontWeight: 600, color: '#64748B', margin: 0 }}>{t.total_exams}</p></div>

              {/* Students count */}
              <div><p style={{ fontSize: 14, fontWeight: 600, color: '#64748B', margin: 0 }}>{t.total_students}</p></div>

              {/* View Details */}
              <div>
                {t.total_exams > 0 ? (
                  <button
                    onClick={() => setExpandedTeacher(expandedTeacher === t.teacher_id ? null : t.teacher_id)}
                    style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'white', color: '#0F172A', cursor: 'pointer' }}>
                    {expandedTeacher === t.teacher_id ? 'Hide Details' : 'View Details'}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: '#CBD5E1' }}>No exams</span>
                )}
              </div>
            </div>

            {/* Expanded drilldown */}
            {expandedTeacher === t.teacher_id && t.exams_breakdown.length > 0 && (
              <div style={{ background: '#F8FAFC', padding: '20px', borderTop: '1px solid #F1F5F9' }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Per-Exam Breakdown ({t.exams_breakdown.length} exams)
                </h4>
                <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
                      <tr>
                        {['Exam', 'Subject', 'Class', 'Total Marks', 'Students', 'Avg Score', 'Pass Rate', 'Highest', 'Lowest'].map(th => (
                          <th key={th} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{th}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.exams_breakdown.map(eb => (
                        <tr key={eb.exam_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{eb.name}</td>
                          <td style={{ padding: '10px 14px', fontSize: 13, color: '#334155' }}>{eb.subject_name}</td>
                          <td style={{ padding: '10px 14px', fontSize: 13, color: '#334155' }}>{eb.class_section}</td>
                          <td style={{ padding: '10px 14px', fontSize: 13, color: '#64748B' }}>{eb.total_marks}</td>
                          <td style={{ padding: '10px 14px', fontSize: 13, color: '#64748B' }}>{eb.total_students}</td>
                          <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: getScoreColor(eb.avg_score) }}>{eb.avg_score.toFixed(1)}%</td>
                          <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#475569' }}>{eb.pass_rate.toFixed(1)}%</td>
                          <td style={{ padding: '10px 14px', fontSize: 13, color: '#16A34A', fontWeight: 600 }}>{eb.highest}</td>
                          <td style={{ padding: '10px 14px', fontSize: 13, color: '#DC2626', fontWeight: 600 }}>{eb.lowest}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
