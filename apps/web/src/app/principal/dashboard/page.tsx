'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getPrincipalDashboardStats } from '@school-erp/supabase/queries';
import { getUserProfile } from '@school-erp/supabase/queries';

export default function PrincipalDashboard() {
  const supabase = createClient();
  const [userName, setUserName] = useState('');
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [userId, setUserId]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentAnnouncements, setRecentAnnouncements] = useState<{id:string;title:string;created_at:string;is_urgent:boolean}[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<{id:string;users:any;leave_type:string;from_date:string}[]>([]);
  const [stats, setStats] = useState({ totalStudents: 0, totalTeachers: 0, attendanceToday: '—', pendingFees: '₹0' });

  // ── Report modal ──────────────────────────────────────────
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // ── Broadcast modal ───────────────────────────────────────
  const [showBroadcast, setShowBroadcast]     = useState(false);
  const [broadcastSaving, setBroadcastSaving] = useState(false);
  const [broadcastDone, setBroadcastDone]     = useState(false);
  const [broadcastForm, setBroadcastForm]     = useState({ title: '', content: '', target_audience: 'all', is_urgent: false });

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const u = await getUserProfile(supabase, user.id);
      if (u) setUserName(u.full_name || 'Principal');
      if (u?.school_id) {
        setSchoolId(u.school_id);
        setUserId(user.id);
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

  /* ── Generate Report ─────────────────────────────────── */
  const handlePrint = () => {
    const el = reportRef.current;
    if (!el) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>School Report – ${dateStr}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:32px;color:#0F172A}
        h1{font-size:22px;font-weight:800;margin-bottom:4px}
        .sub{font-size:13px;color:#64748B;margin-bottom:28px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}
        .card{border:1px solid #E2E8F0;border-radius:12px;padding:18px}
        .card-label{font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.06em}
        .card-val{font-size:28px;font-weight:800;margin:6px 0 0}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{text-align:left;font-size:11px;color:#94A3B8;text-transform:uppercase;letter-spacing:.06em;padding:8px 12px;border-bottom:1px solid #F1F5F9}
        td{padding:10px 12px;border-bottom:1px solid #F8FAFC}
        .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700}
        .urgent{background:#FEF2F2;color:#DC2626}
        .normal{background:#EFF6FF;color:#1D4ED8}
        footer{margin-top:32px;font-size:11px;color:#94A3B8;border-top:1px solid #F1F5F9;padding-top:12px}
        @media print{body{padding:0}}
      </style></head><body>
      ${el.innerHTML}
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  /* ── Broadcast ───────────────────────────────────────── */
  const handleBroadcast = async () => {
    if (!broadcastForm.title || !broadcastForm.content) return;
    setBroadcastSaving(true);
    const { data: annData } = await supabase.from('announcements').insert({
      ...broadcastForm,
      school_id:  schoolId,
      created_by: userId,
    }).select('id').single();
    setBroadcastSaving(false);
    setBroadcastDone(true);

    // Notify target users via the notifications table
    if (schoolId && annData?.id) {
      const { createNotification } = await import('@/components/NotificationBell');
      let roleFilter: string[] = [];
      if (broadcastForm.target_audience === 'all') roleFilter = ['teacher', 'parent', 'principal'];
      else if (broadcastForm.target_audience === 'teachers') roleFilter = ['teacher'];
      else if (broadcastForm.target_audience === 'parents') roleFilter = ['parent'];

      const { data: recipients } = await supabase
        .from('users').select('id').eq('school_id', schoolId).in('role', roleFilter).eq('is_active', true).neq('id', userId!);

      if (recipients && recipients.length > 0) {
        await Promise.all(recipients.map((r: any) => createNotification(supabase, {
          recipient_id: r.id,
          school_id:    schoolId,
          type:         broadcastForm.is_urgent ? 'urgent_announcement' : 'announcement',
          title:        broadcastForm.title,
          body:         broadcastForm.content.slice(0, 160),
          link:         broadcastForm.target_audience === 'parents' ? '/parent/messages' : '/teacher/dashboard',
        })));
      }
    }

    setBroadcastForm({ title: '', content: '', target_audience: 'all', is_urgent: false });
    setTimeout(() => { setShowBroadcast(false); setBroadcastDone(false); }, 1800);
    // refresh recent announcements
    if (schoolId) {
      const { data: ann } = await supabase.from('announcements').select('id, title, created_at, is_urgent').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(3);
      if (ann) setRecentAnnouncements(ann as any);
    }
  };

  const statCards = [
    { label: 'Total Students', value: stats.totalStudents, desc: 'Enrolled across all classes', color: '#1D4ED8', bg: '#EFF6FF', iconBg: '#DBEAFE', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> },
    { label: 'Total Staff', value: stats.totalTeachers, desc: 'Active teaching staff', color: '#7C3AED', bg: '#F5F3FF', iconBg: '#EDE9FE', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { label: "Today's Attendance", value: stats.attendanceToday, desc: stats.attendanceToday === 'Not Taken' ? 'No teacher has marked attendance yet' : 'Of students marked today', color: stats.attendanceToday === 'Not Taken' ? '#92400E' : '#0F766E', bg: stats.attendanceToday === 'Not Taken' ? '#FFFBEB' : '#F0FDFA', iconBg: stats.attendanceToday === 'Not Taken' ? '#FDE68A' : '#CCFBF1', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { label: 'Fee Deficit', value: stats.pendingFees, desc: 'Actual unpaid balance due', color: '#DC2626', bg: '#FEF2F2', iconBg: '#FEE2E2', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
  ];

  const quickActions = [
    { href: '/principal/attendance', label: 'Check Attendance', desc: 'Daily overview', color: '#0F766E', bg: '#CCFBF1', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { href: '/principal/fees', label: 'Fee Management', desc: 'Pending dues', color: '#1D4ED8', bg: '#DBEAFE', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { href: '/principal/teachers', label: 'Manage Staff', desc: 'Teacher directory', color: '#7C3AED', bg: '#EDE9FE', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> },
    { href: '/principal/reports', label: 'View Reports', desc: 'Academic & Financial', color: '#B45309', bg: '#FEF3C7', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  ];

  return (
    <div className="dashboard-container">

      {/* Welcome Banner */}
      <div className="dashboard-banner">
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: -20, right: 100, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
        <div className="dashboard-banner-inner">
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
          <div className="dashboard-banner-buttons">
            <button onClick={() => setShowReport(true)} style={{ background: 'white', color: '#1D4ED8', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', whiteSpace: 'nowrap', flex: 1 }}>📄 Generate Report</button>
            <button onClick={() => setShowBroadcast(true)} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', whiteSpace: 'nowrap', flex: 1 }}>📢 Broadcast</button>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-cards-container">
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
      <div className="bottom-grid-container">

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

      {/* ── REPORT MODAL ─────────────────────────────────────── */}
      {showReport && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'white', borderRadius: '20px 20px 0 0', zIndex: 1 }}>
              <div>
                <p style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>📄 School Report</p>
                <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{dateStr}</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handlePrint} style={{ padding: '8px 18px', borderRadius: 10, background: '#1D4ED8', color: 'white', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🖨️ Print / Save PDF</button>
                <button onClick={() => setShowReport(false)} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>✕</button>
              </div>
            </div>

            {/* Printable Content */}
            <div ref={reportRef} style={{ padding: '24px 28px' }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>School Dashboard Report</h1>
              <p className="sub" style={{ fontSize: 13, color: '#64748B', marginBottom: 28 }}>Generated on {dateStr} · Principal: {userName}</p>

              {/* Stat Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
                {[
                  { label: 'Total Students', value: stats.totalStudents, color: '#1D4ED8' },
                  { label: 'Total Staff',    value: stats.totalTeachers, color: '#7C3AED' },
                  { label: "Today's Attendance", value: stats.attendanceToday, color: '#0F766E' },
                  { label: 'Fee Deficit',    value: stats.pendingFees,   color: '#DC2626' },
                ].map((s) => (
                  <div key={s.label} style={{ border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', margin: 0 }}>{s.label}</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: s.color, margin: '6px 0 0' }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Pending Leaves Table */}
              {pendingLeaves.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>⏳ Pending Leave Requests ({pendingLeaves.length})</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Staff Name', 'Leave Type', 'From Date'].map(h => (
                          <th key={h} style={{ textAlign: 'left', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', padding: '8px 12px', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pendingLeaves.map(l => (
                        <tr key={l.id}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #F8FAFC' }}>{(l.users as any)?.full_name || '—'}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #F8FAFC', textTransform: 'capitalize' }}>{l.leave_type?.replace(/_/g, ' ')}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #F8FAFC' }}>{new Date(l.from_date).toLocaleDateString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Recent Announcements Table */}
              {recentAnnouncements.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>📢 Recent Announcements ({recentAnnouncements.length})</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Title', 'Date', 'Priority'].map(h => (
                          <th key={h} style={{ textAlign: 'left', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', padding: '8px 12px', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentAnnouncements.map(a => (
                        <tr key={a.id}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #F8FAFC' }}>{a.title}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #F8FAFC' }}>{new Date(a.created_at).toLocaleDateString('en-IN')}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #F8FAFC' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: a.is_urgent ? '#FEF2F2' : '#EFF6FF', color: a.is_urgent ? '#DC2626' : '#1D4ED8' }}>
                              {a.is_urgent ? 'URGENT' : 'Normal'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p style={{ marginTop: 32, fontSize: 11, color: '#94A3B8', borderTop: '1px solid #F1F5F9', paddingTop: 12 }}>
                This report was auto-generated by NxtStepEdu ERP · {dateStr}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── BROADCAST MODAL ──────────────────────────────────── */}
      {showBroadcast && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 480, boxShadow: '0 24px 80px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg,#1E3A8A,#2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>📢 Broadcast Announcement</p>
                <p style={{ fontSize: 12, color: 'rgba(191,219,254,0.85)', marginTop: 2 }}>Send to teachers, parents, or everyone</p>
              </div>
              <button onClick={() => { setShowBroadcast(false); setBroadcastForm({ title: '', content: '', target_audience: 'all', is_urgent: false }); }} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: 15, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {broadcastDone ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <p style={{ fontSize: 40, margin: '0 0 12px' }}>✅</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#15803D' }}>Broadcast Sent!</p>
                <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>Your announcement has been posted successfully.</p>
              </div>
            ) : (
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Title */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Title *</label>
                    <input
                      value={broadcastForm.title}
                      onChange={e => setBroadcastForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. School closed tomorrow"
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  {/* Content */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Message *</label>
                    <textarea
                      value={broadcastForm.content}
                      onChange={e => setBroadcastForm(f => ({ ...f, content: e.target.value }))}
                      placeholder="Write your announcement here…"
                      rows={4}
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  {/* Audience + Urgent row */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Audience</label>
                      <select
                        value={broadcastForm.target_audience}
                        onChange={e => setBroadcastForm(f => ({ ...f, target_audience: e.target.value }))}
                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 14, outline: 'none', background: 'white' }}
                      >
                        <option value="all">Everyone</option>
                        <option value="teachers">Teachers Only</option>
                        <option value="parents">Parents Only</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
                      <input
                        type="checkbox"
                        id="bc-urgent"
                        checked={broadcastForm.is_urgent}
                        onChange={e => setBroadcastForm(f => ({ ...f, is_urgent: e.target.checked }))}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <label htmlFor="bc-urgent" style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', cursor: 'pointer', whiteSpace: 'nowrap' }}>🔴 Urgent</label>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                  <button
                    onClick={() => { setShowBroadcast(false); setBroadcastForm({ title: '', content: '', target_audience: 'all', is_urgent: false }); }}
                    style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#374151' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBroadcast}
                    disabled={broadcastSaving || !broadcastForm.title || !broadcastForm.content}
                    style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: broadcastSaving ? '#93C5FD' : '#1E3A8A', color: 'white', fontWeight: 700, fontSize: 14, cursor: broadcastSaving ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}
                  >
                    {broadcastSaving ? 'Sending…' : '📢 Send Broadcast'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
