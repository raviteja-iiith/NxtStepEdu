'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface TeacherCoverage {
  teacher_id: string;
  teacher_name: string;
  total_plans: number;
  completed: number;
  in_progress: number;
  pending: number;
  filed_this_week: boolean;
  latest_plan_date: string | null;
  resource_count: number;
}

interface PlanRow {
  id: string;
  teacher_name: string;
  subject_name: string;
  section_label: string;
  week_start_date: string;
  topics: string;
  status: string;
  created_at: string;
}

function getMonday(d: Date): string {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon.toISOString().split('T')[0];
}

export default function LessonCoveragePage() {
  const supabase = createClient();
  const [coverage, setCoverage] = useState<TeacherCoverage[]>([]);
  const [recentPlans, setRecentPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'recent' | 'resources'>('overview');
  const [resourceStats, setResourceStats] = useState<{ subject: string; count: number; published: number }[]>([]);

  const thisWeekMonday = getMonday(new Date());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: userData } = await supabase.from('users').select('school_id').eq('id', user.id).single();
    const schoolId = userData?.school_id;
    if (!schoolId) { setLoading(false); return; }

    // Fetch all teachers in this school
    const { data: teachers } = await supabase.from('users')
      .select('id, full_name')
      .eq('school_id', schoolId)
      .eq('role', 'teacher');

    if (!teachers || teachers.length === 0) { setLoading(false); return; }

    const teacherIds = teachers.map((t: any) => t.id as string);

    // Fetch all lesson plans for this school this month
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().split('T')[0];

    const { data: plans } = await supabase.from('lesson_plans')
      .select('*, subjects(name), sections(name, classes(name)), users(full_name)')
      .in('teacher_id', teacherIds)
      .gte('week_start_date', monthStartStr)
      .order('week_start_date', { ascending: false });

    // Fetch resource counts per subject
    const { data: resources } = await supabase.from('resources')
      .select('subject_id, is_published, subjects(name)')
      .eq('school_id', schoolId);

    // Build coverage map per teacher
    const coverageMap = new Map<string, TeacherCoverage>();
    teachers.forEach((t: any) => {
      coverageMap.set(t.id, {
        teacher_id: t.id,
        teacher_name: t.full_name || '—',
        total_plans: 0,
        completed: 0,
        in_progress: 0,
        pending: 0,
        filed_this_week: false,
        latest_plan_date: null,
        resource_count: 0,
      });
    });

    (plans || []).forEach((p: any) => {
      const entry = coverageMap.get(p.teacher_id);
      if (!entry) return;
      entry.total_plans++;
      if (p.status === 'completed') entry.completed++;
      else if (p.status === 'in_progress') entry.in_progress++;
      else entry.pending++;
      if (p.week_start_date === thisWeekMonday) entry.filed_this_week = true;
      if (!entry.latest_plan_date || p.week_start_date > entry.latest_plan_date) {
        entry.latest_plan_date = p.week_start_date;
      }
    });

    // Count resources per teacher
    (resources || []).forEach((r: any) => {
      if (r.created_by && coverageMap.has(r.created_by)) {
        coverageMap.get(r.created_by)!.resource_count++;
      }
    });

    setCoverage(Array.from(coverageMap.values()).sort((a, b) => b.total_plans - a.total_plans));

    // Recent plans list
    const recentRows: PlanRow[] = (plans || []).slice(0, 30).map((p: any) => ({
      id: p.id,
      teacher_name: (p.users as any)?.full_name || coverageMap.get(p.teacher_id)?.teacher_name || '—',
      subject_name: (p.subjects as any)?.name || '—',
      section_label: `${(p.sections as any)?.classes?.name || ''}-${(p.sections as any)?.name || ''}`,
      week_start_date: p.week_start_date,
      topics: p.topics || '—',
      status: p.status || 'planned',
      created_at: p.created_at,
    }));
    setRecentPlans(recentRows);

    // Resource stats per subject
    const subjectMap = new Map<string, { subject: string; count: number; published: number }>();
    (resources || []).forEach((r: any) => {
      const name = (r.subjects as any)?.name || 'General';
      if (!subjectMap.has(name)) subjectMap.set(name, { subject: name, count: 0, published: 0 });
      const entry = subjectMap.get(name)!;
      entry.count++;
      if (r.is_published) entry.published++;
    });
    setResourceStats(Array.from(subjectMap.values()).sort((a, b) => b.count - a.count));

    setLoading(false);
  }, [supabase, thisWeekMonday]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalPlans = coverage.reduce((s, c) => s + c.total_plans, 0);
  const totalCompleted = coverage.reduce((s, c) => s + c.completed, 0);
  const filedThisWeek = coverage.filter(c => c.filed_this_week).length;
  const notFiledThisWeek = coverage.filter(c => !c.filed_this_week);
  const completionRate = totalPlans > 0 ? Math.round((totalCompleted / totalPlans) * 100) : 0;

  const statusColor = (s: string) => {
    if (s === 'completed') return { bg: '#DCFCE7', color: '#16A34A' };
    if (s === 'in_progress') return { bg: '#FFFBEB', color: '#D97706' };
    return { bg: '#EFF6FF', color: '#1D4ED8' };
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Lesson Coverage</h2>
        <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>Track lesson plan filing and resource sharing across all teachers</p>
      </div>

      {/* Summary Stats */}
      <div className="stat-cards-container">
        {[
          { label: 'Plans This Month', value: totalPlans, icon: '📖', bg: '#EFF6FF', border: '#DBEAFE', color: '#1D4ED8' },
          { label: 'Completion Rate', value: `${completionRate}%`, icon: '✅', bg: '#F0FDF4', border: '#BBF7D0', color: '#16A34A' },
          { label: 'Filed This Week', value: `${filedThisWeek}/${coverage.length}`, icon: '📅', bg: '#FFFBEB', border: '#FDE68A', color: '#D97706' },
          { label: 'Total Resources', value: resourceStats.reduce((s, r) => s + r.count, 0), icon: '📚', bg: '#F5F3FF', border: '#DDD6FE', color: '#7C3AED' },
        ].map((stat, i) => (
          <div key={i} style={{ background: stat.bg, border: `1px solid ${stat.border}`, borderRadius: 12, padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: stat.color, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{stat.icon} {stat.label}</p>
            <p style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', margin: '6px 0 0' }}>{loading ? '…' : stat.value}</p>
          </div>
        ))}
      </div>

      {/* Alert: Teachers who haven't filed this week */}
      {!loading && notFiledThisWeek.length > 0 && (
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '14px 18px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#C2410C', margin: '0 0 8px' }}>
            ⚠️ {notFiledThisWeek.length} teacher{notFiledThisWeek.length !== 1 ? 's' : ''} haven't filed a plan for this week ({thisWeekMonday})
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {notFiledThisWeek.slice(0, 10).map(t => (
              <span key={t.teacher_id} style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                {t.teacher_name}
              </span>
            ))}
            {notFiledThisWeek.length > 10 && (
              <span style={{ fontSize: 12, color: '#92400E' }}>+{notFiledThisWeek.length - 10} more</span>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: '#F1F5F9' }}>
        {[
          { key: 'overview' as const, label: '👥 Teacher Overview' },
          { key: 'recent' as const, label: '📋 Recent Plans' },
          { key: 'resources' as const, label: '📚 Resource Library' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex: 1, padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: tab === t.key ? 'white' : 'transparent', color: tab === t.key ? '#0F766E' : '#64748B',
              boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3, 4].map(i => <div key={i} style={{ height: 60, background: '#F8FAFC', borderRadius: 10 }} />)}
        </div>
      ) : tab === 'overview' ? (
        /* Teacher Overview Table */
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 80px 80px 80px', padding: '10px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', gap: 8 }}>
            {['Teacher', 'Plans', 'Done', 'Active', 'Pending', 'This Week', 'Resources'].map((h, i) => (
              <p key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, textAlign: i > 0 ? 'center' : 'left' }}>{h}</p>
            ))}
          </div>
          {coverage.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 28 }}>📭</p>
              <p style={{ fontWeight: 600, color: '#475569' }}>No lesson plans found this month</p>
            </div>
          ) : coverage.map((c, idx) => (
            <div key={c.teacher_id} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 80px 80px 80px', padding: '13px 20px', borderBottom: idx < coverage.length - 1 ? '1px solid #F1F5F9' : 'none', alignItems: 'center', gap: 8, background: idx % 2 === 0 ? 'white' : '#FAFAFA' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#0F766E,#0D9488)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {c.teacher_name.charAt(0)}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{c.teacher_name}</span>
              </div>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: 0, textAlign: 'center' }}>{c.total_plans}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#16A34A', margin: 0, textAlign: 'center' }}>{c.completed}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#D97706', margin: 0, textAlign: 'center' }}>{c.in_progress}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', margin: 0, textAlign: 'center' }}>{c.pending}</p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: c.filed_this_week ? '#DCFCE7' : '#FEF2F2', color: c.filed_this_week ? '#16A34A' : '#DC2626' }}>
                  {c.filed_this_week ? '✓ Yes' : '✗ No'}
                </span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#7C3AED', margin: 0, textAlign: 'center' }}>{c.resource_count}</p>
            </div>
          ))}
        </div>
      ) : tab === 'recent' ? (
        /* Recent Plans List */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recentPlans.length === 0 ? (
            <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', padding: '48px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 28 }}>📭</p>
              <p style={{ fontWeight: 600, color: '#475569' }}>No lesson plans this month</p>
            </div>
          ) : recentPlans.map(p => {
            const sc = statusColor(p.status);
            return (
              <div key={p.id} style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>{p.teacher_name}</p>
                    <span style={{ fontSize: 11, color: '#64748B' }}>•</span>
                    <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{p.subject_name} · {p.section_label}</p>
                  </div>
                  <p style={{ fontSize: 13, color: '#475569', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Topics: {p.topics}
                  </p>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 4px' }}>
                    {new Date(p.week_start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: sc.bg, color: sc.color }}>
                    {p.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Resource Library by Subject */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {resourceStats.length === 0 ? (
            <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', padding: '48px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 28 }}>📁</p>
              <p style={{ fontWeight: 600, color: '#475569' }}>No resources shared yet</p>
              <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Teachers can share notes, worksheets, and videos from their Resources page</p>
            </div>
          ) : resourceStats.map((r, i) => {
            const publishedPct = r.count > 0 ? Math.round((r.published / r.count) * 100) : 0;
            return (
              <div key={i} style={{ background: 'white', border: '1px solid #E8ECF0', borderRadius: 12, padding: '14px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📚</div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>{r.subject}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>{r.count}</p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>total</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 6, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${publishedPct}%`, background: 'linear-gradient(90deg,#0F766E,#10B981)', borderRadius: 99, transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0F766E', flexShrink: 0 }}>{r.published} published ({publishedPct}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
