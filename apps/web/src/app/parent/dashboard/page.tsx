'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParent } from '@/context/ParentContext';

interface Announcement {
  id: string;
  title: string;
  content: string;
  target_audience: string;
  is_urgent: boolean;
  created_at: string;
}

const P = { fontFamily: "'Inter', sans-serif" };

export default function ParentDashboard() {
  const supabase = createClient();
  const { selectedChild, loading: childLoading } = useParent();

  const [stats, setStats] = useState({
    attendanceToday: '—',
    monthlyAttendance: '—%',
    pendingFees: '₹0',
    examsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  // fetch school_id once
  useEffect(() => {
    const getSchool = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('school_id').eq('id', user.id).single();
      if (data?.school_id) setSchoolId(data.school_id);
    };
    getSchool();
  }, []);

  // fetch announcements whenever schoolId is ready
  useEffect(() => {
    if (!schoolId) return;
    const fetchAnnouncements = async () => {
      const { data } = await supabase
        .from('announcements')
        .select('id, title, content, target_audience, is_urgent, created_at')
        .eq('school_id', schoolId)
        .in('target_audience', ['all', 'parents'])
        .order('created_at', { ascending: false })
        .limit(5);
      if (data) setAnnouncements(data as Announcement[]);
    };
    fetchAnnouncements();
  }, [schoolId]);

  const fetchStats = useCallback(async () => {
    if (!selectedChild) return;
    setLoading(true);

    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const { student_id, section_id, class_id } = selectedChild;

    // Build exam count query — include section-specific AND class-wide (section_id = null on exam)
    const buildExamCountQ = () => {
      if (!section_id) return Promise.resolve({ count: 0 });
      let q = supabase.from('exams').select('*', { count: 'exact', head: true }).eq('is_published', true).gte('exam_date', today);
      if (class_id) return q.or(`section_id.eq.${section_id},and(section_id.is.null,class_id.eq.${class_id})`);
      return q.eq('section_id', section_id);
    };

    const [todayAtt, monthlyAtt, fees, examsRes] = await Promise.all([
      supabase.from('attendance').select('status').eq('student_id', student_id).eq('date', today).maybeSingle(),
      supabase.from('attendance').select('status').eq('student_id', student_id).gte('date', firstOfMonth).lte('date', today),
      supabase.from('fees').select('amount, discount_amount').eq('student_id', student_id).in('status', ['pending', 'overdue']),
      buildExamCountQ(),
    ]);

    let monthlyAttendance = '—%';
    if (monthlyAtt.data && monthlyAtt.data.length > 0) {
      const presentCount = monthlyAtt.data.filter((a: { status: string }) => a.status === 'present' || a.status === 'late').length;
      monthlyAttendance = `${Math.round((presentCount / monthlyAtt.data.length) * 100)}%`;
    }

    const totalFees = fees.data ? fees.data.reduce((acc: number, f: any) => acc + Math.max(0, (f.amount || 0) - (f.discount_amount || 0)), 0) : 0;

    setStats({
      attendanceToday: todayAtt.data
        ? (todayAtt.data.status === 'present' ? '✅ Present'
          : todayAtt.data.status === 'absent' ? '❌ Absent'
          : todayAtt.data.status === 'late' ? '🕐 Late' : '📋 Excused')
        : '—',
      monthlyAttendance,
      pendingFees: `₹${totalFees.toLocaleString('en-IN')}`,
      examsCount: (examsRes as any).count || 0,
    });
    setLoading(false);
  }, [supabase, selectedChild]);

  useEffect(() => {
    if (!childLoading && selectedChild) fetchStats();
    else if (!childLoading && !selectedChild) setLoading(false);
  }, [fetchStats, selectedChild, childLoading]);

  const cards = [
    { label: "Today's Status",  value: stats.attendanceToday,    icon: '✅', grad: 'linear-gradient(135deg,#16A34A,#22C55E)', light: '#F0FDF4', border: '#BBF7D0', desc: 'Real-time attendance' },
    { label: 'Monthly Avg',     value: stats.monthlyAttendance,  icon: '📊', grad: 'linear-gradient(135deg,#1D4ED8,#3B82F6)', light: '#EFF6FF', border: '#BFDBFE', desc: 'This month so far' },
    { label: 'Fee Pending',     value: stats.pendingFees,        icon: '💰', grad: 'linear-gradient(135deg,#D97706,#F59E0B)', light: '#FFFBEB', border: '#FDE68A', desc: 'Total dues' },
    { label: 'Upcoming Exams', value: stats.examsCount.toString(), icon: '📝', grad: 'linear-gradient(135deg,#7C3AED,#A855F7)', light: '#F5F3FF', border: '#DDD6FE', desc: 'Published schedules' },
  ];

  const quickLinks = [
    { href: '/parent/attendance', icon: '📅', label: 'View Attendance', desc: 'Monthly calendar view',  grad: 'linear-gradient(135deg,#16A34A,#22C55E)' },
    { href: '/parent/fees',       icon: '💳', label: 'Fee Details',     desc: 'View dues & history',   grad: 'linear-gradient(135deg,#D97706,#F59E0B)' },
    { href: '/parent/academics',  icon: '📊', label: 'View Results',    desc: 'Exam marks & grades',   grad: 'linear-gradient(135deg,#7C3AED,#A855F7)' },
    { href: '/parent/messages',   icon: '💬', label: 'Message Teacher', desc: 'Send a message',        grad: 'linear-gradient(135deg,#1D4ED8,#3B82F6)' },
  ];

  const isLoading = loading || childLoading;

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
            {isLoading
              ? <span style={{ display: 'inline-block', width: 200, height: 38, background: 'rgba(255,255,255,0.15)', borderRadius: 8 }} />
              : <>{selectedChild?.student_name || 'No Child Linked'} 🎓</>
            }
          </h2>
          {selectedChild && (
            <p style={{ color: 'rgba(233,213,255,0.7)', fontSize: 13, fontWeight: 500, marginTop: 2 }}>
              Class {selectedChild.class_name} · Section {selectedChild.section_name}
            </p>
          )}
          <p style={{ color: 'rgba(233,213,255,0.85)', fontSize: 14, fontWeight: 500, marginTop: 4 }}>
            Here is your child&apos;s progress and updates for {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="stat-cards-container">
        {cards.map((card, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 20, padding: '24px', boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: `1px solid ${card.border}`, transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'default' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 16px rgba(0,0,0,0.06)'; }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{card.label}</p>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: card.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>{card.icon}</div>
            </div>
            <p style={{ fontSize: 30, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
              {isLoading ? <span style={{ display: 'inline-block', width: 80, height: 30, background: '#F1F5F9', borderRadius: 6 }} /> : card.value}
            </p>
            <p style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500, margin: 0 }}>{card.desc}</p>
          </div>
        ))}
      </div>

      {/* Content Grid */}
      <div className="bottom-grid-container">

        {/* Announcements from School */}
        <div style={{ background: 'white', borderRadius: 20, padding: '28px 32px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid #E8ECF0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>📢 School Announcements</h3>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>Latest broadcasts from your school</p>
            </div>
          </div>

          {announcements.length === 0 ? (
            <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: '#FAFAFA', borderRadius: 14, border: '1.5px dashed #E2E8F0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'white', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 12 }}>🔕</div>
              <p style={{ fontWeight: 700, color: '#475569', fontSize: 14, margin: '0 0 4px' }}>No announcements yet</p>
              <p style={{ fontSize: 12, color: '#94A3B8', maxWidth: 260, lineHeight: 1.6, margin: 0 }}>When the principal posts a broadcast, it will show up here.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {announcements.map(a => (
                <div key={a.id} style={{ padding: '14px 16px', borderRadius: 12, border: `1px solid ${a.is_urgent ? '#FECACA' : '#E8ECF0'}`, background: a.is_urgent ? '#FFF5F5' : '#FAFAFA', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: a.is_urgent ? '#FEF2F2' : '#EFF6FF', border: `1px solid ${a.is_urgent ? '#FEE2E2' : '#DBEAFE'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    {a.is_urgent ? '🚨' : '📢'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>{a.title}</p>
                      {a.is_urgent && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 99, background: '#DC2626', color: 'white' }}>URGENT</span>}
                    </div>
                    <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 4px', lineHeight: 1.5 }}>{a.content}</p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
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
