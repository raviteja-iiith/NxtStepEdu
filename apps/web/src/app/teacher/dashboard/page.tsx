'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getTeacherDashboardStats } from '@school-erp/supabase/queries';
import { getUserProfile } from '@school-erp/supabase/queries';

interface Announcement {
  id: string;
  title: string;
  content: string;
  is_urgent: boolean;
  created_at: string;
}

export default function TeacherDashboard() {
  const supabase = createClient();
  const [userName, setUserName] = useState('');
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionsCount, setSectionsCount] = useState(0);
  const [assignmentsCount, setAssignmentsCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [attendancePending, setAttendancePending] = useState(0);
  const [todaySlots, setTodaySlots] = useState<{id:string;period:number;start_time:string;end_time:string;subject_name:string;section_name:string;room:string|null}[]>([]);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const u = await getUserProfile(supabase, user.id);
      if (u) setUserName(u.full_name || 'Teacher');
      if (u?.school_id) setSchoolId(u.school_id);
      const stats = await getTeacherDashboardStats(supabase, user.id);
      setSectionsCount(stats.sectionsCount);
      const { count: aCount } = await supabase.from('assignments').select('*', { count: 'exact', head: true }).eq('teacher_id', user.id).eq('is_published', true).gte('deadline', new Date().toISOString());
      setAssignmentsCount(aCount || 0);
      const { count: mCount } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('is_read', false);
      setUnreadMessages(mCount || 0);
      const today = new Date().toISOString().split('T')[0];
      // Attendance is marked only by class teachers — check sections where this teacher is class_teacher_id
      const { data: classSections } = await supabase.from('sections').select('id').eq('class_teacher_id', user.id);
      if (classSections && classSections.length > 0) {
        const sectionIds = classSections.map((s: any) => s.id as string);
        const { data: markedSections } = await supabase.from('attendance').select('section_id').in('section_id', sectionIds).eq('date', today).limit(sectionIds.length);
        const markedSet = new Set((markedSections || []).map((a: any) => a.section_id));
        setAttendancePending(sectionIds.filter((id: string) => !markedSet.has(id)).length);
      } else {
        setAttendancePending(0);
      }
      const todayDow = new Date().getDay(); // 0=Sun, 1=Mon...6=Sat
      // School days are Mon(1)–Sat(6). Sunday has no schedule — show empty.
      if (todayDow >= 1 && todayDow <= 6) {
        const { data: slots } = await supabase.from('timetable').select('id, period_number, start_time, end_time, room, subjects(name), sections(name)').eq('teacher_id', user.id).eq('day_of_week', todayDow).order('period_number');
        if (slots) setTodaySlots(slots.map((s: any) => ({ id: s.id, period: s.period_number, start_time: s.start_time, end_time: s.end_time, room: s.room, subject_name: s.subjects?.name || 'Subject', section_name: s.sections?.name || 'Section' })));
      }
      // todayDow === 0 (Sunday): leave todaySlots as [] → "No classes today" is shown

    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // fetch announcements when schoolId is ready
  useEffect(() => {
    if (!schoolId) return;
    const fetchAnn = async () => {
      const { data } = await supabase
        .from('announcements')
        .select('id, title, content, is_urgent, created_at')
        .eq('school_id', schoolId)
        .in('target_audience', ['all', 'teachers'])
        .order('created_at', { ascending: false })
        .limit(5);
      if (data) setAnnouncements(data as Announcement[]);
    };
    fetchAnn();
  }, [schoolId]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const stats = [
    { label: 'My Sections', value: sectionsCount, desc: 'Classes assigned', bg: '#F0FDF4', color: '#15803D', iconBg: '#DCFCE7' },
    { label: 'Attendance Pending', value: attendancePending, desc: 'Roll calls today', bg: '#FFFBEB', color: '#B45309', iconBg: '#FEF3C7' },
    { label: 'Active Assignments', value: assignmentsCount, desc: 'Published & ongoing', bg: '#EFF6FF', color: '#1D4ED8', iconBg: '#DBEAFE' },
    { label: 'Unread Messages', value: unreadMessages, desc: 'From parents & staff', bg: '#FAF5FF', color: '#7C3AED', iconBg: '#EDE9FE' },
  ];

  const statIcons = [
    <svg key="s" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>,
    <svg key="a" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    <svg key="p" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
    <svg key="m" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  ];

  const quickActions = [
    { href: '/teacher/attendance', label: 'Mark Attendance', desc: "Today's roll call", color: '#15803D', bg: '#DCFCE7', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { href: '/teacher/assignments', label: 'New Assignment', desc: 'Create & share', color: '#1D4ED8', bg: '#DBEAFE', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> },
    { href: '/teacher/marks', label: 'Enter Marks', desc: 'Exam results', color: '#B45309', bg: '#FEF3C7', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
    { href: '/teacher/messages', label: 'Message Parent', desc: 'Chat now', color: '#7C3AED', bg: '#EDE9FE', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
  ];

  return (
    <div className="dashboard-container">

      {/* Welcome Banner */}
      <div className="dashboard-banner">
        <div style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: -30, right: 120, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
        <div className="dashboard-banner-inner">
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 99, padding: '5px 12px', marginBottom: 12, border: '1px solid rgba(255,255,255,0.15)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} />
              <span style={{ color: '#CCFBF1', fontSize: 12, fontWeight: 600, letterSpacing: '0.03em' }}>{greeting}</span>
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: '-0.02em', marginBottom: 6 }}>
              {loading ? <span style={{ display: 'inline-block', width: 180, height: 34, background: 'rgba(255,255,255,0.15)', borderRadius: 8 }} /> : `${userName} 👋`}
            </h2>
            <p style={{ color: 'rgba(204,251,241,0.8)', fontSize: 13, fontWeight: 400, maxWidth: 420 }}>
              Your schedule for {dateStr}. Have a great day teaching!
            </p>
          </div>
          <Link href="/teacher/attendance" style={{ background: 'white', color: '#0F766E', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 10, textDecoration: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            Mark Attendance →
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="stat-cards-container">
        {stats.map((s, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: s.iconBg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {statIcons[i]}
              </div>
            </div>
            <p style={{ fontSize: 30, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {loading ? <span style={{ display: 'inline-block', width: 40, height: 30, background: '#F1F5F9', borderRadius: 6 }} /> : s.value}
            </p>
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Bottom Grid: Timetable + Quick Actions */}
      <div className="bottom-grid-container">

        {/* Today's Timetable */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Today&apos;s Timetable</h3>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
            </div>
            <Link href="/teacher/lesson-plans" style={{ fontSize: 12, fontWeight: 600, color: '#0F766E', textDecoration: 'none', padding: '6px 12px', background: '#F0FDFA', borderRadius: 8, border: '1px solid #CCFBF1' }}>
              Lesson Plans →
            </Link>
          </div>
          <div style={{ padding: 24 }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 56, background: '#F8FAFC', borderRadius: 10, animation: 'shimmer 1.4s ease infinite' }} />)}
              </div>
            ) : todaySlots.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#F8FAFC', border: '1px solid #E8ECF0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22 }}>📅</div>
                <p style={{ fontWeight: 600, color: '#475569', fontSize: 14 }}>No classes today</p>
                <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Your timetable will appear here once the Principal sets it up.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {todaySlots.map(slot => (
                  <div key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 10, border: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: '#F0FDFA', border: '1px solid #CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#0F766E', flexShrink: 0 }}>P{slot.period}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>{slot.subject_name}</p>
                      <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>Section {slot.section_name}{slot.room ? ` · ${slot.room}` : ''}</p>
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>{slot.start_time?.slice(0,5)} – {slot.end_time?.slice(0,5)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Quick Tools</h3>
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Shortcuts to key actions</p>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {quickActions.map((a, i) => (
              <Link key={i} href={a.href} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 10, border: '1px solid #F1F5F9', background: '#FAFAFA', textDecoration: 'none', transition: 'all 0.15s' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: a.bg, color: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.icon}</div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>{a.label}</p>
                  <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{a.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>

      {/* Announcements from Principal */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E8ECF0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>📢</span>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>School Announcements</h3>
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Broadcasts from the Principal</p>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {announcements.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#F8FAFC', border: '1px solid #E8ECF0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22 }}>🔕</div>
              <p style={{ fontWeight: 600, color: '#475569', fontSize: 14, margin: 0 }}>No announcements yet</p>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Principal broadcasts will appear here.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {announcements.map(a => (
                <div key={a.id} style={{ padding: '13px 16px', borderRadius: 10, border: `1px solid ${a.is_urgent ? '#FECACA' : '#F1F5F9'}`, background: a.is_urgent ? '#FFF5F5' : '#FAFAFA', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: a.is_urgent ? '#FEF2F2' : '#EFF6FF', border: `1px solid ${a.is_urgent ? '#FEE2E2' : '#DBEAFE'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                    {a.is_urgent ? '🚨' : '📢'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>{a.title}</p>
                      {a.is_urgent && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#DC2626', color: 'white' }}>URGENT</span>}
                    </div>
                    <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 4px', lineHeight: 1.5 }}>{a.content}</p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
