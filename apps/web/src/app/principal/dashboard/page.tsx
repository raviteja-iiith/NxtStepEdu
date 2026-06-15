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
  const [stats, setStats] = useState({ totalStudents: 0, totalTeachers: 0, attendanceToday: '—', pendingFees: '₹0' });

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const u = await getUserProfile(supabase, user.id);
      if (u) setUserName(u.full_name || 'Principal');
      if (u?.school_id) {
        const dashboardStats = await getPrincipalDashboardStats(supabase, u.school_id);
        setStats(dashboardStats);
        const { data: ann } = await supabase.from('announcements').select('id, title, created_at, is_urgent').eq('school_id', u.school_id).order('created_at', { ascending: false }).limit(3);
        if (ann) setRecentAnnouncements(ann as any);
        const { data: leaves } = await supabase.from('leave_requests').select('id, leave_type, from_date, users!leave_requests_requester_id_fkey(full_name)').eq('school_id', u.school_id).eq('status', 'pending').order('created_at', { ascending: false }).limit(3);
        if (leaves) setPendingLeaves(leaves as any);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const statCards = [
    { label: 'Total Students', value: stats.totalStudents, desc: 'Enrolled across all classes', color: '#1D4ED8', bg: '#EFF6FF', iconBg: '#DBEAFE', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> },
    { label: 'Total Staff', value: stats.totalTeachers, desc: 'Active teaching staff', color: '#7C3AED', bg: '#F5F3FF', iconBg: '#EDE9FE', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { label: "Today's Attendance", value: stats.attendanceToday, desc: 'Overall presence', color: '#0F766E', bg: '#F0FDFA', iconBg: '#CCFBF1', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { label: 'Fee Deficit', value: stats.pendingFees, desc: 'Total outstanding dues', color: '#DC2626', bg: '#FEF2F2', iconBg: '#FEE2E2', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
  ];

  const quickActions = [
    { href: '/principal/attendance', label: 'Check Attendance', desc: 'Daily overview', color: '#0F766E', bg: '#CCFBF1', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { href: '/principal/fees', label: 'Fee Management', desc: 'Pending dues', color: '#1D4ED8', bg: '#DBEAFE', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { href: '/principal/teachers', label: 'Manage Staff', desc: 'Teacher directory', color: '#7C3AED', bg: '#EDE9FE', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> },
    { href: '/principal/reports', label: 'View Reports', desc: 'Academic & Financial', color: '#B45309', bg: '#FEF3C7', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Welcome Banner */}
      <div style={{ borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 60%, #3B82F6 100%)', padding: 32, position: 'relative' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: -20, right: 100, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 99, padding: '5px 12px', marginBottom: 12, border: '1px solid rgba(255,255,255,0.15)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} />
              <span style={{ color: '#BFDBFE', fontSize: 12, fontWeight: 600 }}>{greeting}</span>
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: 'white', letterSpacing: '-0.02em', marginBottom: 6 }}>
              {loading ? <span style={{ display: 'inline-block', width: 180, height: 32, background: 'rgba(255,255,255,0.15)', borderRadius: 8 }} /> : `${userName} 👋`}
            </h2>
            <p style={{ color: 'rgba(191,219,254,0.85)', fontSize: 13 }}>
              Here&apos;s what&apos;s happening in your school today, {dateStr}.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button style={{ background: 'white', color: '#1D4ED8', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', whiteSpace: 'nowrap' }}>Generate Report</button>
            <button style={{ background: 'rgba(255,255,255,0.1)', color: 'white', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Broadcast</button>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {statCards.map((s, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{s.label}</p>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: s.iconBg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.icon}</div>
            </div>
            <p style={{ fontSize: 30, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>
              {loading ? <span style={{ display: 'inline-block', width: 50, height: 28, background: '#F1F5F9', borderRadius: 6 }} /> : s.value}
            </p>
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Bottom Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>

        {/* Recent Activity */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>Recent Activity</h3>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Pending actions & announcements</p>
            </div>
            <Link href="/principal/reports" style={{ fontSize: 12, fontWeight: 600, color: '#3B82F6', textDecoration: 'none', padding: '5px 12px', background: '#EFF6FF', borderRadius: 8, border: '1px solid #DBEAFE' }}>View Reports →</Link>
          </div>
          <div style={{ padding: '16px 24px' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 48, background: '#F8FAFC', borderRadius: 8 }} />)}
              </div>
            ) : (
              <>
                {pendingLeaves.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Pending Leave Requests</p>
                    {pendingLeaves.map(l => (
                      <Link key={l.id} href="/principal/approvals" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid #F1F5F9', background: '#FAFAFA', textDecoration: 'none', marginBottom: 6 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 9, background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>🏖️</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(l.users as any)?.full_name || 'Staff'}</p>
                          <p style={{ fontSize: 11, color: '#64748B', margin: '2px 0 0', textTransform: 'capitalize' }}>{l.leave_type?.replace(/_/g,' ')} · From {new Date(l.from_date).toLocaleDateString('en-IN')}</p>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: '#FFFBEB', color: '#D97706', flexShrink: 0 }}>Pending</span>
                      </Link>
                    ))}
                  </div>
                )}
                {recentAnnouncements.length > 0 && (
                  <div style={{ borderTop: pendingLeaves.length > 0 ? '1px solid #F1F5F9' : 'none', paddingTop: pendingLeaves.length > 0 ? 12 : 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Recent Announcements</p>
                    {recentAnnouncements.map(a => (
                      <Link key={a.id} href="/principal/announcements" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid #F1F5F9', background: '#FAFAFA', textDecoration: 'none', marginBottom: 6 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 9, background: a.is_urgent ? '#FEF2F2' : '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>{a.is_urgent ? '🔴' : '📢'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</p>
                          <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{new Date(a.created_at).toLocaleDateString('en-IN')}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                {pendingLeaves.length === 0 && recentAnnouncements.length === 0 && (
                  <div style={{ padding: '32px 0', textAlign: 'center' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F0FDF4', border: '1px solid #DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22 }}>✅</div>
                    <p style={{ fontWeight: 700, color: '#15803D', fontSize: 14, margin: 0 }}>All caught up!</p>
                    <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>No pending actions or recent activity.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Quick Tools */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #F1F5F9' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>Quick Tools</h3>
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Common actions</p>
          </div>
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {quickActions.map((a, i) => (
              <Link key={i} href={a.href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 10, border: '1px solid #F1F5F9', background: '#FAFAFA', textDecoration: 'none' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: a.bg, color: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.icon}</div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#0F172A', margin: 0 }}>{a.label}</p>
                  <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{a.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
