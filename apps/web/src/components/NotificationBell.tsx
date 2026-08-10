'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useRouter } from 'next/navigation';

// ── Notification type icons & colors ────────────────────────────────────────
const TYPE_CFG: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  fee_reminder:     { icon: '💰', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  absent_alert:     { icon: '📋', color: '#DC2626', bg: '#FEF2F2', border: '#FEE2E2' },
  exam_scheduled:   { icon: '📅', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  marks_published:  { icon: '📊', color: '#0F766E', bg: '#F0FDF4', border: '#BBF7D0' },
  message:          { icon: '💬', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  announcement:     { icon: '📢', color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD' },
};

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface Props {
  accentColor?: string;
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationBell({ accentColor = '#1E3A8A' }: Props) {
  const supabase = createClient();
  const [open,    setOpen]    = useState(false);
  const [notifs,  setNotifs]  = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  // panelRef: wraps the dropdown panel only (not the bell button)
  const panelRef  = useRef<HTMLDivElement>(null);
  // buttonRef: the bell button — excluded from outside-click so the toggle click wins
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isMobile  = useIsMobile();
  const router = useRouter();

  const unreadCount = notifs.filter(n => !n.is_read).length;

  const fetchNotifs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, link, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(40);
    if (data) setNotifs(data as Notif[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifs]);

  // Close on outside click — desktop only.
  // Excludes the bell button itself so that the button's own onClick toggle wins.
  useEffect(() => {
    if (isMobile) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insidePanel  = panelRef.current  && panelRef.current.contains(target);
      const insideButton = buttonRef.current && buttonRef.current.contains(target);
      if (!insidePanel && !insideButton) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isMobile]);

  // Intercept Capacitor hardware back button to close panel
  useEffect(() => {
    if (!open) return;
    const handleBack = (e: Event) => {
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener('capacitor-back-button', handleBack);
    return () => document.removeEventListener('capacitor-back-button', handleBack);
  }, [open]);

  const markRead = async (id: string) => {
    setNotifs(n => n.map(x => x.id === id ? { ...x, is_read: true } : x));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    const ids = notifs.filter(n => !n.is_read).map(n => n.id);
    if (!ids.length) return;
    setNotifs(n => n.map(x => ({ ...x, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).in('id', ids);
  };

  const deleteNotif = async (id: string) => {
    setNotifs(n => n.filter(x => x.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  };

  // ── Notification list content (shared between mobile and desktop) ──
  const renderPanel = () => (
    <>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `linear-gradient(135deg,${accentColor}10,${accentColor}05)`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>🔔</span>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: 0 }}>Notifications</p>
          {unreadCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: accentColor, color: 'white' }}>{unreadCount} new</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{ fontSize: 11, fontWeight: 700, color: accentColor, background: 'none', border: 'none', cursor: 'pointer', padding: '3px 8px', borderRadius: 6 }}>
              Mark all read
            </button>
          )}
          {isMobile && (
            <button onClick={() => setOpen(false)} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#94A3B8' }}>Loading...</p>
          </div>
        ) : notifs.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 28, margin: '0 0 10px' }}>🔕</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#475569', margin: 0 }}>All caught up!</p>
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>No notifications yet</p>
          </div>
        ) : notifs.map((n, i) => {
          const cfg = TYPE_CFG[n.type] || TYPE_CFG.announcement;
          return (
            <div key={n.id}
              style={{ padding: '12px 18px', borderBottom: i < notifs.length - 1 ? '1px solid #F8FAFC' : 'none', background: n.is_read ? 'white' : `${cfg.bg}`, display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', transition: 'background 0.15s' }}
              onClick={() => { 
                markRead(n.id); 
                if (n.link) {
                  // Use window.location.href for external links, router.push for internal
                  if (n.link.startsWith('http')) {
                    window.location.href = n.link;
                  } else {
                    router.push(n.link);
                  }
                }
                setOpen(false); 
              }}
            >
              {/* Icon */}
              <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                {cfg.icon}
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <p style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: '#0F172A', margin: 0, lineHeight: 1.4 }}>{n.title}</p>
                  {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0, marginTop: 4 }} />}
                </div>
                {n.body && <p style={{ fontSize: 12, color: '#64748B', margin: '3px 0 0', lineHeight: 1.5 }}>{n.body}</p>}
                <p style={{ fontSize: 11, color: '#94A3B8', margin: '5px 0 0', fontWeight: 500 }}>{timeAgo(n.created_at)}</p>
              </div>
              {/* Delete */}
              <button onClick={e => { e.stopPropagation(); deleteNotif(n.id); }}
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', flexShrink: 0, marginTop: 2 }}>
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {notifs.length > 0 && (
        <div style={{ padding: '10px 18px', borderTop: '1px solid #F1F5F9', background: '#FAFAFA', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, paddingBottom: isMobile ? 'max(10px, env(safe-area-inset-bottom))' : '10px' }}>
          <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{notifs.length} notifications total</p>
          <button onClick={() => { setNotifs([]); supabase.from('notifications').delete().neq('id', ''); }}
            style={{ fontSize: 11, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Clear all
          </button>
        </div>
      )}
    </>
  );

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => {
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen) fetchNotifs();
        }}
        style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid #E2E8F0', background: open ? '#F1F5F9' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B', position: 'relative', transition: 'all 0.15s', zIndex: (open && isMobile) ? 202 : 'auto' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 99, background: '#EF4444', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'white', lineHeight: 1, padding: '0 3px' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* MOBILE: Full-screen overlay panel */}
      {open && isMobile && (
        <>
          {/* Backdrop — stopPropagation prevents the click from bubbling to the bell button */}
          <div
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
              zIndex: 200, backdropFilter: 'blur(4px)',
            }}
          />
          {/* Panel — slides up from bottom */}
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0,
            zIndex: 201, background: 'white',
            borderRadius: '20px 20px 0 0',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
            maxHeight: '85vh',
            display: 'flex', flexDirection: 'column',
            animation: 'slideUpPanel 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards',
          }}>
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: '#CBD5E1' }} />
            </div>
            {renderPanel()}
          </div>
        </>
      )}

      {/* DESKTOP: Dropdown panel */}
      {open && !isMobile && (
        <div ref={panelRef} style={{
          position: 'absolute', right: 0, top: 46, width: 380,
          maxWidth: 'calc(100vw - 32px)', background: 'white',
          borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          border: '1px solid #E8ECF0', zIndex: 100, overflow: 'hidden',
          maxHeight: 520, display: 'flex', flexDirection: 'column',
        }}>
          {renderPanel()}
        </div>
      )}
    </div>
  );
}

// ── Helper: create a notification (call from any page) ───────────────────────
export async function createNotification(
  supabase: ReturnType<typeof createClient>,
  opts: {
    recipient_id: string;
    school_id: string;
    type: keyof typeof TYPE_CFG;
    title: string;
    body?: string;
    link?: string;
  }
) {
  await supabase.from('notifications').insert({
    recipient_id: opts.recipient_id,
    school_id:    opts.school_id,
    type:         opts.type,
    title:        opts.title,
    body:         opts.body ?? null,
    link:         opts.link ?? null,
    is_read:      false,
  });
}
