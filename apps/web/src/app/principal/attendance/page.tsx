'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PrincipalAttendancePage() {
  const supabase = createClient();
  const [stats, setStats] = useState<{ present: number; absent: number; late: number; total: number }>({ present: 0, absent: 0, late: 0, total: 0 });
  const [totalSections, setTotalSections] = useState(0);
  const [reportedSections, setReportedSections] = useState(0);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split('T')[0];

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
      const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
      if (u?.school_id) {
        const [attResult, secResult] = await Promise.all([
          supabase.from('attendance').select('status, section_id').eq('school_id', u.school_id).eq('date', today),
          supabase.from('sections').select('id', { count: 'exact', head: true }).eq('school_id', u.school_id),
        ]);

        if (attResult.data) {
          const present = attResult.data.filter((a: { status: string }) => a.status === 'present').length;
          const absent = attResult.data.filter((a: { status: string }) => a.status === 'absent').length;
          const late = attResult.data.filter((a: { status: string }) => a.status === 'late').length;
          const uniqueSections = new Set(attResult.data.map((a: any) => a.section_id as string)).size;
          setStats({ present, absent, late, total: attResult.data.length });
          setReportedSections(uniqueSections);
        }
        setTotalSections(secResult.count || 0);
      }
    }
    setLoading(false);
  }, [supabase, today]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const pct = (n: number) => stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Attendance Overview</h2>
        <p className="text-slate-500 text-sm mt-1">School-wide attendance for {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {/* Section Coverage Banner */}
      {!loading && (
        <div className={`rounded-2xl p-4 flex items-center gap-4 ${reportedSections === totalSections && totalSections > 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
          <span className="text-2xl">{reportedSections === totalSections && totalSections > 0 ? '✅' : '⚠️'}</span>
          <div>
            <p className={`font-bold text-sm ${reportedSections === totalSections && totalSections > 0 ? 'text-green-800' : 'text-amber-800'}`}>
              {reportedSections} of {totalSections} sections have reported attendance today
            </p>
            <p className={`text-xs mt-0.5 ${reportedSections === totalSections && totalSections > 0 ? 'text-green-600' : 'text-amber-600'}`}>
              {totalSections - reportedSections > 0 ? `${totalSections - reportedSections} section(s) yet to mark today's attendance` : 'All sections have marked attendance for today'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Students Marked', value: stats.total, color: 'bg-slate-100 text-slate-700', icon: '👥' },
          { label: 'Present', value: stats.present, color: 'bg-green-100 text-green-700', icon: '✅' },
          { label: 'Absent', value: stats.absent, color: 'bg-red-100 text-red-700', icon: '❌' },
          { label: 'Late', value: stats.late, color: 'bg-amber-100 text-amber-700', icon: '🕐' },
        ].map((card, i) => (
          <div key={i} className={`rounded-2xl p-5 ${card.color}`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{card.icon}</span>
              <p className="text-sm font-semibold opacity-80">{card.label}</p>
            </div>
            <p className="text-4xl font-black">
              {loading ? <span className="inline-block w-16 h-10 bg-current opacity-10 rounded animate-pulse" /> : card.value}
            </p>
            {!loading && stats.total > 0 && i > 0 && <p className="text-xs opacity-60 mt-1">{pct(card.value)}% of marked students</p>}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-slate-800 mb-4">Attendance Rate</h3>
        {loading ? (
          <div className="h-4 bg-slate-100 rounded-full animate-pulse" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 w-20">Present</span>
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all duration-700" style={{ width: `${pct(stats.present)}%` }} />
              </div>
              <span className="text-sm font-bold text-slate-700 w-12 text-right">{pct(stats.present)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 w-20">Absent</span>
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-400 rounded-full transition-all duration-700" style={{ width: `${pct(stats.absent)}%` }} />
              </div>
              <span className="text-sm font-bold text-slate-700 w-12 text-right">{pct(stats.absent)}%</span>
            </div>
          </div>
        )}
        {!loading && stats.total === 0 && (
          <div className="py-8 text-center text-slate-400 text-sm">No attendance has been marked for today yet.</div>
        )}
      </div>
    </div>
  );
}
