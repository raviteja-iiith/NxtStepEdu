'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface SchoolMonthData { month: string; count: number; }
interface TopSchool { name: string; code: string; studentCount: number; }
interface PlanDist { plan: string; count: number; color: string; }

export default function AdminAnalytics() {
  const supabase = createClient();
  const [monthlyData, setMonthlyData] = useState<SchoolMonthData[]>([]);
  const [topSchools, setTopSchools] = useState<TopSchool[]>([]);
  const [planDist, setPlanDist] = useState<PlanDist[]>([]);
  const [totalSchools, setTotalSchools] = useState(0);
  const [loading, setLoading] = useState(true);

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const PLAN_COLORS: Record<string, string> = {
    basic: '#3B82F6', standard: '#F59E0B', premium: '#8B5CF6', enterprise: '#10B981', trial: '#94A3B8',
  };

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);

      // Monthly school registrations — last 6 months
      const now = new Date();
      const months: SchoolMonthData[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextD = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const { count } = await supabase
          .from('schools')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', d.toISOString())
          .lt('created_at', nextD.toISOString());
        months.push({ month: MONTH_NAMES[d.getMonth()], count: count || 0 });
      }
      setMonthlyData(months);

      // All schools for stats
      const { data: schools } = await supabase.from('schools').select('id, name, code, subscription_plan, is_active');
      setTotalSchools(schools?.length || 0);

      // Plan distribution
      if (schools && schools.length > 0) {
        const planMap: Record<string, number> = {};
        schools.forEach((s: any) => {
          const plan = s.subscription_plan || 'basic';
          planMap[plan] = (planMap[plan] || 0) + 1;
        });
        setPlanDist(
          Object.entries(planMap).map(([plan, count]) => ({
            plan: plan.charAt(0).toUpperCase() + plan.slice(1),
            count,
            color: PLAN_COLORS[plan] || '#94A3B8',
          })).sort((a, b) => b.count - a.count)
        );
      }

      // Top schools by student count
      const { data: schoolList } = await supabase.from('schools').select('id, name, code').eq('is_active', true).limit(10);
      if (schoolList && schoolList.length > 0) {
        const schoolStats: TopSchool[] = [];
        for (const school of schoolList) {
          const { count } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('school_id', school.id)
            .eq('is_active', true);
          schoolStats.push({ name: school.name, code: school.code, studentCount: count || 0 });
        }
        setTopSchools(schoolStats.sort((a, b) => b.studentCount - a.studentCount).slice(0, 5));
      }

      setLoading(false);
    }

    fetchAnalytics();
  }, []); // supabase is stable

  const maxMonthly = Math.max(...monthlyData.map(m => m.count), 1);
  const totalPlan = planDist.reduce((a, p) => a + p.count, 0);
  const maxStudents = Math.max(...topSchools.map(s => s.studentCount), 1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Platform Analytics</h2>
        <p className="text-gray-500 text-sm mt-1">Aggregated insights across all {totalSchools} school{totalSchools !== 1 ? 's' : ''}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Registrations */}
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-bold text-gray-900 mb-1">Monthly School Registrations</h3>
          <p className="text-xs text-gray-400 mb-4">Last 6 months</p>
          {loading ? (
            <div className="flex items-end gap-2 h-48">{[1,2,3,4,5,6].map(i => <div key={i} className="flex-1 skeleton rounded-t-lg h-24" />)}</div>
          ) : (
            <div className="flex items-end gap-2 h-48">
              {monthlyData.map((m, i) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-bold text-gray-600">{m.count || ''}</span>
                  <div
                    className="w-full rounded-t-lg transition-all duration-500 hover:opacity-80"
                    style={{
                      height: `${(m.count / maxMonthly) * 80}%`,
                      minHeight: m.count > 0 ? '4px' : '0px',
                      background: `linear-gradient(180deg, #3B82F6, #1E40AF)`,
                      animationDelay: `${i * 0.1}s`,
                    }}
                  />
                  <span className="text-[10px] text-gray-400 font-medium">{m.month}</span>
                </div>
              ))}
            </div>
          )}
          {!loading && monthlyData.every(m => m.count === 0) && (
            <p className="text-center text-sm text-gray-400 mt-2">No schools registered in the last 6 months</p>
          )}
        </div>

        {/* Plan Distribution */}
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-bold text-gray-900 mb-1">Subscription Plan Distribution</h3>
          <p className="text-xs text-gray-400 mb-4">Current active plans</p>
          {loading ? (
            <div className="flex items-center justify-center h-48"><div className="skeleton w-40 h-40 rounded-full" /></div>
          ) : planDist.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No subscription data available</div>
          ) : (
            <div className="space-y-3">
              {planDist.map(p => (
                <div key={p.plan} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="text-sm font-medium text-gray-700 w-24">{p.plan}</span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(p.count / totalPlan) * 100}%`, background: p.color }} />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-16 text-right">{p.count} ({Math.round((p.count / totalPlan) * 100)}%)</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Schools by Student Count */}
        <div className="lg:col-span-2 bg-white rounded-2xl border p-6" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-bold text-gray-900 mb-4">Top Schools by Student Count</h3>
          {loading ? (
            <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
          ) : topSchools.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-2">📊</p>
              <p className="text-sm">No school data yet. Add your first school to see analytics.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topSchools.map((s, i) => (
                <div key={s.code} className="flex items-center gap-4">
                  <span className="w-6 text-sm font-bold text-gray-400">{i + 1}</span>
                  <div className="w-32 shrink-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{s.code}</p>
                  </div>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(s.studentCount / maxStudents) * 100}%`, background: 'linear-gradient(90deg, #3B82F6, #1E40AF)' }} />
                  </div>
                  <span className="text-sm font-bold text-blue-600 w-16 text-right">{s.studentCount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
