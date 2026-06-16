'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const navGroups = [
  { title: 'Overview', items: [
    { href: '/parent/dashboard', label: 'Home', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg> }
  ]},
  { title: 'My Child', items: [
    { href: '/parent/attendance', label: 'Attendance', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { href: '/parent/academics', label: 'Academics', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> },
  ]},
  { title: 'Finance', items: [
    { href: '/parent/fees', label: 'Fees', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
  ]},
  { title: 'Communication', items: [
    { href: '/parent/messages', label: 'Messages', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    { href: '/parent/documents', label: 'Documents', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
    { href: '/parent/calendar', label: 'Calendar', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  ]},
  { title: 'Account', items: [
    { href: '/parent/profile', label: 'Profile', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  ]},
];

const allNavItems = navGroups.flatMap(g => g.items);

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [collapsed, setCollapsed] = useState(false);
  const [userName, setUserName] = useState('');
  const [childName, setChildName] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('users').select('full_name').eq('id', user.id).single();
        if (data) setUserName(data.full_name || 'Parent');
        const { data: link } = await supabase.from('student_parent_links').select('students(full_name)').eq('parent_id', user.id).limit(1).maybeSingle();
        if (link) setChildName(((link.students as Record<string, string>)?.full_name) || '');
      }
    }
    load();
  }, [supabase]);

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push('/login'); };
  const initials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'P';
  const currentNav = allNavItems.find(n => pathname === n.href || pathname.startsWith(n.href + '/'));

  return (
    <div className="min-h-screen flex" style={{ background: '#F0F2F5' }}>
      <aside className="fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300"
        style={{ width: collapsed ? '68px' : '256px', background: 'linear-gradient(180deg, #1E1035 0%, #2D1B69 100%)', boxShadow: '4px 0 24px rgba(0,0,0,0.15)' }}>
        <div style={{ padding: collapsed ? '20px 14px' : '20px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: 72 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #7C3AED, #A855F7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(124,58,237,0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>NxtStepEdu</p>
                <p style={{ color: '#C4B5FD', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>Parent Portal</p>
              </div>
            )}
          </div>
        </div>

        {!collapsed && childName && (
          <div style={{ margin: '12px 12px 0', padding: '10px 12px', borderRadius: 10, background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(167,139,250,0.2)' }}>
            <p style={{ fontSize: 9, color: '#A78BFA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Viewing For</p>
            <p style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>{childName}</p>
          </div>
        )}

        <nav style={{ flex: 1, padding: '16px 10px', overflowY: 'auto' }}>
          {navGroups.map((group) => (
            <div key={group.title} style={{ marginBottom: 24 }}>
              {!collapsed && <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 10px', marginBottom: 6 }}>{group.title}</p>}
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '10px 14px' : '9px 12px', borderRadius: 8, marginBottom: 2, color: isActive ? 'white' : '#94A3B8', background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent', borderLeft: isActive ? '3px solid #A855F7' : '3px solid transparent', fontSize: 13, fontWeight: isActive ? 600 : 400, transition: 'all 0.15s ease', textDecoration: 'none', justifyContent: collapsed ? 'center' : 'flex-start' }}>
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
          <button onClick={handleSignOut} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: '#F87171', cursor: 'pointer', fontSize: 13, justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col transition-all duration-300" style={{ marginLeft: collapsed ? '68px' : '256px', minHeight: '100vh' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2E8F0', boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>{currentNav?.label || 'Home'}</h1>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 1, fontWeight: 500 }}>Parent Portal{childName ? ` · ${childName}` : ''}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B', position: 'relative' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                <span style={{ position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: '50%', background: '#EF4444', border: '2px solid white' }} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '6px 14px 6px 8px' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #2E1065, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials}</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', lineHeight: 1.2 }}>{userName || 'Parent'}</p>
                  <p style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parent</p>
                </div>
              </div>
            </div>
          </div>
        </header>
        <div style={{ padding: '40px 48px', flex: 1, maxWidth: 1280 }}>{children}</div>
      </main>
    </div>
  );
}
