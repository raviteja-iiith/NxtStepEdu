'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { analyzeStudent } from '@/lib/performance/engine';
import type { StudentAnalysis, PerformanceCategory } from '@/lib/performance/types';
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';

const CAT_COLOR: Record<PerformanceCategory, { text: string; bg: string; border: string }> = {
  'Excellent':          { text: '#065F46', bg: '#ECFDF5', border: '#6EE7B7' },
  'Good':               { text: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD' },
  'Average':            { text: '#D97706', bg: '#FFFBEB', border: '#FCD34D' },
  'Needs Improvement':  { text: '#EA580C', bg: '#FFF7ED', border: '#FCA5A5' },
  'Very Weak':          { text: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
};

const TREND_ICON: Record<string, string> = {
  'Significant Improvement': '🚀', 'Gradual Improvement': '📈',
  'Consistent Performance': '➡️', 'Declining Performance': '📉', 'No Previous Data': '🆕',
};

export default function ParentAnalysisPage() {
  const router = useRouter();
  const supabase = createClient();
  const [analysis, setAnalysis] = useState<StudentAnalysis | null>(null);
  const [rawMarks, setRawMarks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'charts' | 'remarks'>('overview');

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) { setError('Not logged in.'); setLoading(false); return; }

      // Get parent's linked child
      const { data: links } = await supabase
        .from('student_parent_links')
        .select('student_id, students(full_name, section_id, sections(name), classes(name))')
        .eq('parent_id', userId)
        .limit(1);

      if (!links || links.length === 0) { setError('No linked student found.'); setLoading(false); return; }

      const link = links[0] as any;
      const studentId = link.student_id;
      const studentName = link.students?.full_name || 'Student';
      const className = link.students?.classes?.name || '';
      const sectionName = link.students?.sections?.name || '';

      const { data: marks } = await supabase
        .from('marks')
        .select('marks_obtained, is_absent, exam_id, exams(id, name, exam_type, exam_date, total_marks, subjects(id, name))')
        .eq('student_id', studentId)
        .order('entered_at', { ascending: false });

      const raw = (marks || []).filter((m: any) => m.exams).map((m: any) => ({
        marks_obtained: m.marks_obtained, is_absent: m.is_absent,
        exam_id: m.exams.id, exam_name: m.exams.name, exam_type: m.exams.exam_type,
        exam_date: m.exams.exam_date, total_marks: m.exams.total_marks,
        subject_id: m.exams.subjects?.id || m.exam_id, subject_name: m.exams.subjects?.name || 'Unknown',
      }));

      const result = analyzeStudent(studentName, className, sectionName, raw);
      setRawMarks(raw);
      setAnalysis(result);
    } catch (e: any) { setError(e.message || 'Unexpected error.'); }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAnalysis(); }, [fetchAnalysis]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {[120, 90, 300].map((h, i) => <div key={i} style={{ height: h, background: '#F1F5F9', borderRadius: 16 }} />)}
    </div>
  );

  if (error || !analysis) return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <p style={{ fontSize: 40 }}>😕</p>
      <p style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{error || 'No analysis available'}</p>
      <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Marks need to be entered by teachers for the analysis to appear.</p>
      <button onClick={() => router.back()} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#7C3AED', color: 'white', fontWeight: 700, cursor: 'pointer' }}>← Go Back</button>
    </div>
  );

  const cat = CAT_COLOR[analysis.overallCategory];
  const barData = analysis.subjects.map(s => ({ name: s.subject.length > 10 ? s.subject.slice(0,10)+'…' : s.subject, Marks: s.currentMark, Max: s.currentMaxMark, Percentage: s.percentage }));
  const trendData = analysis.subjects.map(s => ({ name: s.subject.length > 10 ? s.subject.slice(0,10)+'…' : s.subject, 'Current %': s.percentage, 'Prev Avg %': s.previousAverage ?? 0 }));
  const improvData = analysis.subjects.map(s => ({ name: s.subject.length > 10 ? s.subject.slice(0,10)+'…' : s.subject, improvement: s.improvement ?? 0 }));
  const radarData = analysis.subjects.map(s => ({ subject: s.subject.length > 8 ? s.subject.slice(0,8)+'…' : s.subject, score: s.percentage }));

  // ── Timeline: all exams chronologically, scaled to % ───────────────
  const allSubjectNames = [...new Set(rawMarks.filter(m => !m.is_absent && m.marks_obtained !== null).map((m: any) => m.subject_name as string))];
  const allExams = [...new Map(rawMarks.filter((m: any) => !m.is_absent && m.marks_obtained !== null).map((m: any) => [m.exam_id, { exam_id: m.exam_id, exam_name: m.exam_name, exam_date: m.exam_date }])).values()]
    .sort((a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime());
  const timelineData = allExams.map(exam => {
    const point: Record<string, any> = {
      label: (exam.exam_name.length > 14 ? exam.exam_name.slice(0, 14) + '…' : exam.exam_name) + ' · ' + new Date(exam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    };
    allSubjectNames.forEach(subj => {
      const m = rawMarks.find((r: any) => r.exam_id === exam.exam_id && r.subject_name === subj && !r.is_absent && r.marks_obtained !== null);
      if (m) point[subj] = Math.round((m.marks_obtained / m.total_marks) * 1000) / 10;
    });
    return point;
  });
  const TIMELINE_COLORS = ['#6366F1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'];

  const TABS = [{ key: 'overview' as const, label: '📊 Overview' }, { key: 'charts' as const, label: '📈 Charts' }, { key: 'remarks' as const, label: '💬 Remarks' }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Page Header */}
      <div style={{ paddingBottom: 20, borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Performance Analysis</h2>
          <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>Deep academic insights for your child</p>
        </div>
        <button onClick={() => router.back()} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>← Back to Academics</button>
      </div>

      {/* Student Banner */}
      <div style={{ background: 'linear-gradient(135deg, #4C1D95, #7C3AED)', borderRadius: 20, padding: '28px 32px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'white', fontWeight: 900, flexShrink: 0 }}>
          {analysis.studentName.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 22, fontWeight: 900, color: 'white', margin: 0 }}>{analysis.studentName}</h3>
          <p style={{ fontSize: 14, color: '#DDD6FE', margin: '4px 0 0', fontWeight: 600 }}>{analysis.className} · Section {analysis.sectionName}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 12px', borderRadius: 99, background: cat.bg, color: cat.text, fontSize: 12, fontWeight: 700, border: `1px solid ${cat.border}` }}>{analysis.overallCategory}</span>
            <span style={{ padding: '4px 12px', borderRadius: 99, background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 12, fontWeight: 600 }}>{analysis.subjects.length} Subjects</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 13, color: '#DDD6FE', margin: 0, fontWeight: 600 }}>OVERALL</p>
          <p style={{ fontSize: 48, fontWeight: 900, color: 'white', margin: '4px 0 0', lineHeight: 1 }}>{analysis.overallPercentage}%</p>
        </div>
      </div>

      {/* Summary */}
      <div style={{ background: 'white', border: `1px solid ${cat.border}`, borderRadius: 16, padding: '24px 28px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>📋</span>
          <h4 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0 }}>Overall Academic Summary</h4>
          <span style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 99, background: cat.bg, color: cat.text, fontSize: 11, fontWeight: 700, border: `1px solid ${cat.border}` }}>{analysis.overallCategory}</span>
        </div>
        <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.75, margin: 0 }}>{analysis.overallSummary}</p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        <div style={{ background: '#ECFDF5', borderRadius: 14, padding: '18px 20px', border: '1px solid #6EE7B733' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Best Subject</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', margin: '6px 0 0' }}>{analysis.bestSubject}</p>
        </div>
        <div style={{ background: '#FEF2F2', borderRadius: 14, padding: '18px 20px', border: '1px solid #FECACA33' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Needs More Focus</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', margin: '6px 0 0' }}>{analysis.weakestSubject}</p>
        </div>
        <div style={{ background: '#F5F3FF', borderRadius: 14, padding: '18px 20px', border: '1px solid #DDD6FE33' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Improving Subjects</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', margin: '6px 0 0' }}>{analysis.improvingSubjectsCount}</p>
        </div>
        <div style={{ background: '#FFFBEB', borderRadius: 14, padding: '18px 20px', border: '1px solid #FCD34D33' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Needs Attention</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', margin: '6px 0 0' }}>{analysis.decliningSubjectsCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: '#F1F5F9' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ flex: 1, padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: activeTab === t.key ? 'white' : 'transparent', color: activeTab === t.key ? '#7C3AED' : '#64748B',
              boxShadow: activeTab === t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {analysis.subjects.map(s => {
            const sc = CAT_COLOR[s.category];
            const impColor = (s.improvement ?? 0) > 0 ? '#16A34A' : (s.improvement ?? 0) < 0 ? '#DC2626' : '#64748B';
            return (
              <div key={s.subjectId} style={{ background: 'white', border: `1px solid ${sc.border}`, borderRadius: 14, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8', width: 24 }}>#{s.rank}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0 }}>{s.subject}</p>
                    <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>{TREND_ICON[s.trend]} {s.trend}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 22, fontWeight: 900, color: sc.text, margin: 0 }}>{s.percentage}%</p>
                    <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>{s.currentMark}/{s.currentMaxMark}</p>
                  </div>
                  <span style={{ padding: '4px 12px', borderRadius: 99, background: sc.bg, color: sc.text, fontSize: 12, fontWeight: 700, border: `1px solid ${sc.border}` }}>{s.category}</span>
                </div>
                {s.previousAverage != null && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F1F5F9', display: 'flex', gap: 20 }}>
                    <div>
                      <p style={{ fontSize: 11, color: '#94A3B8', margin: 0, fontWeight: 600 }}>PREVIOUS AVG</p>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#64748B', margin: '2px 0 0' }}>{s.previousAverage}%</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: '#94A3B8', margin: 0, fontWeight: 600 }}>CHANGE</p>
                      <p style={{ fontSize: 14, fontWeight: 700, color: impColor, margin: '2px 0 0' }}>
                        {s.improvement != null ? `${s.improvement > 0 ? '+' : ''}${s.improvement}pp` : '—'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Charts */}
      {activeTab === 'charts' && analysis.subjects.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Marks Journey Timeline */}
          <div style={{ background: 'linear-gradient(135deg,#4C1D95,#7C3AED)', border: '1px solid #6D28D9', borderRadius: 18, padding: '24px 28px' }}>
            <h4 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: '0 0 6px' }}>📈 My Child's Marks Journey — All Exams</h4>
            <p style={{ fontSize: 12, color: '#DDD6FE', margin: '0 0 20px' }}>Scores scaled to % of max marks for fair comparison · from first exam to latest</p>
            {timelineData.length < 1 ? (
              <p style={{ color: '#A78BFA', textAlign: 'center', padding: '32px 0' }}>No exam history yet. Marks will appear here once entered by teachers.</p>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={timelineData} margin={{ top: 5, right: 24, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#DDD6FE' }} angle={-35} textAnchor="end" interval={0} height={70} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#DDD6FE' }} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ background: '#4C1D95', border: '1px solid #6D28D9', borderRadius: 10, fontSize: 13, color: 'white' }} formatter={(val: any, name: string | undefined) => [`${val}%`, name ?? '']} labelStyle={{ color: '#DDD6FE', fontWeight: 700, marginBottom: 6 }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16, color: '#E9D5FF' }} />
                  <ReferenceLine y={75} stroke="#4ADE80" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: '75% Good', fill: '#4ADE80', fontSize: 11 }} />
                  <ReferenceLine y={40} stroke="#F87171" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: '40% Pass', fill: '#F87171', fontSize: 11 }} />
                  {allSubjectNames.map((subj, i) => (
                    <Line key={subj} type="monotone" dataKey={subj} stroke={TIMELINE_COLORS[i % TIMELINE_COLORS.length]} strokeWidth={2.5} dot={{ r: 5, fill: TIMELINE_COLORS[i % TIMELINE_COLORS.length] }} activeDot={{ r: 7, strokeWidth: 0 }} connectNulls={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px' }}>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>📊 Subject-wise Percentage</h4>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis domain={[0,100]} tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip formatter={(val) => [`${val}%`]} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                <ReferenceLine y={75} stroke="#10B981" strokeDasharray="5 5" label={{ value: 'Good', fontSize: 11, fill: '#10B981' }} />
                <Bar dataKey="Percentage" radius={[6,6,0,0]}>
                  {barData.map((entry, i) => <Cell key={i} fill={entry.Percentage >= 75 ? '#10B981' : entry.Percentage >= 40 ? '#F59E0B' : '#EF4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px' }}>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>📈 Marks Obtained vs Maximum</h4>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                <Bar dataKey="Max" fill="#E2E8F0" radius={[4,4,0,0]} name="Max Marks" />
                <Bar dataKey="Marks" fill="#7C3AED" radius={[4,4,0,0]} name="Obtained" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px' }}>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>📉 Trend (Current vs Previous Average)</h4>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis domain={[0,100]} tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                <Line type="monotone" dataKey="Current %" stroke="#7C3AED" strokeWidth={3} dot={{ r: 5 }} />
                <Line type="monotone" dataKey="Prev Avg %" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px' }}>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>🔼 Improvement Score</h4>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={improvData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip formatter={(val) => [`${Number(val) > 0 ? '+' : ''}${val}pp`]} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                <ReferenceLine y={0} stroke="#64748B" />
                <Bar dataKey="improvement" radius={[4,4,0,0]}>
                  {improvData.map((entry, i) => <Cell key={i} fill={entry.improvement > 0 ? '#10B981' : entry.improvement < 0 ? '#EF4444' : '#94A3B8'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {analysis.subjects.length >= 3 && (
            <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px' }}>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>🕸️ Strength Radar</h4>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#E2E8F0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#475569' }} />
                  <Radar dataKey="score" stroke="#7C3AED" fill="#7C3AED" fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip formatter={(val) => [`${val}%`]} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Remarks */}
      {activeTab === 'remarks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {analysis.subjects.map(s => {
            const sc = CAT_COLOR[s.category];
            return (
              <div key={s.subjectId} style={{ background: 'white', border: `1px solid ${sc.border}`, borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <h4 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0, flex: 1 }}>{s.subject}</h4>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>{s.category}</span>
                  <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>{TREND_ICON[s.trend]} {s.trend}</span>
                  <span style={{ fontSize: 15, fontWeight: 900, color: sc.text }}>{s.percentage}%</span>
                </div>
                <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.75, margin: 0 }}>{s.remark}</p>
              </div>
            );
          })}
          {analysis.subjects.length === 0 && (
            <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 28 }}>📭</p>
              <p style={{ fontWeight: 600, color: '#475569' }}>No marks data available yet.</p>
              <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Ask your child's teacher to enter marks for exams.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
