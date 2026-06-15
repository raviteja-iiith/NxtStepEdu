'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

import { getPrincipalDashboardStats } from '@school-erp/supabase/queries';
import { getUserProfile } from '@school-erp/supabase/queries';

export default function PrincipalDashboard() {
  const supabase = createClient();
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [recentAnnouncements, setRecentAnnouncements] = useState<{id:string;title:string;created_at:string;is_urgent:boolean}[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<{id:string;users:any;leave_type:string;from_date:string}[]>([]);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    attendanceToday: '—',
    pendingFees: '₹0'
  });

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const u = await getUserProfile(supabase, user.id);
      if (u) setUserName(u.full_name || 'Principal');
      
      if (u?.school_id) {
        const dashboardStats = await getPrincipalDashboardStats(supabase, u.school_id);
        setStats(dashboardStats);

        // Fetch recent announcements
        const { data: ann } = await supabase.from('announcements')
          .select('id, title, created_at, is_urgent')
          .eq('school_id', u.school_id)
          .order('created_at', { ascending: false })
          .limit(3);
        if (ann) setRecentAnnouncements(ann as any);

        // Fetch pending leave requests
        const { data: leaves } = await supabase.from('leave_requests')
          .select('id, leave_type, from_date, users!leave_requests_requester_id_fkey(full_name)')
          .eq('school_id', u.school_id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(3);
        if (leaves) setPendingLeaves(leaves as any);
      }
    }
    setLoading(false);
  }, []); // supabase client is stable

  useEffect(() => { fetchData(); }, [fetchData]);

  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'; };

  const cards = [
    { label: 'Total Students', value: stats.totalStudents, icon: '🎓', color: 'blue', desc: 'Enrolled across all classes' },
    { label: 'Total Staff', value: stats.totalTeachers, icon: '👨‍🏫', color: 'indigo', desc: 'Active teaching staff' },
    { label: "Today's Attendance", value: stats.attendanceToday, icon: '✅', color: 'teal', desc: 'Overall presence' },
    { label: 'Fee Deficit', value: stats.pendingFees, icon: '💰', color: 'rose', desc: 'Total outstanding dues' },
  ];

  const colorStyles: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
  };

  const quickActions = [
    { href: '/principal/attendance', icon: '✅', label: 'Check Attendance', desc: 'Daily overview', color: 'teal' },
    { href: '/principal/fees', icon: '💳', label: 'Collect Fees', desc: 'Pending dues', color: 'blue' },
    { href: '/principal/teachers', icon: '👨‍🏫', label: 'Manage Staff', desc: 'Teacher directory', color: 'indigo' },
    { href: '/principal/reports', icon: '📈', label: 'View Reports', desc: 'Academic & Financial', color: 'rose' },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Welcome Banner */}
      <div style={{ borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 60%, #3B82F6 100%)', padding: 32, position: 'relative' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: -30, right: 120, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 99, padding: '5px 12px', marginBottom: 12, border: '1px solid rgba(255,255,255,0.15)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} />
              <span style={{ color: '#BFDBFE', fontSize: 12, fontWeight: 600, letterSpacing: '0.03em' }}>{greeting()}</span>
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: '-0.02em', marginBottom: 6 }}>
              {loading ? <span style={{ display: 'inline-block', width: 180, height: 34, background: 'rgba(255,255,255,0.15)', borderRadius: 8 }} /> : `${userName} 👋`}
            </h2>
            <p style={{ color: 'rgba(191,219,254,0.8)', fontSize: 13, maxWidth: 420 }}>
              Here is what&apos;s happening in your school today, {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button style={{ background: 'white', color: '#1D4ED8', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>Generate Report</button>
            <button style={{ background: 'rgba(255,255,255,0.1)', color: 'white', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}>Broadcast</button>
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
                    {loading ? <span className="inline-block w-20 h-8 bg-slate-100 rounded animate-pulse" /> : card.value}
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
        {/* Recent Activity - LIVE DB DATA */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">Recent Activity</h3>
            <Link href="/principal/reports" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View Reports →</Link>
          </div>
          
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="space-y-3">
              {pendingLeaves.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pending Leave Requests</p>
                  {pendingLeaves.map(l => (
                    <Link key={l.id} href="/principal/approvals" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-sm">🏖️</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{(l.users as any)?.full_name || 'Staff'}</p>
                        <p className="text-xs text-slate-500 capitalize">{l.leave_type?.replace(/_/g,' ')} · From {new Date(l.from_date).toLocaleDateString('en-IN')}</p>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:'#FFFBEB',color:'#D97706'}}>Pending</span>
                    </Link>
                  ))}
                </div>
              )}
              {recentAnnouncements.length > 0 && (
                <div className={pendingLeaves.length > 0 ? 'pt-3 border-t border-slate-100' : ''}>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Recent Announcements</p>
                  {recentAnnouncements.map(a => (
                    <Link key={a.id} href="/principal/announcements" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{background: a.is_urgent ? '#FEF2F2' : '#EFF6FF'}}>{a.is_urgent ? '🔴' : '📢'}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{a.title}</p>
                        <p className="text-xs text-slate-400">{new Date(a.created_at).toLocaleDateString('en-IN')}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {pendingLeaves.length === 0 && recentAnnouncements.length === 0 && (
                <div className="py-10 text-center">
                  <div className="w-14 h-14 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-2xl mx-auto mb-3">✅</div>
                  <p className="text-slate-700 font-bold text-sm">All caught up!</p>
                  <p className="text-xs text-slate-400 mt-1">No pending actions or recent activity.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 tracking-tight mb-6">Quick Tools</h3>
          <div className="space-y-3">
            {quickActions.map((action, i) => (
              <Link key={i} href={action.href} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all group bg-slate-50/50 hover:bg-white">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-sm border group-hover:scale-110 transition-transform ${colorStyles[action.color]}`}>
                  {action.icon}
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{action.label}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{action.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
