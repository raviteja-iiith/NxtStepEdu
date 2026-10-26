'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

type Status = 'present' | 'absent' | 'late' | 'excused';
interface Student { id: string; full_name: string; roll_number: number | null; }
interface Section { id: string; name: string; class_name: string; }
const statusConfig: Record<Status, { label: string; fullLabel: string; color: string; bg: string; border: string }> = {
  present:  { label: 'P', fullLabel: 'Present', color: '#16A34A', bg: '#F0FDF4', border: '#DCFCE7' },
  absent:   { label: 'A', fullLabel: 'Absent',  color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  late:     { label: 'L', fullLabel: 'Late',    color: '#D97706', bg: '#FFFBEB', border: '#FEF3C7' },
  excused:  { label: 'E', fullLabel: 'Excused', color: '#1D4ED8', bg: '#EFF6FF', border: '#DBEAFE' },
};

export default function PrincipalAttendancePage() {
  const supabase = createClient();

  // ─── Core state ───────────────────────────────────────────────────────────
  const [schoolId, setSchoolId]               = useState('');
  const [schoolName, setSchoolName]           = useState('');
  const [smsFeatureEnabled, setSmsFeatureEnabled] = useState(false);
  const [sections, setSections]               = useState<Section[]>([]);
  const [students, setStudents]               = useState<Student[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [date, setDate]                       = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance]           = useState<Record<string, Status>>({});
  const [alreadyMarked, setAlreadyMarked]     = useState(false);
  const [loading, setLoading]                 = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [saved, setSaved]                     = useState(false);

  // Overview stats
  const [stats, setStats]               = useState({ present: 0, absent: 0, late: 0, total: 0 });
  const [missingSections, setMissingSections] = useState<any[]>([]);
  const [allSections, setAllSections]   = useState<any[]>([]);

  // ─── SMS state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]       = useState<'mark' | 'overview' | 'sms'>('mark');
  // SMS credentials — loaded from cloud, saved to cloud
  const [smsUsername, setSmsUsername]     = useState('');
  const [smsPassword, setSmsPassword]     = useState('');
  const [smsCredsLoaded, setSmsCredsLoaded] = useState(false);
  const [smsCredsLoading, setSmsCredsLoading] = useState(false);
  const [credsSaving, setCredsSaving]     = useState(false);
  const [credsSaved, setCredsSaved]       = useState(false);
  const [showCredsForm, setShowCredsForm] = useState(false);
  // Editable message template — placeholders: {studentName}, {date}, {schoolName}, {section}
  const DEFAULT_MSG_TEMPLATE = 'Dear Parent, {studentName} was marked ABSENT on {date}. Please contact the school if this is incorrect. - {schoolName}';
  const [msgTemplate, setMsgTemplate]     = useState(DEFAULT_MSG_TEMPLATE);
  // Absent list & sending
  const [smsSectionFilter, setSmsSectionFilter] = useState('');
  const [smsDate, setSmsDate]             = useState(new Date().toISOString().split('T')[0]);
  const [absentList, setAbsentList]       = useState<{ studentName: string; parentPhone: string; parentId: string; sectionLabel: string }[]>([]);
  const [loadingAbsent, setLoadingAbsent] = useState(false);
  const [sendingSms, setSendingSms]       = useState(false);
  const [smsProgress, setSmsProgress]     = useState<{ name: string; status: string }[]>([]);
  const [smsResult, setSmsResult]         = useState<{ sent: number; failed: number; skipped: number } | null>(null);
  const [smsError, setSmsError]           = useState('');

  // ─── Init ─────────────────────────────────────────────────────────────────
  const init = useCallback(async () => {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: u } = await supabase.from('users').select('school_id').eq('id', userId).single();
    if (!u?.school_id) { setLoading(false); return; }
    setSchoolId(u.school_id);

    const [{ data: school }, { data: secs }] = await Promise.all([
      supabase.from('schools').select('name, attendance_sms_enabled').eq('id', u.school_id).single(),
      supabase.from('sections').select('id, name, classes(name)').eq('school_id', u.school_id),
    ]);

    if (school) {
      setSchoolName(school.name);
      setSmsFeatureEnabled(school.attendance_sms_enabled ?? false);
    }
    if (secs) {
      setAllSections(secs);
      const mapped = secs.map((s: any) => ({ id: s.id, name: s.name, class_name: s.classes?.name || '' }));
      setSections(mapped);
      if (mapped.length > 0 && !selectedSection) setSelectedSection(mapped[0].id);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { init(); }, [init]);

  // ─── Load SMS credentials from cloud ─────────────────────────────────────
  const loadSmsCreds = useCallback(async () => {
    if (!schoolId || !smsFeatureEnabled) return;
    setSmsCredsLoading(true);
    const { data } = await supabase
      .from('sms_credentials')
      .select('sms_username, sms_password')
      .eq('school_id', schoolId)
      .maybeSingle();
    if (data?.sms_username) {
      setSmsUsername(data.sms_username);
      setSmsPassword(data.sms_password || '');
      setSmsCredsLoaded(true);
      setShowCredsForm(false);
    } else {
      setShowCredsForm(true); // first time — show form
    }
    setSmsCredsLoading(false);
  }, [supabase, schoolId, smsFeatureEnabled]);

  useEffect(() => { if (activeTab === 'sms') loadSmsCreds(); }, [loadSmsCreds, activeTab]);

  // ─── Save SMS credentials to cloud ───────────────────────────────────────
  const saveSmsCreds = async () => {
    if (!smsUsername.trim() || !smsPassword.trim()) { setSmsError('Username and password are required.'); return; }
    setSmsError(''); setCredsSaving(true);
    const { error } = await supabase.from('sms_credentials').upsert(
      { school_id: schoolId, msg91_auth_key: '', sms_username: smsUsername.trim(), sms_password: smsPassword.trim(), gateway_type: 'android' },
      { onConflict: 'school_id' }
    );
    if (error) { setSmsError(error.message); }
    else { setSmsCredsLoaded(true); setShowCredsForm(false); setCredsSaved(true); setTimeout(() => setCredsSaved(false), 3000); }
    setCredsSaving(false);
  };

  // ─── Fetch students + existing attendance ─────────────────────────────────
  const fetchStudents = useCallback(async () => {
    if (!selectedSection) return;
    setLoadingStudents(true);
    const { data: studs } = await supabase
      .from('students').select('id, full_name, roll_number')
      .eq('section_id', selectedSection).eq('is_active', true).order('roll_number');
    if (!studs) { setLoadingStudents(false); return; }
    setStudents(studs);

    const { data: existing } = await supabase
      .from('attendance').select('student_id, status')
      .eq('section_id', selectedSection).eq('date', date);

    if (existing && existing.length > 0) {
      setAlreadyMarked(true);
      const map: Record<string, Status> = {};
      existing.forEach((e: any) => { map[e.student_id] = e.status; });
      setAttendance(map);
    } else {
      setAlreadyMarked(false);
      const map: Record<string, Status> = {};
      studs.forEach((s: Student) => { map[s.id] = 'present'; });
      setAttendance(map);
    }
    setLoadingStudents(false);
  }, [supabase, selectedSection, date]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  // ─── Fetch overview stats ─────────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    if (!schoolId) return;
    const [{ data: att }, { data: secs }] = await Promise.all([
      supabase.from('attendance').select('status, section_id').eq('school_id', schoolId).eq('date', date),
      supabase.from('sections').select('id, name, classes(name)').eq('school_id', schoolId),
    ]);
    if (att) {
      const p = att.filter((a: any) => a.status === 'present').length;
      const ab = att.filter((a: any) => a.status === 'absent').length;
      const lt = att.filter((a: any) => a.status === 'late').length;
      setStats({ present: p, absent: ab, late: lt, total: att.length });
    }
    if (secs && att) {
      const markedIds = new Set(att.map((a: any) => a.section_id));
      setMissingSections(secs.filter((s: any) => !markedIds.has(s.id)));
    }
  }, [supabase, schoolId, date]);

  useEffect(() => { if (activeTab === 'overview') fetchOverview(); }, [fetchOverview, activeTab]);

  // ─── Load absent list for SMS ─────────────────────────────────────────────
  const loadAbsentList = async () => {
    if (!schoolId) return;
    setLoadingAbsent(true); setAbsentList([]); setSmsResult(null);
    let q = supabase.from('attendance')
      .select('student_id, section_id, students(full_name), sections(name, classes(name))')
      .eq('school_id', schoolId).eq('date', smsDate).eq('status', 'absent');
    if (smsSectionFilter) q = q.eq('section_id', smsSectionFilter);
    const { data: absentRecs } = await q;
    if (!absentRecs || absentRecs.length === 0) { setLoadingAbsent(false); return; }

    // Get parent phone numbers
    const studentIds = absentRecs.map((r: any) => r.student_id);
    // Use explicit FK hint '!parent_id' to avoid ambiguous join error
    const { data: links, error: linksErr } = await supabase
      .from('student_parent_links')
      .select('student_id, parent_id, users!parent_id(phone, full_name)')
      .in('student_id', studentIds);
    if (linksErr) console.error('parent links error:', linksErr.message);

    const list = absentRecs.map((r: any) => {
      // Among all linked parents, prefer the one that has a phone number
      const allLinks = (links || []).filter((l: any) => l.student_id === r.student_id);
      const linkWithPhone = allLinks.find((l: any) => (l.users as any)?.phone);
      const link = linkWithPhone || allLinks[0];
      const sec = r.sections as any;
      return {
        studentName: (r.students as any)?.full_name || 'Student',
        parentPhone: (link?.users as any)?.phone || '',
        parentId: link?.parent_id || '',
        sectionLabel: sec ? `${sec.classes?.name} - ${sec.name}` : '',
      };
    });
    setAbsentList(list);
    setLoadingAbsent(false);
  };

  // ─── Send SMS via SSE (SMS Gate app — same pattern as marks SMS) ─────────
  const handleSendSms = async () => {
    if (!smsUsername || !smsPassword) { setSmsError('Enter your SMS Gateway username and password above.'); return; }
    if (absentList.filter(a => a.parentPhone).length === 0) return;
    setSendingSms(true); setSmsResult(null); setSmsProgress([]); setSmsError('');
    try {
      const resp = await fetch('/api/sms/send-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smsUsername, smsPassword, absentStudents: absentList, date: smsDate, msgTemplate }),
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        setSmsError(err.error || 'Request failed');
        setSendingSms(false); return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'progress') {
              setSmsProgress(prev => [...prev, { name: event.studentName, status: event.status }]);
            } else if (event.type === 'done') {
              setSmsResult({ sent: event.sent, failed: event.failed, skipped: event.skipped });
            } else if (event.type === 'error') {
              setSmsError(event.message);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setSmsError(err.message || 'Network error');
    }
    setSendingSms(false);
  };

  // ─── Submit attendance ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (Object.keys(attendance).length === 0) return;
    setSaving(true); setSaved(false);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    const records = students.map(s => ({
      school_id: schoolId, student_id: s.id, section_id: selectedSection,
      date, status: attendance[s.id] || 'present', marked_by: userId,
    }));
    try {
      const { markAttendanceBulk } = await import('@school-erp/supabase/queries');
      await markAttendanceBulk(supabase, records);
      setSaved(true); setAlreadyMarked(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const markAll = (status: Status) => {
    const map: Record<string, Status> = {};
    students.forEach(s => { map[s.id] = status; });
    setAttendance(map);
  };

  const counts = { present: 0, late: 0, excused: 0, absent: 0 };
  Object.values(attendance).forEach(s => { if (counts[s] !== undefined) counts[s]++; });

  const IS: React.CSSProperties = { padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13, outline: 'none', background: 'white', fontFamily: 'inherit' };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 48 }}>

      {/* Page Header */}
      <div style={{ background: 'white', borderRadius: 18, border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>Attendance</h2>
            <p style={{ fontSize: 13, color: '#64748B', margin: '4px 0 0' }}>Mark, review, and send SMS alerts for absent students</p>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, background: '#F8FAFC', borderRadius: 12, padding: 4, border: '1px solid #E2E8F0' }}>
            {[
              { id: 'mark',     label: '✏️ Mark Attendance' },
              { id: 'overview', label: '📊 Overview' },
              ...(smsFeatureEnabled ? [{ id: 'sms', label: '📱 Send SMS' }] : []),
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                style={{ padding: '8px 18px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                  background: activeTab === tab.id ? 'white' : 'transparent',
                  color: activeTab === tab.id ? '#0F172A' : '#64748B',
                  boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ TAB: MARK ATTENDANCE ══════════════════════════════════════════ */}
      {activeTab === 'mark' && (
        <>
          {/* Controls */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '20px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Section</label>
              <div style={{ position: 'relative' }}>
                <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)}
                  style={{ ...IS, width: '100%', appearance: 'none', paddingRight: 36, fontWeight: 700, color: '#0F172A' }}>
                  <option value="">Select section...</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} – {s.name}</option>)}
                </select>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Date</label>
              <input type="date" value={date} max={new Date().toISOString().split('T')[0]}
                onChange={e => setDate(e.target.value)} style={{ ...IS, width: '100%', fontWeight: 700, color: '#0F172A' }} />
            </div>
            {students.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => markAll('present')} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #DCFCE7', background: '#F0FDF4', color: '#16A34A', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>All Present</button>
                <button onClick={() => markAll('absent')} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>All Absent</button>
              </div>
            )}
          </div>

          {!selectedSection ? (
            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: 64, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <p style={{ fontWeight: 700, color: '#0F172A', margin: 0 }}>Select a section to mark attendance</p>
            </div>
          ) : loadingStudents ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1,2,3,4,5].map(i => <div key={i} style={{ height: 52, background: '#F8FAFC', borderRadius: 12 }} />)}
            </div>
          ) : students.length === 0 ? (
            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: 48, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#64748B' }}>No active students in this section.</p>
            </div>
          ) : (
            <>
              {/* Status summary */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {(Object.keys(counts) as Status[]).map(k => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: statusConfig[k].bg, border: `1px solid ${statusConfig[k].border}` }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusConfig[k].color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: statusConfig[k].color, textTransform: 'capitalize' }}>{k}: {counts[k]}</span>
                  </div>
                ))}
              </div>

              {alreadyMarked && (
                <div style={{ padding: '14px 20px', borderRadius: 14, border: '1px solid #FEF3C7', background: '#FFFBEB', color: '#92400E', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Attendance Already Marked</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.8 }}>Editing saved record for {new Date(date).toLocaleDateString()}.</p>
                  </div>
                </div>
              )}

              {/* Student list */}
              <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto', padding: '12px 24px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <div>Roll</div><div>Student Name</div><div style={{ paddingRight: 8 }}>Status</div>
                </div>
                {students.map((s, i) => {
                  const cur = attendance[s.id] || 'present';
                  return (
                    <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto', padding: '12px 24px', alignItems: 'center', borderBottom: i < students.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F8FAFC', color: '#64748B', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E2E8F0', fontFamily: 'monospace' }}>{s.roll_number || i + 1}</div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{s.full_name}</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(Object.keys(statusConfig) as Status[]).map(status => {
                          const isSelected = cur === status;
                          const cfg = statusConfig[status];
                          return (
                            <button key={status} onClick={() => setAttendance(a => ({ ...a, [s.id]: status }))}
                              style={{ width: 44, height: 44, borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', border: `2px solid ${isSelected ? cfg.color : '#E2E8F0'}`, background: isSelected ? cfg.color : 'white', color: isSelected ? 'white' : '#94A3B8', boxShadow: isSelected ? `0 4px 12px ${cfg.color}40` : 'none', transform: isSelected ? 'scale(1.08)' : 'scale(1)' }}>
                              {cfg.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Submit + Export */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#64748B', margin: 0 }}>{students.length} students · {new Date(date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {saved && <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>✅ Saved!</span>}
                  <button onClick={() => {
                    const sectionLabel = sections.find(s => s.id === selectedSection);
                    const sName = sectionLabel ? `${sectionLabel.class_name}_${sectionLabel.name}` : 'Section';
                    const data = students.map(s => ({ 'Roll No': s.roll_number ?? '', 'Student': s.full_name, 'Status': (attendance[s.id] || 'present') }));
                    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
                    XLSX.writeFile(wb, `Attendance_${sName}_${date}.xlsx`);
                  }} style={{ padding: '10px 18px', borderRadius: 11, border: 'none', fontSize: 13, fontWeight: 700, color: 'white', background: 'linear-gradient(135deg,#065F46,#059669)', cursor: 'pointer' }}>
                    📥 Export Excel
                  </button>
                  <button onClick={handleSubmit} disabled={saving} style={{ padding: '12px 28px', borderRadius: 11, fontSize: 14, fontWeight: 800, color: 'white', background: 'linear-gradient(135deg,#0F766E,#0D9488)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, boxShadow: '0 4px 14px rgba(15,118,110,0.3)' }}>
                    {saving ? 'Saving...' : alreadyMarked ? 'Update Attendance' : 'Submit Attendance'}
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══ TAB: OVERVIEW ════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* Date selector */}
          <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E2E8F0', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>Date:</label>
            <input type="date" value={date} max={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} style={{ ...IS, fontWeight: 700 }} />
            <button onClick={fetchOverview} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#1E3A8A,#3B82F6)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Refresh</button>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {[
              { label: 'Total Marked', value: stats.total, color: '#4F46E5', bg: '#EEF2FF', border: '#E0E7FF' },
              { label: 'Present', value: stats.present, color: '#10B981', bg: '#ECFDF5', border: '#D1FAE5' },
              { label: 'Absent', value: stats.absent, color: '#EF4444', bg: '#FEF2F2', border: '#FEE2E2' },
              { label: 'Late', value: stats.late, color: '#F59E0B', bg: '#FFFBEB', border: '#FEF3C7' },
            ].map((c, i) => (
              <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 16, padding: '20px 24px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: c.color, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>{c.label}</p>
                <p style={{ fontSize: 32, fontWeight: 900, color: '#0F172A', margin: 0 }}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Missing sections */}
          {missingSections.length > 0 && (
            <div style={{ background: 'white', borderRadius: 14, border: '1px solid #FEF3C7', padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#92400E' }}>Sections Not Yet Marked ({missingSections.length})</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {missingSections.map((s: any) => (
                  <div key={s.id} style={{ padding: '10px 14px', borderRadius: 10, background: '#FFFBEB', border: '1px solid #FEF3C7' }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#92400E' }}>{s.classes?.name} – {s.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#B45309' }}>Pending</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {missingSections.length === 0 && stats.total > 0 && (
            <div style={{ background: '#F0FDF4', borderRadius: 14, border: '1px solid #DCFCE7', padding: '20px 24px', textAlign: 'center' }}>
              <span style={{ fontSize: 24 }}>✅</span>
              <p style={{ fontWeight: 700, color: '#15803D', margin: '8px 0 0' }}>All sections have submitted attendance for this date!</p>
            </div>
          )}
        </>
      )}

      {/* SMS TAB */}
      {activeTab === 'sms' && (
        <>
          {!smsFeatureEnabled ? (
            <div style={{ background: '#FFF7ED', borderRadius: 14, border: '1px solid #FED7AA', padding: '32px 24px', textAlign: 'center' }}>
              <span style={{ fontSize: 32 }}>🔒</span>
              <p style={{ fontWeight: 700, color: '#C2410C', margin: '12px 0 4px' }}>SMS feature is not enabled for your school.</p>
              <p style={{ fontSize: 13, color: '#92400E', margin: 0 }}>Ask your platform admin to enable it: Admin Portal → Schools → SMS Attendance toggle.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Credentials — cloud stored */}
              {smsCredsLoading ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading credentials...</div>
              ) : (
                <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 24px', borderBottom: showCredsForm ? '1px solid #F1F5F9' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: smsCredsLoaded ? '#DCFCE7' : '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                        {smsCredsLoaded ? '✅' : '🔑'}
                      </div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#0F172A' }}>SMS Gate Credentials</p>
                        <p style={{ margin: 0, fontSize: 12, color: smsCredsLoaded ? '#16A34A' : '#D97706', fontWeight: 600 }}>
                          {smsCredsLoaded ? `Connected as ${smsUsername}` : 'Not configured — enter credentials below'}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setShowCredsForm(v => !v)}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'white', fontSize: 12, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                      {showCredsForm ? 'Cancel' : smsCredsLoaded ? '✏️ Edit' : '➕ Setup'}
                    </button>
                  </div>

                  {showCredsForm && (
                    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#374151' }}>
                        <strong>Setup:</strong> Install <em>SMS Gate</em> from Play Store → register with email+password → keep app open on your phone.
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Email / Username <span style={{ color: '#EF4444' }}>*</span></label>
                          <input type="email" value={smsUsername} onChange={e => setSmsUsername(e.target.value)}
                            placeholder="your@email.com" style={{ ...IS, width: '100%', boxSizing: 'border-box' as const }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Password <span style={{ color: '#EF4444' }}>*</span></label>
                          <input type="password" value={smsPassword} onChange={e => setSmsPassword(e.target.value)}
                            placeholder="Your app password" style={{ ...IS, width: '100%', boxSizing: 'border-box' as const }} />
                        </div>
                      </div>

                      {/* Editable message template */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                          Message Template
                          <span style={{ fontWeight: 400, color: '#94A3B8', marginLeft: 6 }}>use {'{'}{'{'}studentName{'}'}{'}'}, {'{'}{'{'}date{'}'}{'}'}, {'{'}{'{'}schoolName{'}'}{'}'}, {'{'}{'{'}section{'}'}{'}'}  as placeholders</span>
                        </label>
                        <textarea value={msgTemplate} onChange={e => setMsgTemplate(e.target.value)} rows={4}
                          style={{ ...IS, width: '100%', boxSizing: 'border-box' as const, resize: 'vertical' as const, fontFamily: 'inherit', lineHeight: 1.5 }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                          <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>Stored in cloud — no need to re-enter</p>
                          <button onClick={() => setMsgTemplate(DEFAULT_MSG_TEMPLATE)} style={{ fontSize: 11, color: '#6366F1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↺ Reset to default</button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={saveSmsCreds} disabled={credsSaving}
                          style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: credsSaving ? '#94A3B8' : 'linear-gradient(135deg,#0F766E,#059669)', color: 'white', fontSize: 13, fontWeight: 700, cursor: credsSaving ? 'not-allowed' : 'pointer' }}>
                          {credsSaving ? 'Saving...' : '💾 Save to Cloud'}
                        </button>
                        {credsSaved && <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>✅ Saved!</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Editable template quick-edit when creds are configured */}
              {smsCredsLoaded && !showCredsForm && (
                <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>✉️</span>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#0F172A' }}>Message Template</p>
                  </div>
                  <div style={{ padding: '16px 24px' }}>
                    <textarea value={msgTemplate} onChange={e => setMsgTemplate(e.target.value)} rows={3}
                      style={{ ...IS, width: '100%', boxSizing: 'border-box' as const, resize: 'vertical' as const, fontFamily: 'inherit', lineHeight: 1.5 }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
                      <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{'{'}{'{'}studentName{'}'}{'}'}  {'{'}{'{'}date{'}'}{'}'}  {'{'}{'{'}schoolName{'}'}{'}'}  {'{'}{'{'}section{'}'}{'}'}  are replaced automatically</p>
                      <button onClick={() => setMsgTemplate(DEFAULT_MSG_TEMPLATE)} style={{ fontSize: 11, color: '#6366F1', background: 'none', border: 'none', cursor: 'pointer' }}>↺ Reset to default</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Send panel */}
              <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9' }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0F172A' }}>📤 Send Absent Alerts</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>Loads absent students and sends SMS to their parents via your phone</p>
                </div>

                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Filters */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 160px' }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Date</label>
                      <input type="date" value={smsDate} max={new Date().toISOString().split('T')[0]}
                        onChange={e => { setSmsDate(e.target.value); setAbsentList([]); setSmsResult(null); setSmsProgress([]); }}
                        style={{ ...IS, width: '100%', boxSizing: 'border-box' as const, fontWeight: 700 }} />
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Section <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span></label>
                      <div style={{ position: 'relative' }}>
                        <select value={smsSectionFilter} onChange={e => { setSmsSectionFilter(e.target.value); setAbsentList([]); setSmsResult(null); setSmsProgress([]); }}
                          style={{ ...IS, width: '100%', appearance: 'none' as const, paddingRight: 36, boxSizing: 'border-box' as const }}>
                          <option value="">All sections</option>
                          {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} — {s.name}</option>)}
                        </select>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
                      </div>
                    </div>
                    <button onClick={loadAbsentList} disabled={loadingAbsent}
                      style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#1E3A8A,#3B82F6)', color: 'white', fontSize: 13, fontWeight: 700, cursor: loadingAbsent ? 'not-allowed' : 'pointer', opacity: loadingAbsent ? 0.7 : 1, whiteSpace: 'nowrap' as const }}>
                      {loadingAbsent ? 'Loading...' : '🔍 Load Absent Students'}
                    </button>
                  </div>

                  {/* Absent table */}
                  {absentList.length > 0 && (
                    <>
                      <div style={{ borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px', padding: '10px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                          <div>Student</div><div>Section</div><div>Parent Phone</div><div>Status</div>
                        </div>
                        {absentList.map((item, i) => {
                          const prog = smsProgress.find(p => p.name === item.studentName);
                          return (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px', padding: '10px 16px', borderBottom: i < absentList.length - 1 ? '1px solid #F1F5F9' : 'none', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{item.studentName}</span>
                              <span style={{ fontSize: 12, color: '#475569' }}>{item.sectionLabel}</span>
                              <span style={{ fontSize: 12, fontFamily: 'monospace', color: item.parentPhone ? '#0F172A' : '#DC2626' }}>
                                {item.parentPhone || '⚠️ No phone'}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                                background: prog?.status === 'sent' ? '#DCFCE7' : prog?.status === 'failed' ? '#FEE2E2' : prog?.status === 'skipped' ? '#FEF3C7' : '#FEF2F2',
                                color: prog?.status === 'sent' ? '#15803D' : prog?.status === 'failed' ? '#DC2626' : prog?.status === 'skipped' ? '#B45309' : '#DC2626',
                              }}>
                                {prog ? (prog.status === 'sent' ? '✅ Sent' : prog.status === 'failed' ? '❌ Failed' : '⏭ Skip') : 'Absent'}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Progress bar while sending */}
                      {sendingSms && smsProgress.length > 0 && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B', marginBottom: 6 }}>
                            <span>Sending... {smsProgress.length} / {absentList.filter(a => a.parentPhone).length}</span>
                            <span>{Math.round((smsProgress.length / absentList.filter(a => a.parentPhone).length) * 100)}%</span>
                          </div>
                          <div style={{ height: 8, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: 'linear-gradient(90deg,#6D28D9,#7C3AED)', borderRadius: 99, transition: 'width 0.3s', width: `${Math.round((smsProgress.length / absentList.filter(a => a.parentPhone).length) * 100)}%` }} />
                          </div>
                        </div>
                      )}

                      {/* Result summary */}
                      {smsResult && (
                        <div style={{ padding: '14px 18px', borderRadius: 12, border: `1px solid ${smsResult.failed === 0 ? '#DCFCE7' : '#FEF3C7'}`, background: smsResult.failed === 0 ? '#F0FDF4' : '#FFFBEB', display: 'flex', gap: 20, flexWrap: 'wrap' as const }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>✅ Sent: {smsResult.sent}</span>
                          {smsResult.failed > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>❌ Failed: {smsResult.failed}</span>}
                          {smsResult.skipped > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#D97706' }}>⏭ No phone: {smsResult.skipped}</span>}
                        </div>
                      )}

                      {smsError && (
                        <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 10, fontSize: 13, color: '#DC2626' }}>{smsError}</div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
                          <strong style={{ color: '#DC2626' }}>{absentList.length}</strong> absent · <strong>{absentList.filter(a => a.parentPhone).length}</strong> with phone numbers
                        </p>
                        <button onClick={handleSendSms}
                          disabled={sendingSms || !smsUsername || !smsPassword || absentList.filter(a => a.parentPhone).length === 0}
                          style={{ padding: '12px 28px', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 800, color: 'white',
                            background: (sendingSms || !smsUsername || !smsPassword) ? '#94A3B8' : 'linear-gradient(135deg,#7C3AED,#6D28D9)',
                            cursor: (sendingSms || !smsUsername || !smsPassword) ? 'not-allowed' : 'pointer',
                            boxShadow: sendingSms ? 'none' : '0 4px 14px rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {sendingSms
                            ? <><span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%' }} /> Sending...</>
                            : `📤 Send SMS to ${absentList.filter(a => a.parentPhone).length} Parents`}
                        </button>
                      </div>
                    </>
                  )}

                  {!loadingAbsent && absentList.length === 0 && (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                      Click &quot;Load Absent Students&quot; to fetch absent records for the selected date.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
