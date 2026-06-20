'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { analyzeStudent } from '@/lib/performance/engine';
import type { StudentAnalysis, PerformanceCategory } from '@/lib/performance/types';
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  Cell
} from 'recharts';
import { ChartWrapper } from '@/components/ChartWrapper';

// ── Helpers ──────────────────────────────────────────────────────────────────
const CAT_COLOR: Record<PerformanceCategory, { text: string; bg: string; border: string }> = {
  'Excellent':          { text: '#065F46', bg: '#ECFDF5', border: '#6EE7B7' },
  'Good':               { text: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD' },
  'Average':            { text: '#D97706', bg: '#FFFBEB', border: '#FCD34D' },
  'Needs Improvement':  { text: '#EA580C', bg: '#FFF7ED', border: '#FCA5A5' },
  'Very Weak':          { text: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
};

const TREND_ICON: Record<string, string> = {
  'Significant Improvement': '🚀',
  'Gradual Improvement':     '📈',
  'Consistent Performance':  '➡️',
  'Declining Performance':   '📉',
  'No Previous Data':        '🆕',
};

const CHART_COLORS = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];

function StatCard({ label, value, sub, color, bg }: { label: string; value: string | number; sub?: string; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 14, padding: '18px 20px', border: `1px solid ${color}33` }}>
      <p style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', margin: '6px 0 0' }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0', fontWeight: 500 }}>{sub}</p>}
    </div>
  );
}

export default function StudentAnalysisPage() {
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
      // Fetch student details
      const { data: student, error: sErr } = await supabase
        .from('students')
        .select('id, full_name, classes(name), sections(name)')
        .eq('id', id)
        .single();
      if (sErr || !student) { setError('Student not found.'); setLoading(false); return; }

      // Fetch all marks with exam + subject info
      const { data: marks, error: mErr } = await supabase
        .from('marks')
        .select('marks_obtained, is_absent, exam_id, exams(id, name, exam_type, exam_date, total_marks, subjects(id, name))')
        .eq('student_id', id)
        .order('entered_at', { ascending: false });

      if (mErr) { setError('Could not load marks.'); setLoading(false); return; }

      const raw = (marks || [])
        .filter((m: any) => m.exams)
        .map((m: any) => ({
          marks_obtained: m.marks_obtained,
          is_absent: m.is_absent,
          exam_id: m.exams.id,
          exam_name: m.exams.name,
          exam_type: m.exams.exam_type,
          exam_date: m.exams.exam_date,
          total_marks: m.exams.total_marks,
          subject_id: m.exams.subjects?.id || m.exam_id,
          subject_name: m.exams.subjects?.name || 'Unknown',
        }));

      const result = analyzeStudent(
        (student as any).full_name,
        (student as any).classes?.name || '',
        (student as any).sections?.name || '',
        raw
      );
      setRawMarks(raw);
      setAnalysis(result);
    } catch (e: any) {
      setError(e.message || 'Unexpected error.');
    }
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => { fetchAnalysis(); }, [fetchAnalysis]);

  if (loading) return (
    <div className="dashboard-container">
      <div style={{ height: 120, background: '#F1F5F9', borderRadius: 16 }} />
      <div className="stat-cards-container">
        {[1,2,3,4].map(i => <div key={i} style={{ height: 90, background: '#F1F5F9', borderRadius: 14 }} />)}
      </div>
      <div style={{ height: 300, background: '#F1F5F9', borderRadius: 16 }} />
    </div>
  );

  if (error || !analysis) return (
    <div style={{ maxWidth: 700, margin: '80px auto', textAlign: 'center' }}>
      <p style={{ fontSize: 40 }}>😕</p>
      <p style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{error || 'No data available'}</p>
      <button onClick={() => router.back()} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#1E3A8A', color: 'white', fontWeight: 700, cursor: 'pointer' }}>← Go Back</button>
    </div>
  );

  const cat = CAT_COLOR[analysis.overallCategory];

  // Chart data
  const barData = analysis.subjects.map(s => ({
    name: s.subject.length > 10 ? s.subject.slice(0, 10) + '…' : s.subject,
    fullName: s.subject,
    Marks: s.currentMark,
    Max: s.currentMaxMark,
    Percentage: s.percentage,
  }));

  const trendData = analysis.subjects.map(s => ({
    name: s.subject.length > 10 ? s.subject.slice(0, 10) + '…' : s.subject,
    'Current %': s.percentage,
    'Prev Avg %': s.previousAverage ?? 0,
  }));

  const improvData = analysis.subjects.map(s => ({
    name: s.subject.length > 10 ? s.subject.slice(0, 10) + '…' : s.subject,
    improvement: s.improvement ?? 0,
  }));

  const radarData = analysis.subjects.map(s => ({
    subject: s.subject.length > 8 ? s.subject.slice(0, 8) + '…' : s.subject,
    score: s.percentage,
  }));

  // ── Timeline chart: all exams chronologically, scaled to % ──────────────
  const allSubjectNames = [...new Set(rawMarks.filter(m => !m.is_absent && m.marks_obtained !== null).map((m: any) => m.subject_name as string))];
  const allExams = [
    ...new Map(
      rawMarks
        .filter((m: any) => !m.is_absent && m.marks_obtained !== null)
        .map((m: any) => [m.exam_id, { exam_id: m.exam_id, exam_name: m.exam_name, exam_date: m.exam_date }])
    ).values(),
  ].sort((a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime());

  const timelineData = allExams.map(exam => {
    const point: Record<string, any> = {
      label: (exam.exam_name.length > 14 ? exam.exam_name.slice(0, 14) + '…' : exam.exam_name)
        + ' · ' + new Date(exam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      examName: exam.exam_name,
      date: new Date(exam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }),
    };
    allSubjectNames.forEach(subj => {
      const m = rawMarks.find((r: any) => r.exam_id === exam.exam_id && r.subject_name === subj && !r.is_absent && r.marks_obtained !== null);
      if (m) point[subj] = Math.round((m.marks_obtained / m.total_marks) * 1000) / 10;
    });
    return point;
  });

  const TIMELINE_COLORS = ['#6366F1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#06B6D4'];

  const TABS = [
    { key: 'overview' as const, label: '📊 Overview' },
    { key: 'charts' as const, label: '📈 Charts' },
    { key: 'remarks' as const, label: '💬 Remarks' },
  ];

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <button onClick={() => router.back()} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>← Back</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', margin: 0 }}>Performance Analysis</h2>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: '3px 0 0' }}>Rule-based academic insight report</p>
        </div>
      </div>

      {/* Student Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)', borderRadius: 20, padding: '28px 32px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'white', fontWeight: 900, flexShrink: 0 }}>
          {analysis.studentName.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 22, fontWeight: 900, color: 'white', margin: 0 }}>{analysis.studentName}</h3>
          <p style={{ fontSize: 14, color: '#93C5FD', margin: '4px 0 0', fontWeight: 600 }}>
            {analysis.className} &nbsp;·&nbsp; Section {analysis.sectionName}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 12px', borderRadius: 99, background: cat.bg, color: cat.text, fontSize: 12, fontWeight: 700, border: `1px solid ${cat.border}` }}>
              {analysis.overallCategory}
            </span>
            <span style={{ padding: '4px 12px', borderRadius: 99, background: 'rgba(255,255,255,0.12)', color: 'white', fontSize: 12, fontWeight: 600 }}>
              {analysis.subjects.length} Subjects Analysed
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 13, color: '#93C5FD', margin: 0, fontWeight: 600 }}>OVERALL</p>
          <p style={{ fontSize: 48, fontWeight: 900, color: 'white', margin: '4px 0 0', lineHeight: 1 }}>{analysis.overallPercentage}%</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-cards-container">
        <StatCard label="Best Subject" value={analysis.bestSubject} color="#059669" bg="#ECFDF5" />
        <StatCard label="Weakest Subject" value={analysis.weakestSubject} color="#DC2626" bg="#FEF2F2" />
        <StatCard label="Improving Subjects" value={analysis.improvingSubjectsCount} sub="subjects trending up" color="#7C3AED" bg="#F5F3FF" />
        <StatCard label="Declining Subjects" value={analysis.decliningSubjectsCount} sub="subjects trending down" color="#D97706" bg="#FFFBEB" />
      </div>

      {/* Overall Summary Card */}
      <div style={{ background: 'white', border: `1px solid ${cat.border}`, borderRadius: 16, padding: '24px 28px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>📋</span>
          <h4 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: 0 }}>Overall Academic Summary</h4>
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: cat.bg, color: cat.text, border: `1px solid ${cat.border}` }}>{analysis.overallCategory}</span>
        </div>
        <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.75, margin: 0 }}>{analysis.overallSummary}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: '#F1F5F9', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '9px 20px', borderRadius: 9, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: activeTab === t.key ? 'white' : 'transparent',
              color: activeTab === t.key ? '#1E3A8A' : '#64748B',
              boxShadow: activeTab === t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
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

      {/* ── TAB: CHARTS ── */}
      {activeTab === 'charts' && analysis.subjects.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', minWidth: 0 }}>

          {/* ── TIMELINE: Marks Journey (all exams, scaled %) ── */}
          <div style={{ background: 'linear-gradient(135deg,#0F172A,#1E3A8A)', border: '1px solid #334155', borderRadius: 18, padding: '24px 28px', width: '100%', minWidth: 0 }}>
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>📈 Marks Journey — All Exams (Scaled to %)</h4>
              <p style={{ fontSize: 12, color: '#93C5FD', margin: '6px 0 0' }}>Each subject's score scaled as % of max marks · chronological order from first exam to latest</p>
            </div>
            {timelineData.length < 1 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}><p>No exam history yet</p></div>
            ) : (
              <ChartWrapper height={360}>
                <LineChart data={timelineData} margin={{ top: 5, right: 30, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#93C5FD' }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    height={70}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#93C5FD' }} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 10, fontSize: 13, color: 'white' }}
                    formatter={(val: any, name: any) => [`${val}%`, name ?? '']}
                    labelStyle={{ color: '#93C5FD', fontWeight: 700, marginBottom: 6 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16, color: '#CBD5E1' }} />
                  <ReferenceLine y={75} stroke="#10B981" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: '75% Good', fill: '#10B981', fontSize: 11 }} />
                  <ReferenceLine y={40} stroke="#EF4444" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: '40% Pass', fill: '#EF4444', fontSize: 11 }} />
                  {allSubjectNames.map((subj, i) => (
                    <Line
                      key={subj}
                      type="monotone"
                      dataKey={subj}
                      stroke={TIMELINE_COLORS[i % TIMELINE_COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ r: 5, strokeWidth: 2, fill: TIMELINE_COLORS[i % TIMELINE_COLORS.length] }}
                      activeDot={{ r: 7, strokeWidth: 0 }}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ChartWrapper>
            )}
          </div>

          {/* Bar: Subject Marks */}
          <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px', width: '100%', minWidth: 0 }}>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>📊 Subject-wise Marks (Current vs Maximum)</h4>
            <ChartWrapper height={280}>
              <BarChart data={barData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip formatter={(val, name) => [`${val}`, name]} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                <Bar dataKey="Max" fill="#E2E8F0" radius={[4,4,0,0]} name="Max Marks" />
                <Bar dataKey="Marks" fill="#3B82F6" radius={[4,4,0,0]} name="Marks Obtained" />
              </BarChart>
            </ChartWrapper>
          </div>

          {/* Bar: Percentage */}
          <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px', width: '100%', minWidth: 0 }}>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>📈 Subject-wise Percentage</h4>
            <ChartWrapper height={280}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip formatter={(val) => [`${val}%`, 'Score']} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                <ReferenceLine y={75} stroke="#10B981" strokeDasharray="5 5" label={{ value: '75%', fontSize: 11, fill: '#10B981' }} />
                <ReferenceLine y={40} stroke="#EF4444" strokeDasharray="5 5" label={{ value: '40%', fontSize: 11, fill: '#EF4444' }} />
                <Bar dataKey="Percentage" radius={[6,6,0,0]} name="Score %">
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={
                      entry.Percentage >= 75 ? '#10B981' : entry.Percentage >= 40 ? '#F59E0B' : '#EF4444'
                    } />
                  ))}
                </Bar>
              </BarChart>
            </ChartWrapper>
          </div>

          {/* Line: Trend */}
          <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px', width: '100%', minWidth: 0 }}>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>📉 Performance Trend (Current vs Previous Average)</h4>
            <ChartWrapper height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                <Line type="monotone" dataKey="Current %" stroke="#3B82F6" strokeWidth={3} dot={{ r: 5, fill: '#3B82F6' }} />
                <Line type="monotone" dataKey="Prev Avg %" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, fill: '#94A3B8' }} />
              </LineChart>
            </ChartWrapper>
          </div>

          {/* Bar: Improvement Score */}
          <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px', width: '100%', minWidth: 0 }}>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>🔼 Improvement Score (vs Previous Average, in %pts)</h4>
            <ChartWrapper height={240}>
              <BarChart data={improvData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip formatter={(val) => [`${Number(val) > 0 ? '+' : ''}${val}pp`, 'Change']} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                <ReferenceLine y={0} stroke="#64748B" strokeWidth={1} />
                <Bar dataKey="improvement" radius={[4,4,0,0]} name="Improvement">
                  {improvData.map((entry, i) => (
                    <Cell key={i} fill={entry.improvement > 0 ? '#10B981' : entry.improvement < 0 ? '#EF4444' : '#94A3B8'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartWrapper>
          </div>

          {/* Radar */}
          {analysis.subjects.length >= 3 && (
            <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '20px 24px', width: '100%', minWidth: 0 }}>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>🕸️ Performance Radar</h4>
              <ChartWrapper height={320}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#E2E8F0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#475569' }} />
                  <Radar name="Score %" dataKey="score" stroke="#6366F1" fill="#6366F1" fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip formatter={(val) => [`${val}%`, 'Score']} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }} />
                </RadarChart>
              </ChartWrapper>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: REMARKS ── */}
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
                  <span style={{ fontSize: 13, fontWeight: 900, color: sc.text }}>{s.percentage}%</span>
                </div>
                <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.75, margin: 0 }}>{s.remark}</p>
              </div>
            );
          })}
          {analysis.subjects.length === 0 && (
            <div style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 28 }}>📭</p>
              <p style={{ fontWeight: 600, color: '#475569' }}>No marks data available to generate remarks.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
