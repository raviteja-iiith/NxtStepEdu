'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getParentDashboardStats } from '@school-erp/supabase/queries';

export default function ParentDashboard() {
  const supabase = createClient();
  const [stats, setStats] = useState({
    studentName: 'Student',
    attendanceToday: '—',
    monthlyAttendance: '—%',
    pendingFees: '₹0',
    examsCount: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
      const data = await getParentDashboardStats(supabase, userId);
      setStats(data);
    }
    setLoading(false);
  }, []); // supabase client is stable

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const cards = [
    { label: "Today's Status", value: stats.attendanceToday, icon: '✅', color: 'green', desc: 'Real-time attendance' },
    { label: 'Monthly Avg', value: stats.monthlyAttendance, icon: '📊', color: 'blue', desc: 'This month so far' },
    { label: 'Fee Pending', value: stats.pendingFees, icon: '💰', color: 'amber', desc: 'Total dues' },
    { label: 'Upcoming Exams', value: stats.examsCount.toString(), icon: '📝', color: 'purple', desc: 'Published schedules' },
  ];

  const colorStyles: Record<string, string> = {
    green: 'bg-green-50 text-green-600 border-green-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  };

  const quickLinks = [
    { href: '/parent/attendance', icon: '📅', label: 'View Attendance', desc: 'Calendar view', color: 'green' },
    { href: '/parent/fees', icon: '💳', label: 'Pay Fees', desc: 'Online payment', color: 'amber' },
    { href: '/parent/academics', icon: '📊', label: 'View Results', desc: 'Exam marks', color: 'purple' },
    { href: '/parent/messages', icon: '💬', label: 'Message Teacher', desc: 'Chat now', color: 'blue' },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl p-8 lg:p-10" style={{ background: 'linear-gradient(135deg, #2E1065 0%, #7C3AED 100%)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
        <div className="absolute bottom-0 right-1/4 w-40 h-40 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)', transform: 'translate(50%, 50%)' }} />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 mb-4 backdrop-blur-sm">
              <span className="text-xs font-semibold text-purple-100 tracking-wide">Viewing Data For</span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
              {loading ? <span className="inline-block w-48 h-10 bg-white/20 rounded animate-pulse" /> : stats.studentName} 🎓
            </h2>
            <p className="text-purple-100/90 text-sm font-medium mt-2 max-w-md">
              Here is your child&apos;s progress and updates for today, {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
            </p>
          </div>
          
          <div className="flex gap-3">
            <button className="px-5 py-2.5 rounded-xl bg-white text-purple-700 text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all">Download Report Card</button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all relative overflow-hidden group">
            <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-[0.03] transition-transform group-hover:scale-110 ${colorStyles[card.color].split(' ')[0]}`} />
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{card.label}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  <h3 className="text-3xl font-black tracking-tight text-slate-800">
                    {loading ? <span className="inline-block w-16 h-8 bg-slate-100 rounded animate-pulse" /> : card.value}
                  </h3>
                </div>
                <p className="text-xs font-medium text-slate-500 mt-2">{card.desc}</p>
              </div>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-sm border ${colorStyles[card.color]}`}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">Recent Activity</h3>
            <Link href="/parent/academics" className="text-sm font-semibold text-purple-600 hover:text-purple-700">View All →</Link>
          </div>
          
          <div className="py-12 flex flex-col items-center justify-center text-center bg-slate-50 rounded-xl border border-slate-100 border-dashed">
            <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-2xl mb-4 border border-slate-100">📋</div>
            <p className="text-slate-800 font-bold mb-1">No recent activity</p>
            <p className="text-sm text-slate-500 max-w-sm">Announcements, assignments, attendance, and grade updates will appear here.</p>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 tracking-tight mb-6">Quick Links</h3>
          <div className="space-y-3">
            {quickLinks.map((link, i) => (
              <Link key={i} href={link.href} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all group bg-slate-50/50 hover:bg-white">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-sm border group-hover:scale-110 transition-transform ${colorStyles[link.color]}`}>
                  {link.icon}
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm group-hover:text-purple-600 transition-colors">{link.label}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{link.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
