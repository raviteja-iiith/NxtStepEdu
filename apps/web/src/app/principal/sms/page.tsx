'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClassItem  { id: string; name: string; }
interface SectionItem { id: string; name: string; class_id: string; }
interface ExamRow    { id: string; name: string; exam_date: string; exam_type: string; total_marks: number; subject_id: string; subject_name: string; class_id: string; section_id: string | null; }
interface Student    { id: string; full_name: string; roll_number: number | null; }
interface MarkEntry  { student_id: string; exam_id: string; marks_obtained: number | null; is_absent: boolean; }
interface SmsLogEntry { exam_name: string; sent_at: string; sms_username: string; status: string; }

type Phase = 'idle' | 'credentials' | 'sending' | 'done';

interface ProgressEvent {
  type: 'progress' | 'done' | 'error';
  done?: number;
  total?: number;
  studentName?: string;
  status?: 'sent' | 'failed' | 'skipped';
  reason?: string;
  error?: string;
  sent?: number;
  failed?: number;
  skipped?: number;
  message?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function groupByExam(rows: ExamRow[]) {
  const map = new Map<string, ExamRow[]>();
  for (const r of rows) {
    const key = `${r.name}§${r.exam_date}§${r.class_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.values());
}

const IS: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0',
  borderRadius: 10, fontSize: 13, outline: 'none', background: 'white', boxSizing: 'border-box',
};
const LS: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function SmsResultsPage() {
  const supabase = createClient();

  // ── Data state
  const [classes,   setClasses]   = useState<ClassItem[]>([]);
  const [sections,  setSections]  = useState<SectionItem[]>([]);
  const [allExams,  setAllExams]  = useState<ExamRow[]>([]);
  const [students,  setStudents]  = useState<Student[]>([]);
  const [marks,     setMarks]     = useState<MarkEntry[]>([]);
  const [recentLog, setRecentLog] = useState<SmsLogEntry | null>(null);

  // ── Selection state
  const [selClass,   setSelClass]   = useState('');
  const [selSection, setSelSection] = useState('');
  const [selGroup,   setSelGroup]   = useState('');
  const [schoolId,   setSchoolId]   = useState('');
  const [initLoad,   setInitLoad]   = useState(true);

  // ── Credential modal state
  const [phase,       setPhase]       = useState<Phase>('idle');
  const [username,    setUsername]    = useState('');
  const [password,    setPassword]    = useState('');
  const [showPwd,     setShowPwd]     = useState(false);
  const [credError,   setCredError]   = useState('');

  // ── Progress state
  const [progressDone,  setProgressDone]  = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [currentStudent, setCurrentStudent] = useState('');
  const [progressRows,  setProgressRows]  = useState<{name:string; status:string; reason?:string; error?:string}[]>([]);
  const [finalSent,     setFinalSent]     = useState(0);
  const [finalFailed,   setFinalFailed]   = useState(0);
  const [finalSkipped,  setFinalSkipped]  = useState(0);
  const [sseError,      setSseError]      = useState('');
  const [showErrorLog,  setShowErrorLog]  = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // ── Init: load classes, sections ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) { setInitLoad(false); return; }
      const { data: u } = await supabase.from('users').select('school_id').eq('id', uid).single();
      if (!u?.school_id) { setInitLoad(false); return; }
      setSchoolId(u.school_id);
      const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).eq('school_id', u.school_id).maybeSingle();
      const yid = yr?.id;
      const [{ data: c }, { data: sec }] = await Promise.all([
        yid
          ? supabase.from('classes').select('id,name').eq('academic_year_id', yid).order('numeric_order')
          : supabase.from('classes').select('id,name').eq('school_id', u.school_id).order('numeric_order'),
        yid
          ? supabase.from('sections').select('id,name,class_id').eq('academic_year_id', yid)
          : supabase.from('sections').select('id,name,class_id').eq('school_id', u.school_id),
      ]);
      if (c)   setClasses(c);
      if (sec) setSections(sec);
      setInitLoad(false);
    })();
  }, [supabase]);

  // ── Load exams when class changes ─────────────────────────────────────────
  useEffect(() => {
    if (!selClass || !schoolId) { setAllExams([]); setSelGroup(''); return; }
    (async () => {
      const { data } = await supabase.from('exams')
        .select('id, name, exam_date, exam_type, total_marks, subject_id, class_id, section_id, subjects(name)')
        .eq('school_id', schoolId)
        .eq('class_id', selClass)
        .order('exam_date', { ascending: false });
      setAllExams((data ?? []).map((e: any) => ({ ...e, subject_name: e.subjects?.name ?? 'Unknown' })));
      setSelGroup('');
    })();
  }, [supabase, selClass, schoolId]);

  // ── Load students + marks when group selected ──────────────────────────────
  const activeGroup = useMemo(() => {
    return groupByExam(allExams).find(
      g => `${g[0].name}§${g[0].exam_date}§${g[0].class_id}` === selGroup
    ) ?? null;
  }, [allExams, selGroup]);

  useEffect(() => {
    if (!activeGroup) { setStudents([]); setMarks([]); setRecentLog(null); return; }
    (async () => {
      // Students
      let q = supabase.from('students')
        .select('id, full_name, roll_number')
        .eq('is_active', true)
        .eq('class_id', activeGroup[0].class_id);
      if (selSection) q = q.eq('section_id', selSection);
      const { data: sts } = await q.order('roll_number');
      setStudents(sts ?? []);

      // Marks
      const examIds = activeGroup.map(e => e.id);
      const { data: mks } = await supabase.from('marks')
        .select('student_id, exam_id, marks_obtained, is_absent')
        .in('exam_id', examIds);
      setMarks(mks ?? []);

      // Recent SMS log for this group
      const { data: log } = await supabase
        .from('sms_logs')
        .select('exam_name, sent_at, sms_username, status')
        .eq('school_id', schoolId)
        .eq('exam_name', activeGroup[0].name)
        .eq('class_id', activeGroup[0].class_id)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setRecentLog(log ?? null);
    })();
  }, [supabase, activeGroup, selSection, schoolId]);

  // ── Completion metrics ─────────────────────────────────────────────────────
  const completionStats = useCallback(() => {
    if (!activeGroup || students.length === 0) return null;
    const examIds = activeGroup.map(e => e.id);
    let totalCells = students.length * examIds.length;
    let enteredCells = 0;
    for (const s of students) {
      for (const eid of examIds) {
        const m = marks.find(x => x.student_id === s.id && x.exam_id === eid);
        if (m && (m.marks_obtained !== null || m.is_absent)) enteredCells++;
      }
    }
    const pct = totalCells > 0 ? Math.round((enteredCells / totalCells) * 100) : 0;
    const perSubject = activeGroup.map(ex => {
      const entered = students.filter(s => {
        const m = marks.find(x => x.student_id === s.id && x.exam_id === ex.id);
        return m && (m.marks_obtained !== null || m.is_absent);
      }).length;
      return { subjectName: ex.subject_name, entered, total: students.length };
    });
    return { pct, enteredCells, totalCells, perSubject };
  }, [activeGroup, students, marks]);

  const stats = completionStats();
  const groups = groupByExam(allExams);
  const filtSecs = sections.filter(s => s.class_id === selClass);

  // ── SMS send ───────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!username.trim() || !password.trim()) {
      setCredError('Please enter both username and password.');
      return;
    }
    if (!activeGroup) return;

    setCredError('');
    setPhase('sending');
    setProgressDone(0);
    setProgressTotal(students.length);
    setCurrentStudent('');
    setProgressRows([]);
    setSseError('');

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/sms/send-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smsUsername: username.trim(),
          smsPassword: password.trim(),
          examName:    activeGroup[0].name,
          examDate:    activeGroup[0].exam_date,
          examIds:     activeGroup.map(e => e.id),
          classId:     activeGroup[0].class_id,
          sectionId:   selSection || null,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setSseError(err.error ?? 'Unknown error');
        setPhase('done');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev: ProgressEvent = JSON.parse(line.slice(6));

            if (ev.type === 'progress') {
              setProgressDone(ev.done ?? 0);
              setCurrentStudent(ev.studentName ?? '');
              setProgressRows(prev => [...prev, {
                name:   ev.studentName ?? '',
                status: ev.status ?? '',
                reason: ev.reason,
                error:  ev.error ?? undefined,
              }]);
            }

            if (ev.type === 'error') {
              setSseError(ev.message ?? 'An error occurred');
              setPhase('done');
              return;
            }

            if (ev.type === 'done') {
              setFinalSent(ev.sent ?? 0);
              setFinalFailed(ev.failed ?? 0);
              setFinalSkipped(ev.skipped ?? 0);
              setProgressDone(ev.total ?? 0);
              setPhase('done');
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setSseError(err?.message ?? 'Connection lost');
        setPhase('done');
      }
    }
  };

  const closeModal = () => {
    setPhase('idle');
    setUsername('');
    setPassword('');
    setShowPwd(false);
    setCredError('');
    setSseError('');
    setProgressRows([]);
    setShowErrorLog(false);
    // Refresh recent log
    if (activeGroup) {
      supabase.from('sms_logs')
        .select('exam_name, sent_at, sms_username, status')
        .eq('school_id', schoolId)
        .eq('exam_name', activeGroup[0].name)
        .eq('class_id', activeGroup[0].class_id)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }: { data: SmsLogEntry | null }) => setRecentLog(data ?? null));
    }
  };

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (initLoad) {
    return (
      <div className="dashboard-container">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: 48, background: '#F1F5F9', borderRadius: 10 }} />)}
        </div>
      </div>
    );
  }

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-container">

      {/* Header */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>
          📱 SMS Result Notifications
        </h2>
        <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
          Send personalised exam result SMS to every parent in a class
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
        <div>
          <label style={LS}>Class *</label>
          <select
            value={selClass}
            onChange={e => { setSelClass(e.target.value); setSelSection(''); setSelGroup(''); }}
            style={IS}
          >
            <option value="">Select class...</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={LS}>Section</label>
          <select
            value={selSection}
            onChange={e => setSelSection(e.target.value)}
            disabled={!selClass}
            style={{ ...IS, opacity: selClass ? 1 : 0.5 }}
          >
            <option value="">All sections</option>
            {filtSecs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label style={LS}>Exam Group *</label>
          <select
            value={selGroup}
            onChange={e => setSelGroup(e.target.value)}
            disabled={!selClass || groups.length === 0}
            style={{ ...IS, opacity: selClass ? 1 : 0.5 }}
          >
            <option value="">Select exam...</option>
            {groups.map(g => {
              const key = `${g[0].name}§${g[0].exam_date}§${g[0].class_id}`;
              const date = new Date(g[0].exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
              const label = g.length > 1
                ? `${g[0].name} · ${date} · ${g.length} subjects`
                : `${g[0].name} · ${g[0].subject_name} · ${date}`;
              return <option key={key} value={key}>{label}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Empty state */}
      {!activeGroup && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E8ECF0', padding: '64px 24px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg,#F0FDF4,#DCFCE7)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 30 }}>📱</div>
          <p style={{ fontWeight: 700, color: '#1E293B', fontSize: 16, margin: 0 }}>Select a Class & Exam Group</p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Use the filters above to pick an exam and send result SMS to parents</p>
        </div>
      )}

      {activeGroup && (
        <>
          {/* Exam group chips */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {activeGroup.map(e => (
              <div key={e.id} style={{ padding: '8px 14px', background: 'white', border: '1px solid #DBEAFE', borderRadius: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', margin: 0 }}>{e.subject_name}</p>
                <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>Max: {e.total_marks}</p>
              </div>
            ))}
            <div style={{ padding: '8px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#475569', margin: 0 }}>Grand Total</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {activeGroup.reduce((s, e) => s + e.total_marks, 0)} marks
              </p>
            </div>
          </div>

          {/* Marks completion card */}
          {stats && (
            <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>📊 Marks Entry Completion</p>
                <span style={{
                  fontSize: 13, fontWeight: 800,
                  color: stats.pct === 100 ? '#15803D' : stats.pct >= 60 ? '#D97706' : '#DC2626',
                  background: stats.pct === 100 ? '#F0FDF4' : stats.pct >= 60 ? '#FFFBEB' : '#FEF2F2',
                  padding: '3px 10px', borderRadius: 8,
                }}>
                  {stats.pct}%
                </span>
              </div>
              {/* Progress bar */}
              <div style={{ height: 8, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${stats.pct}%`,
                  background: stats.pct === 100
                    ? 'linear-gradient(90deg,#15803D,#22C55E)'
                    : stats.pct >= 60
                      ? 'linear-gradient(90deg,#D97706,#FBBF24)'
                      : 'linear-gradient(90deg,#DC2626,#EF4444)',
                  transition: 'width 0.4s',
                }} />
              </div>
              {/* Per-subject breakdown */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {stats.perSubject.map(ps => (
                  <div key={ps.subjectName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: ps.entered === ps.total ? '#22C55E' : ps.entered > 0 ? '#FBBF24' : '#EF4444',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 12, color: '#475569' }}>
                      {ps.subjectName}: <strong>{ps.entered}/{ps.total}</strong>
                    </span>
                  </div>
                ))}
              </div>
              {stats.pct < 100 && (
                <p style={{ fontSize: 11, color: '#D97706', marginTop: 8, fontWeight: 600 }}>
                  ⚠️ {stats.totalCells - stats.enteredCells} mark{stats.totalCells - stats.enteredCells !== 1 ? 's' : ''} not yet entered — they will appear as "Not Entered" in the SMS.
                </p>
              )}
            </div>
          )}

          {/* Previous send notice */}
          {recentLog && (
            <div style={{ padding: '10px 16px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <p style={{ fontSize: 12, color: '#92400E', margin: 0 }}>
                SMS was previously sent for this exam on{' '}
                <strong>{new Date(recentLog.sent_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
                {' '}using username <strong>{recentLog.sms_username}</strong>. You can still send again below.
              </p>
            </div>
          )}

          {/* Send SMS card */}
          <div style={{
            background: 'linear-gradient(135deg,#F0FDF4,#DCFCE7)',
            border: '1px solid #86EFAC',
            borderRadius: 14, padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#14532D', margin: 0 }}>Ready to notify parents</p>
              <p style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>
                {students.length} students · {activeGroup.length} subject{activeGroup.length !== 1 ? 's' : ''} ·{' '}
                {stats?.pct ?? 0}% marks entered
              </p>
            </div>
            <button
              onClick={() => { setPhase('credentials'); setCredError(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 24px',
                background: 'linear-gradient(135deg,#059669,#10B981)',
                color: 'white', border: 'none', borderRadius: 12,
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(5,150,105,0.35)',
                whiteSpace: 'nowrap',
              }}
            >
              📱 Send SMS to Parents
            </button>
          </div>
        </>
      )}

      {/* ── Credentials Modal ─────────────────────────────────────────────────── */}
      {(phase === 'credentials' || phase === 'sending' || phase === 'done') && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            width: '100%', maxWidth: 480,
            background: 'white', borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
            overflow: 'hidden',
          }}>

            {/* ── Credentials step ── */}
            {phase === 'credentials' && (
              <>
                <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>SMS Gateway Credentials</h3>
                      <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>
                        Enter your SMS Gate credentials to proceed
                      </p>
                    </div>
                    <button
                      onClick={closeModal}
                      style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', color: '#64748B', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >✕</button>
                  </div>
                </div>
                <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Summary */}
                  <div style={{ padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10 }}>
                    <p style={{ fontSize: 12, color: '#15803D', margin: 0, fontWeight: 600 }}>
                      📨 Sending result SMS for{' '}
                      <strong>{activeGroup?.[0]?.name}</strong> to{' '}
                      <strong>{students.length} students</strong>
                    </p>
                  </div>

                  {credError && (
                    <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 9, fontSize: 13, color: '#DC2626' }}>
                      {credError}
                    </div>
                  )}

                  <div>
                    <label style={LS}>SMS Gateway Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="e.g. FBNWSW"
                      style={IS}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label style={LS}>SMS Gateway Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPwd ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        placeholder="••••••••••••"
                        style={{ ...IS, paddingRight: 44 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd(p => !p)}
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94A3B8' }}
                      >
                        {showPwd ? '🙈' : '👁️'}
                      </button>
                    </div>
                    <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 5 }}>
                      🔒 These credentials are used once and never stored.
                    </p>
                  </div>
                </div>
                <div style={{ padding: '14px 28px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 10 }}>
                  <button
                    onClick={closeModal}
                    style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                  >Cancel</button>
                  <button
                    onClick={handleSend}
                    disabled={!username.trim() || !password.trim()}
                    style={{
                      flex: 2, padding: 12, borderRadius: 10, border: 'none',
                      background: (!username.trim() || !password.trim()) ? '#D1FAE5' : 'linear-gradient(135deg,#059669,#10B981)',
                      color: 'white', fontSize: 13, fontWeight: 700,
                      cursor: (!username.trim() || !password.trim()) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    📤 Send Now ({students.length} SMS)
                  </button>
                </div>
              </>
            )}

            {/* ── Sending / Done step ── */}
            {(phase === 'sending' || phase === 'done') && (
              <>
                <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #F1F5F9' }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    {phase === 'sending' ? '📤 Sending SMS...' : '✅ SMS Sending Complete'}
                  </h3>
                  <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>
                    {phase === 'sending'
                      ? `Processing ${progressDone} of ${progressTotal}...`
                      : `Finished sending to ${activeGroup?.[0]?.name}`}
                  </p>
                </div>

                <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Error from API */}
                  {sseError && (
                    <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 10, fontSize: 13, color: '#DC2626', fontWeight: 600 }}>
                      ❌ {sseError}
                    </div>
                  )}

                  {/* Progress bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                        {phase === 'sending' ? `Sending to: ${currentStudent}` : 'All done'}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                        {progressDone}/{progressTotal}
                      </span>
                    </div>
                    <div style={{ height: 10, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 99,
                        width: `${progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0}%`,
                        background: phase === 'done' && !sseError
                          ? 'linear-gradient(90deg,#059669,#10B981)'
                          : 'linear-gradient(90deg,#3B82F6,#06B6D4)',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>

                  {/* Final summary */}
                  {phase === 'done' && !sseError && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {[
                        { label: 'Sent', value: finalSent,    icon: '✅', color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' },
                        { label: 'Failed', value: finalFailed, icon: '❌', color: '#DC2626', bg: '#FEF2F2', border: '#FEE2E2' },
                        { label: 'Skipped', value: finalSkipped, icon: '⚠️', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                      ].map(card => (
                        <div key={card.label} style={{ background: card.bg, border: `1px solid ${card.border}`, borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                          <div style={{ fontSize: 22 }}>{card.icon}</div>
                          <p style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: '4px 0 2px' }}>{card.value}</p>
                          <p style={{ fontSize: 11, fontWeight: 700, color: card.color, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{card.label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Error / skipped log toggle */}
                  {phase === 'done' && progressRows.some(r => r.status !== 'sent') && (
                    <div>
                      <button
                        onClick={() => setShowErrorLog(v => !v)}
                        style={{ fontSize: 12, fontWeight: 700, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        {showErrorLog ? '▲' : '▼'} {showErrorLog ? 'Hide' : 'Show'} details for failed / skipped
                      </button>
                      {showErrorLog && (
                        <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {progressRows
                            .filter(r => r.status !== 'sent')
                            .map((r, i) => (
                              <div key={i} style={{ padding: '6px 10px', background: r.status === 'failed' ? '#FEF2F2' : '#FFFBEB', borderRadius: 7, fontSize: 12 }}>
                                <span style={{ fontWeight: 600, color: r.status === 'failed' ? '#DC2626' : '#D97706' }}>
                                  {r.status === 'failed' ? '❌' : '⚠️'} {r.name}
                                </span>
                                {' '}— {r.error ?? r.reason ?? r.status}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Skipped note */}
                  {(finalSkipped > 0 || progressRows.some(r => r.status === 'skipped')) && phase === 'done' && (
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>
                      ⚠️ Skipped students have no phone number linked to their parent account. Add it in the Parents section.
                    </p>
                  )}
                </div>

                <div style={{ padding: '14px 28px', borderTop: '1px solid #F1F5F9' }}>
                  <button
                    onClick={closeModal}
                    disabled={phase === 'sending'}
                    style={{
                      width: '100%', padding: 12, borderRadius: 10,
                      border: 'none',
                      background: phase === 'sending' ? '#E2E8F0' : 'linear-gradient(135deg,#0F172A,#1E293B)',
                      color: phase === 'sending' ? '#94A3B8' : 'white',
                      fontSize: 13, fontWeight: 700,
                      cursor: phase === 'sending' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {phase === 'sending' ? 'Please wait...' : 'Close'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
