'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { analyzeStudent } from '@/lib/performance/engine';
import type { StudentAnalysis, PerformanceCategory } from '@/lib/performance/types';
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import { ChartWrapper } from '@/components/ChartWrapper';

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

export default function TeacherStudentAnalysisPage() {
  const { id } = useParams<{ id: string }>();
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
      const { data: student, error: sErr } = await supabase
        .from('students').select('id, full_name, classes(name), sections(name)').eq('id', id).single();
      if (sErr || !student) { setError('Student not found.'); setLoading(false); return; }

      const { data: marks } = await supabase
        .from('marks')
        .select('marks_obtained, is_absent, exam_id, exams(id, name, exam_type, exam_date, total_marks, subjects(id, name))')
        .eq('student_id', id).order('entered_at', { ascending: false });

      const raw = (marks || []).filter((m: any) => m.exams).map((m: any) => ({
        marks_obtained: m.marks_obtained, is_absent: m.is_absent,
        exam_id: m.exams.id, exam_name: m.exams.name, exam_type: m.exams.exam_type,
        exam_date: m.exams.exam_date, total_marks: m.exams.total_marks,
        subject_id: m.exams.subjects?.id || m.exam_id, subject_name: m.exams.subjects?.name || 'Unknown',
      }));

      const result = analyzeStudent(
        (student as any).full_name, (student as any).classes?.name || '', (student as any).sections?.name || '', raw
      );
      setRawMarks(raw);
      setAnalysis(result);
    } catch (e: any) { setError(e.message || 'Unexpected error.'); }
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => { fetchAnalysis(); }, [fetchAnalysis]);

  if (loading) return (
    <div className="dashboard-container">
      {[120, 90, 300].map((h, i) => <div key={i} style={{ height: h, background: '#F1F5F9', borderRadius: 16 }} />)}
    </div>
  );

  if (error || !analysis) return (
    <div style={{ maxWidth: 700, margin: '80px auto', textAlign: 'center' }}>
      <p style={{ fontSize: 40 }}>😕</p>
      <p style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{error || 'No data available'}</p>
      <button onClick={() => router.back()} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#0F766E', color: 'white', fontWeight: 700, cursor: 'pointer' }}>← Go Back</button>
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
    <div className="dashboard-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => router.back()} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>← Back</button>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', margin: 0 }}>Student Performance Analysis</h2>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: '3px 0 0' }}>Rule-based academic insight report</p>
        </div>
      </div>

      {/* Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0F766E 0%, #0F172A 100%)', borderRadius: 20, padding: '28px 32px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'white', fontWeight: 900, flexShrink: 0 }}>
          {analysis.studentName.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 22, fontWeight: 900, color: 'white', margin: 0 }}>{analysis.studentName}</h3>
          <p style={{ fontSize: 14, color: '#5EEAD4', margin: '4px 0 0', fontWeight: 600 }}>{analysis.className} · Section {analysis.sectionName}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <span style={{ padding: '4px 12px', borderRadius: 99, background: cat.bg, color: cat.text, fontSize: 12, fontWeight: 700, border: `1px solid ${cat.border}` }}>{analysis.overallCategory}</span>
            <span style={{ padding: '4px 12px', borderRadius: 99, background: 'rgba(255,255,255,0.12)', color: 'white', fontSize: 12, fontWeight: 600 }}>{analysis.subjects.length} Subjects</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 13, color: '#5EEAD4', margin: 0, fontWeight: 600 }}>OVERALL</p>
          <p style={{ fontSize: 48, fontWeight: 900, color: 'white', margin: '4px 0 0', lineHeight: 1 }}>{analysis.overallPercentage}%</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-cards-container">
        {[
          { label: 'Best Subject', value: analysis.bestSubject, color: '#059669', bg: '#ECFDF5' },
          { label: 'Weakest Subject', value: analysis.weakestSubject, color: '#DC2626', bg: '#FEF2F2' },
          { label: 'Improving', value: analysis.improvingSubjectsCount, color: '#7C3AED', bg: '#F5F3FF' },
          { label: 'Declining', value: analysis.decliningSubjectsCount, color: '#D97706', bg: '#FFFBEB' },
        ].map((s, i) => (
          <div key={i} style={{ background: s.bg, borderRadius: 14, padding: '18px 20px', border: `1px solid ${s.color}33` }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', margin: '6px 0 0' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div style={{ background: 'white', border: `1px solid ${cat.border}`, borderRadius: 16, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>📋</span>
          <h4 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0 }}>Overall Academic Summary</h4>
        </div>
        <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.75, margin: 0 }}>{analysis.overallSummary}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: '#F1F5F9', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '9px 20px', borderRadius: 9, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: activeTab === t.key ? 'white' : 'transparent', color: activeTab === t.key ? '#0F766E' : '#64748B',
              boxShadow: activeTab === t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 2fr 80px 90px 90px 90px 140px', padding: '10px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', gap: 10 }}>
            {['#', 'Subject', 'Marks', 'Score', 'Prev Avg', 'Δ Change', 'Status'].map((h, i) => (
              <p key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, textAlign: i >= 2 ? 'center' : 'left' }}>{h}</p>
            ))}
          </div>
          {analysis.subjects.map((s, idx) => {
            const sc = CAT_COLOR[s.category];
            const impColor = (s.improvement ?? 0) > 0 ? '#16A34A' : (s.improvement ?? 0) < 0 ? '#DC2626' : '#64748B';
            return (
              <div key={s.subjectId} style={{ display: 'grid', gridTemplateColumns: '40px 2fr 80px 90px 90px 90px 140px', padding: '14px 20px', borderBottom: idx < analysis.subjects.length - 1 ? '1px solid #F8FAFC' : 'none', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8', textAlign: 'center' }}>#{s.rank}</span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>{s.subject}</p>
                  <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{TREND_ICON[s.trend]} {s.trend}</p>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0, textAlign: 'center' }}>{s.currentMark}/{s.currentMaxMark}</p>
                <p style={{ fontSize: 15, fontWeight: 800, color: sc.text, margin: 0, textAlign: 'center' }}>{s.percentage}%</p>
                <p style={{ fontSize: 14, color: '#64748B', margin: 0, textAlign: 'center' }}>{s.previousAverage != null ? `${s.previousAverage}%` : '—'}</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: impColor, margin: 0, textAlign: 'center' }}>
                  {s.improvement != null ? `${s.improvement > 0 ? '+' : ''}${s.improvement}pp` : '—'}
                </p>
                <span style={{ padding: '4px 10px', borderRadius: 99, background: sc.bg, color: sc.text, fontSize: 11, fontWeight: 700, border: `1px solid ${sc.border}`, textAlign: 'center' }}>{s.category}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Charts tab */}
      {activeTab === 'charts' && analysis.subjects.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', minWidth: 0 }}>

          {/* Marks Journey Timeline */}
          <div style={{ background: 'linear-gradient(135deg,#0F172A,#0F766E)', border: '1px solid #134E4A', borderRadius: 18, padding: '24px 28px', width: '100%', minWidth: 0 }}>
            <h4 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: '0 0 6px' }}>📈 Marks Journey — All Exams (Scaled to %)</h4>
            <p style={{ fontSize: 12, color: '#5EEAD4', margin: '0 0 20px' }}>Each subject scaled as % of max marks · first exam → latest</p>
            {timelineData.length < 1 ? (
              <p style={{ color: '#64748B', textAlign: 'center', padding: '32px 0' }}>No exam history yet</p>
            ) : (
              <ChartWrapper height={340}>
                <LineChart data={timelineData} margin={{ top: 5, right: 24, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5EEAD4' }} angle={-35} textAnchor="end" interval={0} height={70} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#5EEAD4' }} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 10, fontSize: 13, color: 'white' }} formatter={(val: any, name: any) => [`${val}%`, name ?? '']} labelStyle={{ color: '#93C5FD', fontWeight: 700, marginBottom: 6 }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16, color: '#CBD5E1' }} />
                  <ReferenceLine y={75} stroke="#10B981" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: '75%', fill: '#10B981', fontSize: 11 }} />
                  <ReferenceLine y={40} stroke="#EF4444" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: '40%', fill: '#EF4444', fontSize: 11 }} />
                  {allSubjectNames.map((subj, i) => (
                    <Line key={subj} type="monotone" dataKey={subj} stroke={TIMELINE_COLORS[i % TIMELINE_COLORS.length]} strokeWidth={2.5} dot={{ r: 5, fill: TIMELINE_COLORS[i % TIMELINE_COLORS.length] }} activeDot={{ r: 7, strokeWidth: 0 }} connectNulls={false} />
                  ))}
                </LineChart>
              </ChartWrapper>
            )}
          </div>

          <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px', width: '100%', minWidth: 0 }}>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>📊 Subject Marks (Current vs Maximum)</h4>
            <ChartWrapper height={260}>
              <BarChart data={barData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                <Bar dataKey="Max" fill="#E2E8F0" radius={[4,4,0,0]} name="Max Marks" />
                <Bar dataKey="Marks" fill="#0F766E" radius={[4,4,0,0]} name="Obtained" />
              </BarChart>
            </ChartWrapper>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, width: '100%', minWidth: 0 }}>
            <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px', width: '100%', minWidth: 0 }}>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>📈 Percentage Scores</h4>
              <ChartWrapper height={240}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis domain={[0,100]} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip formatter={(val) => [`${val}%`]} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                  <ReferenceLine y={75} stroke="#10B981" strokeDasharray="5 5" />
                  <Bar dataKey="Percentage" radius={[4,4,0,0]}>
                    {barData.map((entry, i) => <Cell key={i} fill={entry.Percentage >= 75 ? '#10B981' : entry.Percentage >= 40 ? '#F59E0B' : '#EF4444'} />)}
                  </Bar>
                </BarChart>
              </ChartWrapper>
            </div>
            <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px', width: '100%', minWidth: 0 }}>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>🔼 Improvement Score</h4>
              <ChartWrapper height={240}>
                <BarChart data={improvData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip formatter={(val) => [`${Number(val) > 0 ? '+' : ''}${val}pp`]} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                  <ReferenceLine y={0} stroke="#64748B" />
                  <Bar dataKey="improvement" radius={[4,4,0,0]}>
                    {improvData.map((entry, i) => <Cell key={i} fill={entry.improvement > 0 ? '#10B981' : entry.improvement < 0 ? '#EF4444' : '#94A3B8'} />)}
                  </Bar>
                </BarChart>
              </ChartWrapper>
            </div>
          </div>
          <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px', width: '100%', minWidth: 0 }}>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>📉 Trend (Current vs Previous Average)</h4>
            <ChartWrapper height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis domain={[0,100]} tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                <Line type="monotone" dataKey="Current %" stroke="#0F766E" strokeWidth={3} dot={{ r: 5 }} />
                <Line type="monotone" dataKey="Prev Avg %" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
              </LineChart>
            </ChartWrapper>
          </div>
          {analysis.subjects.length >= 3 && (
            <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px', width: '100%', minWidth: 0 }}>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>🕸️ Performance Radar</h4>
              <ChartWrapper height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#E2E8F0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#475569' }} />
                  <Radar dataKey="score" stroke="#0F766E" fill="#0F766E" fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip formatter={(val) => [`${val}%`]} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                </RadarChart>
              </ChartWrapper>
            </div>
          )}
        </div>
      )}

      {/* Remarks tab */}
      {activeTab === 'remarks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {analysis.subjects.map(s => {
            const sc = CAT_COLOR[s.category];
            return (
              <div key={s.subjectId} style={{ background: 'white', border: `1px solid ${sc.border}`, borderRadius: 16, padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <h4 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0, flex: 1 }}>{s.subject}</h4>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>{s.category}</span>
                  <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>{TREND_ICON[s.trend]} {s.trend}</span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: sc.text }}>{s.percentage}%</span>
                </div>
                <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.75, margin: 0 }}>{s.remark}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
