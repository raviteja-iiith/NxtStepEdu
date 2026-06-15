'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface DashboardStats {
  totalSchools: number; activeSchools: number; pausedSchools: number;
  totalStudents: number; totalTeachers: number; newThisMonth: number;
}
interface ExpiringSchool { id: string; name: string; code: string; subscription_end: string; }

export default function AdminDashboard() {
  const supabase = createClient();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [expiring, setExpiring] = useState<ExpiringSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('');

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: u } = await supabase.from('users').select('full_name').eq('id', user.id).single();
        if (u) setAdminName((u as any).full_name || '');
      }
      const [{ count: totalSchools }, { count: activeSchools }, { count: pausedSchools }, { count: totalStudents }, { count: totalTeachers }] = await Promise.all([
        supabase.from('schools').select('*', { count: 'exact', head: true }),
        supabase.from('schools').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('schools').select('*', { count: 'exact', head: true }).eq('is_active', false),
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
      ]);
      const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { count: newThisMonth } = await supabase.from('schools').select('*', { count: 'exact', head: true }).gte('created_at', firstDay);
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const { data: expiringData } = await supabase.from('schools').select('id, name, code, subscription_end').eq('is_active', true).not('subscription_end', 'is', null).lte('subscription_end', thirtyDaysFromNow.toISOString()).gte('subscription_end', new Date().toISOString()).order('subscription_end', { ascending: true }).limit(5);
      setStats({ totalSchools: totalSchools || 0, activeSchools: activeSchools || 0, pausedSchools: pausedSchools || 0, totalStudents: totalStudents || 0, totalTeachers: totalTeachers || 0, newThisMonth: newThisMonth || 0 });
      setExpiring(expiringData || []);
      setLoading(false);
    }
    fetchAll();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const statCards = [
    { label: 'Active Schools', value: stats?.activeSchools ?? 0, desc: `${stats?.newThisMonth ?? 0} new this month`, bg: '#EFF6FF', iconBg: '#DBEAFE', color: '#1D4ED8', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg> },
    { label: 'Total Students', value: (stats?.totalStudents ?? 0).toLocaleString(), desc: 'Across all schools', bg: '#F0FDFA', iconBg: '#CCFBF1', color: '#0F766E', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> },
    { label: 'Total Staff', value: (stats?.totalTeachers ?? 0).toLocaleString(), desc: 'Teachers & Principals', bg: '#FAF5FF', iconBg: '#EDE9FE', color: '#7C3AED', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { label: 'System Health', value: '99.9%', desc: 'All services operational', bg: '#F0FDF4', iconBg: '#DCFCE7', color: '#16A34A', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  ];

  const quickActions = [
    { href: '/admin/schools', label: 'Onboard School', desc: 'Add a new school workspace', color: '#1D4ED8', bg: '#DBEAFE', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><line x1="12" y1="22" x2="12" y2="12"/></svg> },
    { href: '/admin/principals', label: 'Manage Principals', desc: 'Add & assign principals', color: '#7C3AED', bg: '#EDE9FE', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    { href: '/admin/analytics', label: 'View Analytics', desc: 'Platform-wide insights', color: '#0F766E', bg: '#CCFBF1', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
    { href: '/admin/settings', label: 'System Settings', desc: 'Global configurations', color: '#64748B', bg: '#F1F5F9', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Welcome Banner */}
      <div style={{ borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(135deg, #1E1B4B 0%, #3730A3 60%, #6366F1 100%)', padding: 32, position: 'relative' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: -20, right: 100, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 99, padding: '5px 12px', marginBottom: 12, border: '1px solid rgba(255,255,255,0.15)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} />
              <span style={{ color: '#C7D2FE', fontSize: 12, fontWeight: 600, letterSpacing: '0.03em' }}>{greeting}</span>
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: '-0.02em', marginBottom: 6 }}>
              {loading || !adminName ? <span style={{ display: 'inline-block', width: 160, height: 32, background: 'rgba(255,255,255,0.15)', borderRadius: 8 }} /> : `${adminName} 👋`}
            </h2>
            <p style={{ color: 'rgba(199,210,254,0.8)', fontSize: 13, maxWidth: 440 }}>
              System overview for {dateStr}. {stats ? `${stats.activeSchools} schools active across the platform.` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <Link href="/admin/schools" style={{ background: 'white', color: '#3730A3', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 10, textDecoration: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', whiteSpace: 'nowrap' }}>
              + Onboard School
            </Link>
            <Link href="/admin/analytics" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 10, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)', whiteSpace: 'nowrap' }}>
              Analytics
            </Link>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {statCards.map((s, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: s.iconBg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.icon}</div>
            </div>
            <p style={{ fontSize: 30, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {loading ? <span style={{ display: 'inline-block', width: 50, height: 30, background: '#F1F5F9', borderRadius: 6 }} /> : s.value}
            </p>
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Bottom Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>

        {/* Quick Actions */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #F1F5F9' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Quick Actions</h3>
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Common admin tasks</p>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {quickActions.map((a, i) => (
              <Link key={i} href={a.href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 10, border: '1px solid #F1F5F9', background: '#FAFAFA', textDecoration: 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: a.bg, color: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.icon}</div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>{a.label}</p>
                  <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{a.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Expiring Subscriptions */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Expiring Subscriptions</h3>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Schools requiring renewal in next 30 days</p>
            </div>
            <Link href="/admin/schools" style={{ fontSize: 12, fontWeight: 600, color: '#6366F1', textDecoration: 'none', padding: '6px 12px', background: '#EEF2FF', borderRadius: 8, border: '1px solid #E0E7FF' }}>View All →</Link>
          </div>
          <div style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 48, background: '#F8FAFC', borderRadius: 8 }} />)}
              </div>
            ) : expiring.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#F0FDF4', border: '1px solid #DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22 }}>✅</div>
                <p style={{ fontWeight: 700, color: '#15803D', fontSize: 14 }}>All Good!</p>
                <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>No schools have subscriptions expiring in the next 30 days.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                    {['School', 'Code', 'Expires On', 'Action'].map(h => (
                      <th key={h} style={{ padding: '11px 20px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === 'Action' ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expiring.map((school) => {
                    const daysLeft = Math.ceil((new Date(school.subscription_end).getTime() - Date.now()) / 86400000);
                    const isCritical = daysLeft <= 7;
                    return (
                      <tr key={school.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                        <td style={{ padding: '14px 20px', fontWeight: 600, color: '#0F172A', fontSize: 14 }}>{school.name}</td>
                        <td style={{ padding: '14px 20px' }}><span style={{ padding: '3px 8px', background: '#F1F5F9', color: '#64748B', borderRadius: 6, fontSize: 11, fontFamily: 'monospace' }}>{school.code}</span></td>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#475569' }}>{new Date(school.subscription_end).toLocaleDateString('en-IN')}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: isCritical ? '#FEE2E2' : '#FEF3C7', color: isCritical ? '#B91C1C' : '#B45309' }}>{daysLeft}d left</span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                          <button style={{ fontSize: 12, fontWeight: 600, color: '#6366F1', background: '#EEF2FF', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer' }}>Renew</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Schools Summary */}
      {!loading && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { label: 'Total Schools', value: stats.totalSchools, color: '#6366F1', bg: '#EEF2FF' },
            { label: 'Active Schools', value: stats.activeSchools, color: '#16A34A', bg: '#F0FDF4' },
            { label: 'Paused Schools', value: stats.pausedSchools, color: '#D97706', bg: '#FFFBEB' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div>
                <p style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
                <p style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', marginTop: 4, letterSpacing: '-0.02em' }}>{s.value}</p>
              </div>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
