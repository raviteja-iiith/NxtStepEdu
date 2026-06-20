'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const navGroups = [
  { title: 'Overview', items: [
    { href: '/admin/dashboard', label: 'Dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> }
  ]},
  { title: 'Management', items: [
    { href: '/admin/schools', label: 'Schools', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg> },
    { href: '/admin/principals', label: 'Principals', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  ]},
  { title: 'Insights', items: [
    { href: '/admin/analytics', label: 'Analytics', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
    { href: '/admin/settings', label: 'Settings', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
  ]},
];

const allNavItems = navGroups.flatMap(g => g.items);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [collapsed, setCollapsed] = useState(false);
  const [adminName, setAdminName] = useState('Admin');
  const initials = adminName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'A';

  useEffect(() => {
    if (pathname === '/admin/login') return;
    const loadUser = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const { data: userRow } = await supabase.from('users').select('full_name').eq('id', authData.user.id).single();
        const name = (userRow as { full_name?: string } | null)?.full_name;
        if (name) setAdminName(name);
      }
    };
    loadUser();
  }, [pathname, supabase]);

  if (pathname === '/admin/login') return <>{children}</>;

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push('/admin/login'); };
  const currentNav = allNavItems.find(n => pathname === n.href || pathname.startsWith(n.href + '/'));

  return (
    <div className="min-h-screen flex" style={{ background: '#F0F2F5' }}>
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300"
        style={{ width: collapsed ? '68px' : '256px', background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)', boxShadow: '4px 0 24px rgba(0,0,0,0.15)', color: 'white' }}>

        {/* Logo */}
        <div style={{ padding: collapsed ? '20px 14px' : '20px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: 72 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>NxtStepEdu</p>
                <p style={{ color: '#A5B4FC', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>Super Admin</p>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 10px', overflowY: 'auto' }}>
          {navGroups.map((group) => (
            <div key={group.title} style={{ marginBottom: 24 }}>
              {!collapsed && <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 10px', marginBottom: 6 }}>{group.title}</p>}
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '10px 14px' : '9px 12px', borderRadius: 8, marginBottom: 2, color: isActive ? 'white' : '#94A3B8', background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent', borderLeft: isActive ? '3px solid #6366F1' : '3px solid transparent', fontSize: 13, fontWeight: isActive ? 600 : 400, transition: 'all 0.15s ease', textDecoration: 'none', justifyContent: collapsed ? 'center' : 'flex-start' }}>
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

      {/* Main */}
      <main className="flex-1 flex flex-col transition-all duration-300" style={{ marginLeft: collapsed ? '68px' : '256px', minHeight: '100vh' }}>
        {/* Topbar */}
        <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2E8F0', boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>{currentNav?.label || 'Admin Portal'}</h1>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 1, fontWeight: 500 }}>Super Admin · System Management</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B', position: 'relative' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                <span style={{ position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: '50%', background: '#EF4444', border: '2px solid white' }} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '6px 14px 6px 8px' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #4338CA, #6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials}</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', lineHeight: 1.2 }}>{adminName}</p>
                  <p style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Super Admin</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ padding: '32px', flex: 1 }}>{children}</div>
      </main>
    </div>
  );
}
