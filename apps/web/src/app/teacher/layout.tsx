'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import NotificationBell from '@/components/NotificationBell';
import { useIsMobile } from '@/hooks/useIsMobile';

// requiresClassTeacher = true → hidden + URL-blocked for pure subject teachers
const navGroups = [
  { title: 'Overview', items: [
    { href: '/teacher/dashboard', label: 'Dashboard', requiresClassTeacher: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> }
  ]},
  { title: 'Classroom', items: [
    { href: '/teacher/attendance', label: 'Attendance', requiresClassTeacher: true,  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { href: '/teacher/assignments', label: 'Assignments', requiresClassTeacher: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { href: '/teacher/marks', label: 'Marks Entry', requiresClassTeacher: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  ]},
  { title: 'People', items: [
    { href: '/teacher/students',  label: 'My Students', requiresClassTeacher: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> },
    { href: '/teacher/parents',   label: 'Parents',     requiresClassTeacher: true,  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    { href: '/teacher/reset-requests', label: 'PIN Resets', requiresClassTeacher: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
  ]},
  { title: 'Planning', items: [
    { href: '/teacher/lesson-plans', label: 'Lesson Plans', requiresClassTeacher: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> },
    { href: '/teacher/resources',    label: 'Resources',    requiresClassTeacher: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> },
  ]},
  { title: 'Communication', items: [
    { href: '/teacher/messages', label: 'Messages', requiresClassTeacher: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    { href: '/teacher/leave',    label: 'Leave',    requiresClassTeacher: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  ]},
];

// Restricted pages that subject teachers cannot directly navigate to via URL
const CLASS_TEACHER_ONLY_PATHS = ['/teacher/attendance', '/teacher/parents'];

const allNavItems = navGroups.flatMap(g => g.items);

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState('');
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [isClassTeacher, setIsClassTeacher] = useState<boolean | null>(null); // null = still loading
  const isMobile = useIsMobile();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('users').select('full_name').eq('id', user.id).single();
        if (data) setUserName(data.full_name || 'Teacher');
        // Check if this teacher is a class teacher for ANY section
        const { count } = await supabase.from('sections')
          .select('id', { count: 'exact', head: true })
          .eq('class_teacher_id', user.id);
        setIsClassTeacher((count ?? 0) > 0);
      }
    }
    load();
  }, [supabase]);

  // URL guard: if a subject teacher directly navigates to a class-teacher-only page, redirect
  useEffect(() => {
    if (isClassTeacher === false && CLASS_TEACHER_ONLY_PATHS.some(p => pathname.startsWith(p))) {
      router.replace('/teacher/dashboard');
    }
  }, [isClassTeacher, pathname, router]);

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push('/login'); };
  const initials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'T';
  const currentNav = allNavItems.find(n => pathname === n.href || pathname.startsWith(n.href + '/'));
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Filter groups: hide class-teacher-only items for subject teachers
  const visibleGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item => !item.requiresClassTeacher || isClassTeacher !== false),
  })).filter(group => group.items.length > 0);

  return (
    <div className="min-h-screen flex" style={{ background: '#F0F2F5' }}>
      {isMobile && sidebarOpen && <div className="sidebar-overlay open" onClick={() => setSidebarOpen(false)} />}
      <aside className={`portal-sidebar fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300${isMobile ? (sidebarOpen ? ' open' : '') : ''}`}
        style={{ width: isMobile ? '280px' : (collapsed ? '68px' : '256px'), background: 'linear-gradient(180deg, #042F2E 0%, #0F4C47 100%)', boxShadow: '4px 0 24px rgba(0,0,0,0.15)' }}>
        <div style={{ padding: collapsed ? '20px 14px' : '20px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: 72 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #0D9488, #14B8A6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(20,184,166,0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>NxtStepEdu</p>
                <p style={{ color: '#5EEAD4', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
                  {isClassTeacher === true ? 'Class Teacher' : isClassTeacher === false ? 'Subject Teacher' : 'Teacher Portal'}
                </p>
              </div>
            )}
          </div>
        </div>

        <nav style={{ flex: 1, padding: '16px 10px', overflowY: 'auto' }}>
          {visibleGroups.map((group) => (
            <div key={group.title} style={{ marginBottom: 24 }}>
              {!collapsed && <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 10px', marginBottom: 6 }}>{group.title}</p>}
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '10px 14px' : '9px 12px', borderRadius: 8, marginBottom: 2, color: isActive ? 'white' : '#94A3B8', background: isActive ? 'rgba(20,184,166,0.15)' : 'transparent', borderLeft: isActive ? '3px solid #14B8A6' : '3px solid transparent', fontSize: 13, fontWeight: isActive ? 600 : 400, transition: 'all 0.15s ease', textDecoration: 'none', justifyContent: collapsed ? 'center' : 'flex-start' }}>
                    <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => setCollapsed(!collapsed)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: 13, justifyContent: collapsed ? 'center' : 'flex-start', marginBottom: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{collapsed ? <><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></> : <><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></>}</svg>
            {!collapsed && <span>Collapse</span>}
          </button>
          <button onClick={() => setShowChangePwd(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: 13, justifyContent: collapsed ? 'center' : 'flex-start', marginBottom: 2 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            {!collapsed && <span>Change Password</span>}
          </button>
          <button onClick={handleSignOut} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: '#F87171', cursor: 'pointer', fontSize: 13, justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      <main className="portal-main flex-1 flex flex-col transition-all duration-300" style={{ marginLeft: isMobile ? 0 : (collapsed ? '68px' : '256px'), minHeight: '100vh' }}>
        <header className="portal-topbar" style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2E8F0', boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
          <div style={{ padding: isMobile ? '0 12px' : '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isMobile && (
                <button onClick={() => setSidebarOpen(o => !o)} style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#374151', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
              )}
              <div>
                <h1 style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>{currentNav?.label || 'Dashboard'}</h1>
                {!isMobile && (
                  <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 1, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    Teacher Portal
                    {isClassTeacher !== null && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: isClassTeacher ? '#DCFCE7' : '#EFF6FF', color: isClassTeacher ? '#15803D' : '#1D4ED8' }}>
                        {isClassTeacher ? '🏫 Class Teacher' : '📚 Subject Teacher'}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <NotificationBell accentColor="#0F766E" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '6px 14px 6px 8px' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #042F2E, #0F766E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials}</div>
                {!isMobile && (
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', lineHeight: 1.2 }}>{userName || 'Teacher'}</p>
                    <p style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Teacher</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <div className="portal-main-content content-page" style={{ padding: isMobile ? '16px' : '32px', flex: 1 }}>{children}</div>
      </main>
      {showChangePwd && <ChangePasswordModal accentColor="#0F766E" onClose={() => setShowChangePwd(false)} />}
    </div>
  );
}
