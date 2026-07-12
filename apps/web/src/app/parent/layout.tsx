'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentProvider, useParent } from '@/context/ParentContext';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import NotificationBell from '@/components/NotificationBell';
import { useIsMobile } from '@/hooks/useIsMobile';

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

// ─── Child Switcher Dropdown ────────────────────────────────────────────────
function ChildSwitcher({ collapsed }: { collapsed: boolean }) {
  const { children, selectedChild, setSelectedChild } = useParent();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!selectedChild) return null;

  const hasMultiple = children.length > 1;

  if (collapsed) {
    // Collapsed: just show avatar with tooltip
    return (
      <div style={{ margin: '12px 10px 0', position: 'relative' }} ref={ref}>
        {hasMultiple ? (
          <button
            onClick={() => setOpen(o => !o)}
            title={`Viewing: ${selectedChild.student_name}\nClick to switch child`}
            style={{
              width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center',
              background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 10, padding: '8px', cursor: 'pointer', position: 'relative',
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: 'white',
            }}>
              {selectedChild.student_name.charAt(0)}
            </div>
            {/* Badge showing count */}
            <span style={{
              position: 'absolute', top: 4, right: 4, width: 14, height: 14,
              borderRadius: '50%', background: '#F59E0B', color: 'white',
              fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1.5px solid #2D1B69',
            }}>
              {children.length}
            </span>
          </button>
        ) : (
          <div style={{
            display: 'flex', justifyContent: 'center', padding: '8px',
            background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: 'white',
            }}>
              {selectedChild.student_name.charAt(0)}
            </div>
          </div>
        )}

        {/* Dropdown when collapsed */}
        {open && hasMultiple && (
          <div style={{
            position: 'absolute', left: 'calc(100% + 10px)', top: 0, zIndex: 100,
            background: '#1E1035', border: '1px solid rgba(167,139,250,0.3)',
            borderRadius: 12, padding: '8px', minWidth: 200,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <p style={{ fontSize: 9, color: '#A78BFA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '4px 8px 8px' }}>
              Switch Child
            </p>
            {children.map(child => (
              <button
                key={child.student_id}
                onClick={() => { setSelectedChild(child); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: selectedChild.student_id === child.student_id ? 'rgba(139,92,246,0.2)' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: selectedChild.student_id === child.student_id
                    ? 'linear-gradient(135deg, #7C3AED, #A855F7)'
                    : 'rgba(167,139,250,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: 'white',
                }}>
                  {child.student_name.charAt(0)}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'white', margin: 0 }}>{child.student_name}</p>
                  <p style={{ fontSize: 10, color: '#A78BFA', margin: 0 }}>Class {child.class_name} – {child.section_name}</p>
                </div>
                {selectedChild.student_id === child.student_id && (
                  <svg style={{ marginLeft: 'auto', flexShrink: 0 }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Expanded sidebar
  return (
    <div style={{ margin: '12px 12px 0', position: 'relative' }} ref={ref}>
      <div style={{ borderRadius: 10, background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(167,139,250,0.2)', overflow: 'visible' }}>
        <p style={{ fontSize: 9, color: '#A78BFA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 12px 0', margin: 0 }}>
          {hasMultiple ? 'Viewing Child' : 'Viewing For'}
        </p>

        {hasMultiple ? (
          // Dropdown trigger
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px 10px', border: 'none', background: 'transparent',
              cursor: 'pointer', borderRadius: 10,
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: 'white',
            }}>
              {selectedChild.student_name.charAt(0)}
            </div>
            <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
              <p style={{ color: 'white', fontSize: 13, fontWeight: 700, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedChild.student_name}
              </p>
              <p style={{ color: '#A78BFA', fontSize: 10, margin: 0 }}>
                Class {selectedChild.class_name} · {selectedChild.section_name}
              </p>
            </div>
            <svg
              style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        ) : (
          // Single child — no dropdown, just display
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px 10px' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: 'white',
            }}>
              {selectedChild.student_name.charAt(0)}
            </div>
            <div>
              <p style={{ color: 'white', fontSize: 13, fontWeight: 700, margin: 0 }}>{selectedChild.student_name}</p>
              <p style={{ color: '#A78BFA', fontSize: 10, margin: 0 }}>Class {selectedChild.class_name} · {selectedChild.section_name}</p>
            </div>
          </div>
        )}
      </div>

      {/* Dropdown panel */}
      {open && hasMultiple && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 100,
          background: '#1A0D3B', border: '1px solid rgba(167,139,250,0.3)',
          borderRadius: 12, padding: '8px', overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <p style={{ fontSize: 9, color: '#A78BFA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '4px 8px 8px' }}>
            Switch Child
          </p>
          {children.map(child => {
            const isActive = selectedChild.student_id === child.student_id;
            return (
              <button
                key={child.student_id}
                onClick={() => { setSelectedChild(child); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: isActive ? 'rgba(139,92,246,0.25)' : 'transparent',
                  marginBottom: 2, transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.1)'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: isActive ? 'linear-gradient(135deg, #7C3AED, #A855F7)' : 'rgba(167,139,250,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: 'white',
                }}>
                  {child.student_name.charAt(0)}
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'white', margin: 0 }}>{child.student_name}</p>
                  <p style={{ fontSize: 10, color: '#94A3B8', margin: 0 }}>Class {child.class_name} – {child.section_name}</p>
                </div>
                {isActive && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Inner layout (uses context) ─────────────────────────────────────────────
function ParentLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { selectedChild, parentName } = useParent();
  const [showChangePwd, setShowChangePwd] = useState(false);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push('/login'); };
  const initials = parentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'P';
  const currentNav = allNavItems.find(n => pathname === n.href || pathname.startsWith(n.href + '/'));

  const bottomTabs = [
    { href: '/parent/dashboard', label: 'Home', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg> },
    { href: '/parent/fees', label: 'Fees', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { href: '/parent/attendance', label: 'Attend.', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { href: '/parent/academics', label: 'Marks', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
    { href: '/parent/profile', label: 'Profile', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: '#F0F2F5' }}>
      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && <div className="sidebar-overlay open" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar — hidden on mobile unless open */}
      {(!isMobile || sidebarOpen) && (
      <aside className={`portal-sidebar fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300${isMobile ? ' open' : ''}`}
        style={{ width: isMobile ? '280px' : (collapsed ? '68px' : '256px'), background: 'linear-gradient(180deg, #1E1035 0%, #2D1B69 100%)', boxShadow: '4px 0 24px rgba(0,0,0,0.15)' }}>
        <div style={{ padding: collapsed ? '20px 14px' : '20px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: 72 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
            <img src="/logo.png" alt="Logo" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'contain', flexShrink: 0 }} />
            {!collapsed && (
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>NxtStepEdu</p>
                <p style={{ color: '#C4B5FD', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>Parent Portal</p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Child Switcher ─── */}
        <ChildSwitcher collapsed={collapsed} />

        <nav style={{ flex: 1, padding: '16px 10px', overflowY: 'auto', marginTop: 8 }}>
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
      )}


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
                <h1 style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>{currentNav?.label || 'Home'}</h1>
                {!isMobile && <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 1, fontWeight: 500 }}>Parent Portal{selectedChild ? ` · ${selectedChild.student_name}` : ''}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <NotificationBell accentColor="#7C3AED" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '6px 14px 6px 8px' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #2E1065, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials}</div>
                {!isMobile && (
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', lineHeight: 1.2 }}>{parentName || 'Parent'}</p>
                    <p style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parent</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <div className="parent-main-content content-page" style={{ padding: isMobile ? '16px' : '40px 48px', paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom))' : '40px', maxWidth: 1280 }}>{children}</div>
      </main>

      {/* Bottom Tab Bar — mobile parent portal */}
      <nav className="bottom-tab-bar">
        {bottomTabs.map(tab => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <Link key={tab.href} href={tab.href} className={`bottom-tab-item${isActive ? ' active' : ''}`}>
              {tab.icon}
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
      {showChangePwd && <ChangePasswordModal accentColor="#7C3AED" role="parent" onClose={() => setShowChangePwd(false)} />}
    </div>
  );
}

// ─── Outer layout wraps everything with the Provider ────────────────────────
export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <ParentProvider>
      <ParentLayoutInner>{children}</ParentLayoutInner>
    </ParentProvider>
  );
}
