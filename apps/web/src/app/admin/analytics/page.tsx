'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface SchoolMonthData { month: string; count: number; }
interface TopSchool { name: string; code: string; studentCount: number; }
interface PlanDist { plan: string; count: number; color: string; }

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PLAN_COLORS: Record<string, string> = {
  basic: '#3B82F6', standard: '#F59E0B', premium: '#8B5CF6', enterprise: '#10B981', trial: '#94A3B8',
};

export default function AdminAnalytics() {
  const supabase = createClient();
  const [monthlyData, setMonthlyData] = useState<SchoolMonthData[]>([]);
  const [topSchools, setTopSchools] = useState<TopSchool[]>([]);
  const [planDist, setPlanDist] = useState<PlanDist[]>([]);
  const [totalSchools, setTotalSchools] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalStaff, setTotalStaff] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      const now = new Date();

      // Monthly registrations
      const months: SchoolMonthData[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextD = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const { count } = await supabase.from('schools').select('*', { count: 'exact', head: true }).gte('created_at', d.toISOString()).lt('created_at', nextD.toISOString());
        months.push({ month: MONTH_NAMES[d.getMonth()], count: count || 0 });
      }
      setMonthlyData(months);

      // Global stats
      const [{ data: schools }, { count: students }, { count: staff }] = await Promise.all([
        supabase.from('schools').select('id, name, code, subscription_plan, is_active'),
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('users').select('*', { count: 'exact', head: true }).in('role', ['teacher', 'principal']),
      ]);

      setTotalSchools(schools?.length || 0);
      setTotalStudents(students || 0);
      setTotalStaff(staff || 0);

      // Plan distribution
      if (schools && schools.length > 0) {
        const planMap: Record<string, number> = {};
        schools.forEach((s: any) => { const plan = s.subscription_plan || 'basic'; planMap[plan] = (planMap[plan] || 0) + 1; });
        setPlanDist(Object.entries(planMap).map(([plan, count]) => ({ plan: plan.charAt(0).toUpperCase() + plan.slice(1), count, color: PLAN_COLORS[plan] || '#94A3B8' })).sort((a, b) => b.count - a.count));
      }

      // Top schools by student count
      const { data: schoolList } = await supabase.from('schools').select('id, name, code').eq('is_active', true).limit(10);
      if (schoolList && schoolList.length > 0) {
        const schoolStats: TopSchool[] = [];
        for (const school of schoolList) {
          const { count } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', school.id).eq('is_active', true);
          schoolStats.push({ name: school.name, code: school.code, studentCount: count || 0 });
        }
        setTopSchools(schoolStats.sort((a, b) => b.studentCount - a.studentCount).slice(0, 5));
      }

      setLoading(false);
    }
    fetchAnalytics();
  }, []);

  const maxMonthly = Math.max(...monthlyData.map(m => m.count), 1);
  const totalPlan = planDist.reduce((a, p) => a + p.count, 0);
  const maxStudents = Math.max(...topSchools.map(s => s.studentCount), 1);
  const isEmpty = !loading && totalSchools === 0;

  const summaryCards = [
    { label: 'Total Schools', value: totalSchools, color: '#1D4ED8', bg: '#EFF6FF', border: '#DBEAFE', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg> },
    { label: 'Total Students', value: totalStudents.toLocaleString(), color: '#0F766E', bg: '#F0FDFA', border: '#CCFBF1', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> },
    { label: 'Total Staff', value: totalStaff.toLocaleString(), color: '#7C3AED', bg: '#F5F3FF', border: '#EDE9FE', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { label: 'This Month', value: monthlyData[monthlyData.length - 1]?.count ?? 0, color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg> },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>Platform Analytics</h2>
        <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
          Aggregated insights across {loading ? '...' : `all ${totalSchools} school${totalSchools !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {summaryCards.map((s, i) => (
          <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{s.label}</p>
              <span style={{ color: s.color, opacity: 0.7 }}>{s.icon}</span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
              {loading ? <span style={{ display: 'inline-block', width: 40, height: 28, background: 'rgba(0,0,0,0.08)', borderRadius: 6 }} /> : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Monthly Bar Chart */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', padding: '22px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>Monthly School Registrations</h3>
          <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 20px' }}>Last 6 months</p>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160 }}>
              {[60, 80, 40, 90, 50, 70].map((h, i) => <div key={i} style={{ flex: 1, height: `${h}%`, background: '#F1F5F9', borderRadius: '6px 6px 0 0' }} />)}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160 }}>
                {monthlyData.map((m, i) => (
                  <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                    {m.count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#1D4ED8' }}>{m.count}</span>}
                    <div style={{ width: '100%', borderRadius: '6px 6px 0 0', background: m.count > 0 ? 'linear-gradient(180deg, #60A5FA, #1E40AF)' : '#F1F5F9', height: `${Math.max((m.count / maxMonthly) * 100, m.count > 0 ? 8 : 4)}%`, transition: `height 0.5s ease ${i * 0.08}s`, minHeight: 4 }} />
                    <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>{m.month}</span>
                  </div>
                ))}
              </div>
              {monthlyData.every(m => m.count === 0) && (
                <p style={{ textAlign: 'center', fontSize: 12, color: '#CBD5E1', marginTop: 8, fontStyle: 'italic' }}>No registrations in the last 6 months</p>
              )}
            </>
          )}
        </div>

        {/* Plan Distribution */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', padding: '22px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>Subscription Plan Distribution</h3>
          <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 20px' }}>Current active plans</p>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[1,2,3].map(i => <div key={i} style={{ height: 20, background: '#F1F5F9', borderRadius: 6 }} />)}
            </div>
          ) : planDist.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 140, gap: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📋</div>
              <p style={{ fontSize: 13, color: '#CBD5E1', fontStyle: 'italic', margin: 0 }}>No subscription data available</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {planDist.map(p => (
                <div key={p.plan}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{p.plan}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{p.count} ({Math.round((p.count / totalPlan) * 100)}%)</span>
                  </div>
                  <div style={{ height: 8, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 99, background: p.color, width: `${(p.count / totalPlan) * 100}%`, transition: 'width 0.7s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Schools */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>Top Schools by Student Count</h3>
          <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>Top 5 most active schools on the platform</p>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[1,2,3,4,5].map(i => <div key={i} style={{ height: 40, background: '#F8FAFC', borderRadius: 8 }} />)}
            </div>
          ) : isEmpty || topSchools.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
              <p style={{ fontWeight: 700, color: '#1E293B', fontSize: 14, margin: 0 }}>No data yet</p>
              <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>Add your first school to see analytics here</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {topSchools.map((s, i) => (
                <div key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: i === 0 ? '#FEF3C7' : '#F1F5F9', color: i === 0 ? '#B45309' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ width: 140, flexShrink: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</p>
                    <code style={{ fontSize: 10, color: '#94A3B8', background: '#F1F5F9', padding: '1px 5px', borderRadius: 4 }}>{s.code}</code>
                  </div>
                  <div style={{ flex: 1, height: 10, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #60A5FA, #1E40AF)', width: `${(s.studentCount / maxStudents) * 100}%`, transition: 'width 0.7s ease' }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#1D4ED8', width: 48, textAlign: 'right', flexShrink: 0 }}>{s.studentCount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
