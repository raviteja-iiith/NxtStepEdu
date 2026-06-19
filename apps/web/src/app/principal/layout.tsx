'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ChangePasswordModal from '@/components/ChangePasswordModal';

interface AcademicYear { id:string; name:string; is_current:boolean; }

const navGroups = [
  {
    title: 'Overview',
    items: [{ href: '/principal/dashboard', label: 'Dashboard', icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
    )}]
  },
  {
    title: 'Academics',
    items: [
      { href: '/principal/classes', label: 'Classes & Sections', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg> },
      { href: '/principal/subjects', label: 'Subjects', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> },
      { href: '/principal/timetable', label: 'Timetable', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    ]
  },
  {
    title: 'People',
    items: [
      { href: '/principal/teachers', label: 'Teachers', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
      { href: '/principal/students', label: 'Students', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> },
      { href: '/principal/parents', label: 'Parents', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    ]
  },
  {
    title: 'Exams',
    items: [
      { href: '/principal/exams', label: 'Exam Management', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
      { href: '/principal/marks', label: 'Marks & Results', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
      { href: '/principal/question-bank', label: 'Question Bank', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> },
    ]
  },
  {
    title: 'Administration',
    items: [
      { href: '/principal/attendance', label: 'Attendance', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
      { href: '/principal/fees', label: 'Fee Management', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
      { href: '/principal/reports', label: 'Reports', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
      { href: '/principal/settings/academic-years', label: 'Academic Years', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="7" y1="14" x2="7" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/></svg> },
      { href: '/principal/settings/promotion', label: 'Class Promotion', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/><polyline points="17 21 17 18"/><polyline points="21 19 17 21 13 19"/></svg> },
    ]
  },
];

const allNavItems = navGroups.flatMap(g => g.items);

export default function PrincipalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [collapsed, setCollapsed] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [userName, setUserName]   = useState('');
  const [years, setYears]         = useState<AcademicYear[]>([]);
  const [viewingYearId, setViewingYearId] = useState('');
  const [schoolId, setSchoolId]   = useState('');
  const [showChangePwd, setShowChangePwd] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('users').select('full_name, school_id').eq('id', user.id).single();
        if (data) {
          setUserName(data.full_name || 'Principal');
          if (data.school_id) {
            setSchoolId(data.school_id);
            const { data: school } = await supabase.from('schools').select('name').eq('id', data.school_id).single();
            setSchoolName(school?.name || 'School Portal');
            // Load academic years
            const { data: yrs } = await supabase.from('academic_years').select('id,name,is_current').eq('school_id',data.school_id).order('start_date',{ascending:false});
            if (yrs) {
              setYears(yrs);
              const cur = yrs.find((y:AcademicYear) => y.is_current);
              setViewingYearId(cur?.id || yrs[0]?.id || '');
            }
          }
        }
      }
    }
    load();
  }, [supabase]);

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push('/login'); };
  const initials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'P';
  const currentNav = allNavItems.find(n => pathname === n.href || pathname.startsWith(n.href + '/'));
  const currentYear = years.find(y => y.is_current);
  const viewingYear = years.find(y => y.id === viewingYearId);
  const isViewingPast = !!viewingYear && !!currentYear && viewingYear.id !== currentYear.id;

  return (
    <div className="min-h-screen flex" style={{ background: '#F0F2F5' }}>
      {/* Sidebar */}
      <aside
        className="fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300"
        style={{
          width: collapsed ? '68px' : '256px',
          background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
        }}
      >
        {/* Logo */}
        <div style={{ padding: collapsed ? '20px 14px' : '20px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: 72 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #3B82F6, #6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 14, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{schoolName || 'NxtStepEdu'}</p>
                <p style={{ color: '#60A5FA', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>Principal Portal</p>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 10px', overflowY: 'auto' }}>
          {navGroups.map((group) => (
            <div key={group.title} style={{ marginBottom: 24 }}>
              {!collapsed && (
                <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 10px', marginBottom: 6 }}>{group.title}</p>
              )}
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: collapsed ? '10px 14px' : '9px 12px',
                      borderRadius: 8, marginBottom: 2,
                      color: isActive ? 'white' : '#94A3B8',
                      background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                      borderLeft: isActive ? '3px solid #3B82F6' : '3px solid transparent',
                      fontSize: 13, fontWeight: isActive ? 600 : 400,
                      transition: 'all 0.15s ease', textDecoration: 'none',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.color = 'white'; }}
                    onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#94A3B8'; } }}
                  >
                    <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => setCollapsed(!collapsed)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: 13, justifyContent: collapsed ? 'center' : 'flex-start', marginBottom: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? <><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></> : <><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></>}
            </svg>
            {!collapsed && <span>Collapse</span>}
          </button>
          <button onClick={() => setShowChangePwd(true)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: 13, justifyContent: collapsed ? 'center' : 'flex-start', marginBottom: 2 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            {!collapsed && <span>Change Password</span>}
          </button>
          <button onClick={handleSignOut}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: '#F87171', cursor: 'pointer', fontSize: 13, justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col transition-all duration-300" style={{ marginLeft: collapsed ? '68px' : '256px', minHeight: '100vh' }}>
        {/* Topbar */}
        <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2E8F0', boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>{currentNav?.label || 'Dashboard'}</h1>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 1, fontWeight: 500 }}>Principal Portal · {schoolName}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Year Switcher */}
              {years.length > 0 && (
                <div style={{ display:'flex', alignItems:'center', gap:6, background:isViewingPast?'#FFFBEB':'#F0FDF4', border:`1px solid ${isViewingPast?'#FDE68A':'#BBF7D0'}`, borderRadius:10, padding:'5px 10px 5px 8px' }}>
                  <span style={{ fontSize:13 }}>{isViewingPast ? '📂' : '📅'}</span>
                  <select value={viewingYearId} onChange={e => setViewingYearId(e.target.value)}
                    style={{ fontSize:12, fontWeight:700, color:isViewingPast?'#92400E':'#15803D', background:'transparent', border:'none', outline:'none', cursor:'pointer', paddingRight:4 }}>
                    {years.map(y => (
                      <option key={y.id} value={y.id}>{y.name}{y.is_current?' (Current)':''}</option>
                    ))}
                  </select>
                </div>
              )}
              <button style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B', position: 'relative' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                <span style={{ position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: '50%', background: '#EF4444', border: '2px solid white' }} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '6px 14px 6px 8px' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials}</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', lineHeight: 1.2 }}>{userName || 'Principal'}</p>
                  <p style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Principal</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Past-year archive banner */}
        {isViewingPast && (
          <div style={{ margin:'16px 32px 0', padding:'10px 16px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:16 }}>📂</span>
            <p style={{ fontSize:13, color:'#92400E', margin:0, fontWeight:600 }}>
              Viewing archived data for <strong>{viewingYear?.name}</strong> — this is read-only. Switch to <strong>{currentYear?.name}</strong> to make changes.
            </p>
            <button onClick={() => setViewingYearId(currentYear?.id||'')} style={{ marginLeft:'auto', fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:7, border:'1px solid #FDE68A', background:'white', color:'#D97706', cursor:'pointer', whiteSpace:'nowrap' }}>Go to Current Year</button>
          </div>
        )}
        {/* Content */}
        <div style={{ padding: '32px', flex: 1 }}>{children}</div>
      </main>
      {showChangePwd && <ChangePasswordModal accentColor="#1E3A8A" onClose={() => setShowChangePwd(false)} />}
    </div>
  );
}
