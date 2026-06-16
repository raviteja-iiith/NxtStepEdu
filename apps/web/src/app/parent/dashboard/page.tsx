'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getParentDashboardStats } from '@school-erp/supabase/queries';

const P = { fontFamily: "'Inter', sans-serif" };

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
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const cards = [
    { label: "Today's Status", value: stats.attendanceToday, icon: '✅', grad: 'linear-gradient(135deg,#16A34A,#22C55E)', light: '#F0FDF4', border: '#BBF7D0', desc: 'Real-time attendance' },
    { label: 'Monthly Avg', value: stats.monthlyAttendance, icon: '📊', grad: 'linear-gradient(135deg,#1D4ED8,#3B82F6)', light: '#EFF6FF', border: '#BFDBFE', desc: 'This month so far' },
    { label: 'Fee Pending', value: stats.pendingFees, icon: '💰', grad: 'linear-gradient(135deg,#D97706,#F59E0B)', light: '#FFFBEB', border: '#FDE68A', desc: 'Total dues' },
    { label: 'Upcoming Exams', value: stats.examsCount.toString(), icon: '📝', grad: 'linear-gradient(135deg,#7C3AED,#A855F7)', light: '#F5F3FF', border: '#DDD6FE', desc: 'Published schedules' },
  ];

  const quickLinks = [
    { href: '/parent/attendance', icon: '📅', label: 'View Attendance', desc: 'Monthly calendar view', grad: 'linear-gradient(135deg,#16A34A,#22C55E)' },
    { href: '/parent/fees', icon: '💳', label: 'Fee Details', desc: 'View dues & history', grad: 'linear-gradient(135deg,#D97706,#F59E0B)' },
    { href: '/parent/academics', icon: '📊', label: 'View Results', desc: 'Exam marks & grades', grad: 'linear-gradient(135deg,#7C3AED,#A855F7)' },
    { href: '/parent/messages', icon: '💬', label: 'Message Teacher', desc: 'Send a message', grad: 'linear-gradient(135deg,#1D4ED8,#3B82F6)' },
  ];

  return (
    <div style={{ ...P, display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Welcome Banner */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: '40px 48px', background: 'linear-gradient(135deg, #2E1065 0%, #6D28D9 60%, #A855F7 100%)', boxShadow: '0 20px 60px rgba(109,40,217,0.3)' }}>
        <div style={{ position: 'absolute', top: '-20%', right: '-5%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-30%', left: '30%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '4px 14px', width: 'fit-content', fontSize: 11, fontWeight: 700, color: '#E9D5FF', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            Viewing Data For
          </span>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: 'white', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
            {loading ? <span style={{ display: 'inline-block', width: 200, height: 38, background: 'rgba(255,255,255,0.15)', borderRadius: 8 }} /> : <>{stats.studentName} 🎓</>}
          </h2>
          <p style={{ color: 'rgba(233,213,255,0.85)', fontSize: 14, fontWeight: 500, marginTop: 6 }}>
            Here is your child's progress and updates for {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        {cards.map((card, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 20, padding: '24px', boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: `1px solid ${card.border}`, transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'default' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 16px rgba(0,0,0,0.06)'; }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{card.label}</p>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: card.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>{card.icon}</div>
            </div>
            <p style={{ fontSize: 30, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
              {loading ? <span style={{ display: 'inline-block', width: 80, height: 30, background: '#F1F5F9', borderRadius: 6 }} /> : card.value}
            </p>
            <p style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500, margin: 0 }}>{card.desc}</p>
          </div>
        ))}
      </div>

      {/* Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>

        {/* Recent Activity */}
        <div style={{ background: 'white', borderRadius: 20, padding: '28px 32px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid #E8ECF0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>Recent Activity</h3>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>Latest updates from school</p>
            </div>
            <Link href="/parent/academics" style={{ fontSize: 13, fontWeight: 700, color: '#7C3AED', textDecoration: 'none', padding: '6px 14px', background: '#F5F3FF', borderRadius: 8 }}>View All →</Link>
          </div>
          <div style={{ padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: '#FAFAFA', borderRadius: 14, border: '1.5px dashed #E2E8F0' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'white', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 16 }}>📋</div>
            <p style={{ fontWeight: 700, color: '#475569', fontSize: 15, margin: '0 0 6px' }}>No recent activity</p>
            <p style={{ fontSize: 13, color: '#94A3B8', maxWidth: 300, lineHeight: 1.6, margin: 0 }}>Announcements, assignments, attendance, and grade updates will appear here.</p>
          </div>
        </div>

        {/* Quick Links */}
        <div style={{ background: 'white', borderRadius: 20, padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid #E8ECF0' }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: '0 0 6px', letterSpacing: '-0.01em' }}>Quick Links</h3>
          <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 20px' }}>Jump to any section</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {quickLinks.map((link, i) => (
              <Link key={i} href={link.href} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, border: '1px solid #F1F5F9', background: '#FAFAFA', textDecoration: 'none', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'white'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = '#E2E8F0'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#FAFAFA'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'none'; (e.currentTarget as HTMLAnchorElement).style.borderColor = '#F1F5F9'; }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: link.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>{link.icon}</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', margin: 0 }}>{link.label}</p>
                  <p style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, margin: '2px 0 0' }}>{link.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
