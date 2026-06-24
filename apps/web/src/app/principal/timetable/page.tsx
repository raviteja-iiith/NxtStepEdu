'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────
interface TimetableSlot {
  id: string; section_id: string; subject_id: string; teacher_id: string;
  day_of_week: number; period_number: number; start_time: string; end_time: string;
  room: string | null; subject_name?: string; teacher_name?: string; is_confirmed?: boolean;
}
interface Section { id: string; name: string; class_name: string; }
interface Subject { id: string; name: string; teacher_id?: string; teacher_name?: string; }
interface Teacher { id: string; full_name: string; }

// ─── Constants ───────────────────────────────────────────────────────────────
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat'];
const SUBJECT_COLORS = [
  '#EFF6FF','#F0FDF4','#FFFBEB','#FFF1F2','#F5F3FF',
  '#F0FDFA','#FFF7ED','#F0F9FF','#FDF4FF','#F7FEE7',
  '#ECFDF5','#FEF9C3'
];
const SUBJECT_BORDER = [
  '#BFDBFE','#BBF7D0','#FDE68A','#FECDD3','#DDD6FE',
  '#99F6E4','#FED7AA','#BAE6FD','#E9D5FF','#D9F99D',
  '#A7F3D0','#FEF08A'
];

// ─── Auto-Generate Algorithm ─────────────────────────────────────────────────
function generateTimetable(
  subjects: Subject[],
  periodsPerDay: number,
  days: number,
  periodsPerWeek: Record<string, number>,
  existingSlots: TimetableSlot[], // other sections' confirmed slots
  startTime: string,
  periodDuration: number,
  breakAfterPeriod: number
): Omit<TimetableSlot, 'id' | 'section_id' | 'is_confirmed'>[] {
  const result: Omit<TimetableSlot, 'id' | 'section_id' | 'is_confirmed'>[] = [];
  // Build a teacher → busy set from existing slots
  const teacherBusy = new Set<string>();
  existingSlots.forEach(s => teacherBusy.add(`${s.teacher_id}_${s.day_of_week}_${s.period_number}`));

  // Build a pool of (subjectId, teacherId) entries based on periodsPerWeek
  const pool: { subject_id: string; teacher_id: string; subject_name: string; teacher_name: string }[] = [];
  subjects.forEach(sub => {
    const count = periodsPerWeek[sub.id] ?? 1;
    for (let i = 0; i < count; i++) {
      pool.push({ subject_id: sub.id, teacher_id: sub.teacher_id || '', subject_name: sub.name, teacher_name: sub.teacher_name || '' });
    }
  });

  // Shuffle pool for variety
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Track occupancy
  const placed = new Set<string>();        // "day_period"
  const teacherUsed = new Set<string>();   // "teacherId_day_period" for this section
  const subjectDay = new Map<string, Set<number>>(); // subjectId → days already used

  const pad = (n: number) => String(n).padStart(2, '0');
  const calcTime = (period: number) => {
    const [sh, sm] = startTime.split(':').map(Number);
    let totalMins = sh * 60 + sm + (period - 1) * periodDuration;
    if (period > breakAfterPeriod) totalMins += 30;
    const endMins = totalMins + periodDuration;
    return { start: `${pad(Math.floor(totalMins/60))}:${pad(totalMins%60)}`, end: `${pad(Math.floor(endMins/60))}:${pad(endMins%60)}` };
  };

  // PERIOD-FIRST traversal: visit (P1,Mon),(P1,Tue)…(P1,Sat),(P2,Mon)…
  // This distributes subjects evenly across all days rather than piling on Monday.
  for (let period = 1; period <= periodsPerDay && pool.length > 0; period++) {
    for (let day = 1; day <= days && pool.length > 0; day++) {
      const cellKey = `${day}_${period}`;
      if (placed.has(cellKey)) continue;

      // Find best-fit item: teacher free + subject not already on this day
      let foundIdx = -1;
      for (let attempt = 0; attempt < pool.length; attempt++) {
        const item = pool[attempt];
        const tKey = `${item.teacher_id}_${day}_${period}`;
        const daysUsed = subjectDay.get(item.subject_id) || new Set<number>();
        const isTeacherFree = item.teacher_id ? (!teacherBusy.has(tKey) && !teacherUsed.has(tKey)) : true;
        if (isTeacherFree && !daysUsed.has(day)) {
          foundIdx = attempt; break;
        }
      }
      // Fallback: ignore same-day constraint
      if (foundIdx === -1) {
        for (let attempt = 0; attempt < pool.length; attempt++) {
          const item = pool[attempt];
          const tKey = `${item.teacher_id}_${day}_${period}`;
          const isTeacherFree = item.teacher_id ? (!teacherBusy.has(tKey) && !teacherUsed.has(tKey)) : true;
          if (isTeacherFree) { foundIdx = attempt; break; }
        }
      }
      if (foundIdx === -1) continue;

      const item = pool[foundIdx];
      const tKey = `${item.teacher_id}_${day}_${period}`;
      const { start, end } = calcTime(period);
      result.push({ subject_id: item.subject_id, teacher_id: item.teacher_id, day_of_week: day, period_number: period, start_time: start, end_time: end, room: null, subject_name: item.subject_name, teacher_name: item.teacher_name });
      placed.add(cellKey);
      if (item.teacher_id) {
        teacherUsed.add(tKey);
        teacherBusy.add(tKey);
      }
      const du = subjectDay.get(item.subject_id) || new Set<number>();
      du.add(day); subjectDay.set(item.subject_id, du);
      pool.splice(foundIdx, 1);
    }
  }
  return result;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function TimetablePage() {
  const supabase = createClient();

  // Core data
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [allSlots, setAllSlots] = useState<TimetableSlot[]>([]); // cross-section
  const [assignments, setAssignments] = useState<{subject_id: string, section_id: string, teacher_id: string, teacher_name: string}[]>([]);
  const [schoolId, setSchoolId] = useState('');

  // UI state
  const [selectedSection, setSelectedSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'manual' | 'auto' | 'teacher'>('manual');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Manual edit modal
  const [showModal, setShowModal] = useState<{ day: number; period: number } | null>(null);
  const [slotForm, setSlotForm] = useState({ subject_id: '', teacher_id: '', start_time: '08:00', end_time: '08:45', room: '' });
  const [conflict, setConflict] = useState('');
  const [saving, setSaving] = useState(false);

  // Auto-generate config
  const [periods, setPeriods] = useState(8);
  const [days, setDays] = useState(6);
  const [startTime, setStartTime] = useState('08:00');
  const [periodDuration, setPeriodDuration] = useState(45);
  const [breakAfterPeriod, setBreakAfterPeriod] = useState(4);
  const [periodsPerWeek, setPeriodsPerWeek] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<Omit<TimetableSlot, 'id' | 'section_id' | 'is_confirmed'>[]>([]);
  const [generating, setGenerating] = useState(false);
  const [applyingPreview, setApplyingPreview] = useState(false);

  // Teacher view
  const [selectedTeacher, setSelectedTeacher] = useState('');

  // Subject color map
  const [subjectColorMap, setSubjectColorMap] = useState<Record<string, number>>({});

  const fetchStructure = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) { setLoading(false); return; }
    const { data: userRow } = await supabase.from('users').select('school_id').eq('id', userId).single();
    const sid = userRow?.school_id;
    if (!sid) { setLoading(false); return; }
    setSchoolId(sid);

    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).eq('school_id', sid).maybeSingle();

    // Sections
    let secQ = supabase.from('sections').select('id, name, classes(name)').eq('school_id', sid);
    if (yr?.id) secQ = secQ.eq('academic_year_id', yr.id);
    const { data: secD } = await secQ;
    let secData = secD;
    if (!secData?.length) {
      const { data: a } = await supabase.from('sections').select('id, name, classes(name)').eq('school_id', sid);
      secData = a;
    }
    if (secData) setSections(secData.map((s: Record<string, unknown>) => ({ id: s.id as string, name: s.name as string, class_name: (s.classes as Record<string, string>)?.name || '' })));

    // Subjects with teacher
    let subQ = supabase.from('subjects').select('id, name, teacher_id, users(full_name)').eq('school_id', sid);
    if (yr?.id) subQ = subQ.eq('academic_year_id', yr.id);
    const { data: subD } = await subQ;
    let subData = subD;
    if (!subData?.length) {
      const { data: a } = await supabase.from('subjects').select('id, name, teacher_id, users(full_name)').eq('school_id', sid);
      subData = a;
    }
    if (subData) {
      const mapped = subData.map((s: Record<string, unknown>) => ({
        id: s.id as string, name: s.name as string,
        teacher_id: s.teacher_id as string,
        teacher_name: (s.users as Record<string, string>)?.full_name || '',
      }));
      setSubjects(mapped);
      // Build color map
      const cm: Record<string, number> = {};
      mapped.forEach((s: Subject, i: number) => { cm[s.id] = i % SUBJECT_COLORS.length; });
      setSubjectColorMap(cm);
    }

    const { data: t } = await supabase.from('users').select('id, full_name').eq('school_id', sid).eq('role', 'teacher').eq('is_active', true).order('full_name');
    if (t) setTeachers(t);

    const { data: asgn } = await supabase.from('teacher_section_assignments').select('subject_id, section_id, teacher_id, users(full_name)').eq('school_id', sid);
    if (asgn) {
      setAssignments(asgn.map((a: Record<string, any>) => ({ subject_id: a.subject_id, section_id: a.section_id, teacher_id: a.teacher_id, teacher_name: a.users?.full_name || '' })));
    }

    setLoading(false);
  }, [supabase]);

  const currentSubjects = useMemo(() => {
    return subjects.map(sub => {
      const assignment = assignments.find(a => a.subject_id === sub.id && a.section_id === selectedSection);
      if (assignment) {
        return { ...sub, teacher_id: assignment.teacher_id, teacher_name: assignment.teacher_name };
      }
      return sub;
    });
  }, [subjects, assignments, selectedSection]);

  const fetchSlots = useCallback(async () => {
    if (!selectedSection) return;
    const { data } = await supabase.from('timetable')
      .select('*, subjects(name), users!timetable_teacher_id_fkey(full_name)')
      .eq('section_id', selectedSection);
    if (data) {
      const mapped = data.map((s: Record<string, unknown>) => ({
        ...s,
        subject_name: (s.subjects as Record<string, string>)?.name,
        teacher_name: (s['users!timetable_teacher_id_fkey'] as Record<string, string>)?.full_name || (s.users as Record<string, string>)?.full_name,
      })) as TimetableSlot[];
      setSlots(mapped);
      setIsConfirmed(mapped.length > 0 && mapped.every(s => s.is_confirmed));
    }
  }, [supabase, selectedSection]);

  const fetchAllSlots = useCallback(async () => {
    if (!schoolId) return;
    const { data } = await supabase.from('timetable').select('teacher_id, day_of_week, period_number, section_id').eq('school_id', schoolId);
    if (data) setAllSlots(data as TimetableSlot[]);
  }, [supabase, schoolId]);

  useEffect(() => { fetchStructure(); }, [fetchStructure]);
  useEffect(() => { fetchSlots(); }, [fetchSlots]);
  useEffect(() => { if (schoolId) fetchAllSlots(); }, [fetchAllSlots, schoolId]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getSlot = (day: number, period: number) => slots.find(s => s.day_of_week === day && s.period_number === period);
  const getPreviewSlot = (day: number, period: number) => preview.find(s => s.day_of_week === day && s.period_number === period);
  const getTeacherSlots = () => allSlots.filter(s => s.teacher_id === selectedTeacher);

  const checkConflict = async (teacherId: string, day: number, period: number) => {
    if (!teacherId) { setConflict(''); return; }
    const clash = allSlots.find(s => s.teacher_id === teacherId && s.day_of_week === day && s.period_number === period && s.section_id !== selectedSection);
    if (clash) {
      const sec = sections.find(s => s.id === clash.section_id);
      setConflict(`⚠️ Teacher already assigned to ${sec ? `${sec.class_name} - ${sec.name}` : 'another class'} at this time.`);
    } else {
      setConflict('');
    }
  };

  const handleSaveSlot = async () => {
    if (!slotForm.subject_id || !slotForm.teacher_id || !showModal || conflict) return;
    setSaving(true);
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle();
    await supabase.from('timetable').delete().eq('section_id', selectedSection).eq('day_of_week', showModal.day).eq('period_number', showModal.period);
    await supabase.from('timetable').insert({
      school_id: schoolId, section_id: selectedSection,
      subject_id: slotForm.subject_id, teacher_id: slotForm.teacher_id,
      day_of_week: showModal.day, period_number: showModal.period,
      start_time: slotForm.start_time, end_time: slotForm.end_time,
      room: slotForm.room || null, academic_year_id: yr?.id, is_confirmed: false,
    });
    setShowModal(null);
    fetchSlots(); fetchAllSlots();
    setSaving(false);
  };

  const deleteSlot = async (id: string) => {
    await supabase.from('timetable').delete().eq('id', id);
    fetchSlots(); fetchAllSlots();
  };

  const handleConfirm = async () => {
    setConfirming(true);
    await supabase.from('timetable').update({ is_confirmed: true }).eq('section_id', selectedSection);
    setIsConfirmed(true);
    fetchSlots();
    setConfirming(false);
  };

  const handleResetDraft = async () => {
    setConfirming(true);
    await supabase.from('timetable').update({ is_confirmed: false }).eq('section_id', selectedSection);
    setIsConfirmed(false);
    fetchSlots();
    setConfirming(false);
  };

  const handleAutoGenerate = () => {
    setGenerating(true);
    const otherSlots = allSlots.filter(s => s.section_id !== selectedSection);
    const result = generateTimetable(currentSubjects, periods, days, periodsPerWeek, otherSlots as TimetableSlot[], startTime, periodDuration, breakAfterPeriod);
    setPreview(result);
    setGenerating(false);
  };

  const handleApplyPreview = async () => {
    if (!preview.length) return;
    setApplyingPreview(true);
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle();
    // Clear existing
    await supabase.from('timetable').delete().eq('section_id', selectedSection);
    // Insert preview
    const rows = preview.map(p => ({
      school_id: schoolId, section_id: selectedSection,
      subject_id: p.subject_id, teacher_id: p.teacher_id || null,
      day_of_week: p.day_of_week, period_number: p.period_number,
      start_time: p.start_time, end_time: p.end_time,
      room: null, academic_year_id: yr?.id, is_confirmed: false,
    }));
    await supabase.from('timetable').insert(rows);
    setPreview([]);
    setActiveTab('manual');
    fetchSlots(); fetchAllSlots();
    setApplyingPreview(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg,#1E40AF 0%,#7C3AED 100%)', borderRadius: '20px', padding: '28px 32px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>🗓️ Timetable Maker</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.8, fontSize: '0.9rem' }}>Build, auto-generate & confirm class schedules</p>
        </div>
        {selectedSection && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ padding: '6px 16px', borderRadius: '99px', background: isConfirmed ? '#22C55E' : '#F59E0B', color: '#fff', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isConfirmed ? '✅ Confirmed' : '🟡 Draft'}
            </span>
            {slots.length > 0 && (
              isConfirmed ? (
                <button onClick={handleResetDraft} disabled={confirming} style={{ padding: '8px 20px', borderRadius: '10px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
                  {confirming ? '...' : '✏️ Reset to Draft'}
                </button>
              ) : (
                <button onClick={handleConfirm} disabled={confirming} style={{ padding: '8px 20px', borderRadius: '10px', background: '#22C55E', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', boxShadow: '0 4px 14px rgba(34,197,94,0.4)' }}>
                  {confirming ? '...' : '🔒 Confirm Timetable'}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* ── Section Selector ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <select value={selectedSection} onChange={e => { setSelectedSection(e.target.value); setPreview([]); }}
          style={{ padding: '10px 16px', borderRadius: '12px', border: '1.5px solid #E2E8F0', fontSize: '0.9rem', fontWeight: 600, color: '#1E293B', background: '#fff', minWidth: '220px' }}>
          <option value="">Select Section...</option>
          {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} — {s.name}</option>)}
        </select>
        {selectedSection && <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{slots.length} slot{slots.length !== 1 ? 's' : ''} scheduled</span>}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      {selectedSection && (
        <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', borderRadius: '14px', padding: '4px', width: 'fit-content' }}>
          {(['manual','auto','teacher'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ padding: '8px 22px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', transition: 'all .2s',
                background: activeTab === tab ? '#fff' : 'transparent',
                color: activeTab === tab ? '#1E40AF' : '#64748B',
                boxShadow: activeTab === tab ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
              {tab === 'manual' ? '✏️ Manual Edit' : tab === 'auto' ? '⚡ Auto Generate' : '👩‍🏫 Teacher View'}
            </button>
          ))}
        </div>
      )}

      {/* ══ Loading / Empty ══════════════════════════════════════════════ */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>Loading...</div>
      ) : !selectedSection ? (
        <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', padding: '60px', textAlign: 'center' }}>
          <p style={{ fontSize: '3rem', margin: 0 }}>🗓️</p>
          <p style={{ color: '#94A3B8', marginTop: '12px' }}>Select a section to manage its timetable</p>
        </div>
      ) : (
        <>
          {/* ══ MANUAL TAB ═══════════════════════════════════════════════ */}
          {activeTab === 'manual' && (
            <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              {/* Period count control */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Periods/Day:</label>
                  <input type="number" min={4} max={12} value={periods} onChange={e => setPeriods(parseInt(e.target.value) || 8)} disabled={isConfirmed}
                    style={{ width: '56px', padding: '4px 8px', borderRadius: '8px', border: '1px solid #E2E8F0', textAlign: 'center', fontSize: '0.85rem' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Days:</label>
                  <select value={days} onChange={e => setDays(parseInt(e.target.value))} disabled={isConfirmed}
                    style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.85rem' }}>
                    <option value={5}>Mon–Fri</option><option value={6}>Mon–Sat</option>
                  </select>
                </div>
                {isConfirmed && <span style={{ fontSize: '0.8rem', color: '#22C55E', fontWeight: 600 }}>🔒 Timetable is confirmed. Reset to draft to edit.</span>}
              </div>
              {/* Grid */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', width: '80px' }}>Period</th>
                      {DAYS_SHORT.slice(0, days).map((d, i) => (
                        <th key={d} style={{ padding: '12px 8px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#1E40AF', background: SUBJECT_COLORS[i % SUBJECT_COLORS.length] }}>{d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: periods }, (_, p) => p + 1).map(period => (
                      <tr key={period} style={{ borderTop: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 16px', fontSize: '0.8rem', fontWeight: 700, color: '#94A3B8', textAlign: 'center' }}>P{period}</td>
                        {Array.from({ length: days }, (_, di) => di + 1).map(day => {
                          const slot = getSlot(day, period);
                          const ci = slot ? (subjectColorMap[slot.subject_id] ?? 0) : 0;
                          return (
                            <td key={day} style={{ padding: '4px' }}>
                              {slot ? (
                                <div onClick={() => { if (isConfirmed) return; setShowModal({ day, period }); setSlotForm({ subject_id: slot.subject_id, teacher_id: slot.teacher_id, start_time: slot.start_time, end_time: slot.end_time, room: slot.room || '' }); setConflict(''); }}
                                  style={{ padding: '8px 10px', borderRadius: '10px', background: SUBJECT_COLORS[ci], border: `1.5px solid ${SUBJECT_BORDER[ci]}`, minHeight: '64px', cursor: isConfirmed ? 'default' : 'pointer', position: 'relative', transition: 'box-shadow .15s' }}
                                  onMouseEnter={e => { if (!isConfirmed) (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}>
                                  <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', lineHeight: 1.3 }}>{slot.subject_name}</p>
                                  <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#475569' }}>{slot.teacher_name}</p>
                                  <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: '#94A3B8' }}>{slot.start_time}–{slot.end_time}</p>
                                  {slot.room && <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: '#94A3B8' }}>📍{slot.room}</p>}
                                  {!isConfirmed && (
                                    <button onClick={e => { e.stopPropagation(); deleteSlot(slot.id); }}
                                      style={{ position: 'absolute', top: '4px', right: '4px', background: 'none', border: 'none', color: '#FCA5A5', cursor: 'pointer', fontSize: '0.75rem', opacity: 0, transition: 'opacity .15s', lineHeight: 1 }}
                                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                      onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>✕</button>
                                  )}
                                </div>
                              ) : (
                                <div onClick={() => { if (isConfirmed) return; setShowModal({ day, period }); setSlotForm({ subject_id: '', teacher_id: '', start_time: `${String(7 + period).padStart(2,'0')}:00`, end_time: `${String(7 + period).padStart(2,'0')}:45`, room: '' }); setConflict(''); }}
                                  style={{ minHeight: '64px', borderRadius: '10px', border: '2px dashed #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isConfirmed ? 'default' : 'pointer', color: '#CBD5E1', fontSize: '1.2rem', transition: 'all .15s' }}
                                  onMouseEnter={e => { if (!isConfirmed) { (e.currentTarget as HTMLElement).style.borderColor = '#93C5FD'; (e.currentTarget as HTMLElement).style.background = '#EFF6FF'; }}}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                  {!isConfirmed && '+'}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ AUTO-GENERATE TAB ════════════════════════════════════════ */}
          {activeTab === 'auto' && (
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
              {/* Config panel */}
              <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>⚙️ Generator Settings</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {[
                    { label: 'Periods / Day', value: periods, onChange: (v: string) => setPeriods(parseInt(v)||8), type: 'number', min: 4, max: 12 },
                    { label: 'Days / Week', value: days, onChange: (v: string) => setDays(parseInt(v)||6), type: 'number', min: 5, max: 6 },
                    { label: 'Start Time', value: startTime, onChange: setStartTime, type: 'time' },
                    { label: 'Period Duration (min)', value: periodDuration, onChange: (v: string) => setPeriodDuration(parseInt(v)||45), type: 'number', min: 30, max: 90 },
                    { label: 'Break After Period', value: breakAfterPeriod, onChange: (v: string) => setBreakAfterPeriod(parseInt(v)||4), type: 'number', min: 1, max: 8 },
                  ].map(f => (
                    <div key={f.label}>
                      <label style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '4px' }}>{f.label}</label>
                      <input type={f.type} value={f.value} onChange={e => (f.onChange as (v: string) => void)(e.target.value)}
                        min={(f as {min?: number}).min} max={(f as {max?: number}).max}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #E2E8F0', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '8px' }}>📚 Periods/Week per Subject</label>
                    {currentSubjects.map(sub => (
                      <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.78rem', color: '#334155', flex: 1 }}>
                          {sub.name}
                          {!sub.teacher_id && <span style={{ marginLeft: '6px', fontSize: '0.65rem', color: '#EF4444', background: '#FEF2F2', padding: '2px 6px', borderRadius: '4px' }}>No Teacher</span>}
                        </span>
                        <input type="number" min={0} max={20} value={periodsPerWeek[sub.id] ?? 1} onChange={e => { const val = parseInt(e.target.value); setPeriodsPerWeek(p => ({ ...p, [sub.id]: isNaN(val) ? 0 : val })); }}
                          style={{ width: '48px', padding: '4px 6px', borderRadius: '8px', border: '1px solid #E2E8F0', textAlign: 'center', fontSize: '0.8rem' }} />
                      </div>
                    ))}
                  </div>
                  <button onClick={handleAutoGenerate} disabled={generating}
                    style={{ padding: '12px', borderRadius: '12px', background: 'linear-gradient(135deg,#1E40AF,#7C3AED)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                    {generating ? '⏳ Generating...' : '⚡ Generate Timetable'}
                  </button>
                </div>
              </div>
              {/* Preview grid */}
              <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>Preview</h3>
                  {preview.length > 0 && (
                    <button onClick={handleApplyPreview} disabled={applyingPreview}
                      style={{ padding: '8px 20px', borderRadius: '10px', background: '#22C55E', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                      {applyingPreview ? '...' : '✅ Apply & Switch to Manual'}
                    </button>
                  )}
                </div>
                {preview.length === 0 ? (
                  <div style={{ padding: '60px', textAlign: 'center', color: '#94A3B8' }}>
                    <p style={{ fontSize: '2.5rem', margin: 0 }}>⚡</p>
                    <p style={{ marginTop: '12px' }}>Configure settings and click Generate to see a preview</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          <th style={{ padding: '10px 14px', fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textAlign: 'left' }}>Period</th>
                          {DAYS_SHORT.slice(0, days).map(d => <th key={d} style={{ padding: '10px 8px', fontSize: '0.75rem', color: '#1E40AF', fontWeight: 700, textAlign: 'center' }}>{d}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: periods }, (_, p) => p + 1).map(period => (
                          <tr key={period} style={{ borderTop: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#94A3B8' }}>P{period}</td>
                            {Array.from({ length: days }, (_, di) => di + 1).map(day => {
                              const ps = getPreviewSlot(day, period);
                              const ci = ps ? (subjectColorMap[ps.subject_id] ?? 0) : 0;
                              return (
                                <td key={day} style={{ padding: '4px' }}>
                                  {ps ? (
                                    <div style={{ padding: '6px 8px', borderRadius: '8px', background: SUBJECT_COLORS[ci], border: `1.5px solid ${SUBJECT_BORDER[ci]}`, minHeight: '56px' }}>
                                      <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#1E293B' }}>{ps.subject_name}</p>
                                      <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: '#475569' }}>{ps.teacher_name}</p>
                                      <p style={{ margin: '2px 0 0', fontSize: '0.62rem', color: '#94A3B8' }}>{ps.start_time}–{ps.end_time}</p>
                                    </div>
                                  ) : <div style={{ minHeight: '56px', borderRadius: '8px', background: '#F8FAFC' }} />}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ TEACHER VIEW TAB ═════════════════════════════════════════ */}
          {activeTab === 'teacher' && (
            <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9' }}>
                <select value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)}
                  style={{ padding: '10px 16px', borderRadius: '12px', border: '1.5px solid #E2E8F0', fontSize: '0.9rem', fontWeight: 600, color: '#1E293B', minWidth: '240px' }}>
                  <option value="">Select Teacher...</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              {!selectedTeacher ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94A3B8' }}>
                  <p style={{ fontSize: '2.5rem', margin: 0 }}>👩‍🏫</p>
                  <p style={{ marginTop: '12px' }}>Select a teacher to view their full schedule</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', color: '#64748B', fontWeight: 700 }}>Period</th>
                        {DAYS_SHORT.slice(0, 6).map(d => <th key={d} style={{ padding: '12px 8px', textAlign: 'center', fontSize: '0.75rem', color: '#1E40AF', fontWeight: 700 }}>{d}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 8 }, (_, p) => p + 1).map(period => (
                        <tr key={period} style={{ borderTop: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '8px 16px', fontSize: '0.8rem', fontWeight: 700, color: '#94A3B8' }}>P{period}</td>
                          {Array.from({ length: 6 }, (_, di) => di + 1).map(day => {
                            const ts = getTeacherSlots().find(s => s.day_of_week === day && s.period_number === period);
                            const sec = ts ? sections.find(s => s.id === ts.section_id) : null;
                            return (
                              <td key={day} style={{ padding: '4px' }}>
                                {ts && sec ? (
                                  <div style={{ padding: '8px 10px', borderRadius: '10px', background: '#EFF6FF', border: '1.5px solid #BFDBFE', minHeight: '60px' }}>
                                    <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#1E40AF' }}>{sec.class_name} – {sec.name}</p>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: '#475569' }}>{ts.start_time}–{ts.end_time}</p>
                                  </div>
                                ) : <div style={{ minHeight: '60px', borderRadius: '10px', border: '1px dashed #F1F5F9' }} />}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══ SLOT MODAL ═══════════════════════════════════════════════════ */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '460px', background: '#fff', borderRadius: '24px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', padding: '32px', animation: 'scaleIn .2s ease' }}>
            <style>{`@keyframes scaleIn{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1E293B' }}>{DAYS[showModal.day - 1]}</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>Period {showModal.period}</p>
              </div>
              <button onClick={() => setShowModal(null)} style={{ background: '#F1F5F9', border: 'none', borderRadius: '10px', width: '36px', height: '36px', cursor: 'pointer', fontSize: '1rem', color: '#64748B' }}>✕</button>
            </div>

            {conflict && (
              <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '12px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: '0.82rem', fontWeight: 600 }}>
                {conflict}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '6px' }}>Subject *</label>
                <select value={slotForm.subject_id} onChange={e => { setSlotForm(f => ({ ...f, subject_id: e.target.value })); const sub = currentSubjects.find(s => s.id === e.target.value); if (sub?.teacher_id) { setSlotForm(f => ({ ...f, subject_id: e.target.value, teacher_id: sub.teacher_id || '' })); checkConflict(sub.teacher_id || '', showModal.day, showModal.period); } }}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1.5px solid #E2E8F0', fontSize: '0.9rem', boxSizing: 'border-box' }}>
                  <option value="">Select subject...</option>
                  {currentSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '6px' }}>Teacher *</label>
                <select value={slotForm.teacher_id} onChange={e => { setSlotForm(f => ({ ...f, teacher_id: e.target.value })); checkConflict(e.target.value, showModal.day, showModal.period); }}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: `1.5px solid ${conflict ? '#FCA5A5' : '#E2E8F0'}`, fontSize: '0.9rem', boxSizing: 'border-box' }}>
                  <option value="">Select teacher...</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '6px' }}>Start Time</label>
                  <input type="time" value={slotForm.start_time} onChange={e => setSlotForm(f => ({ ...f, start_time: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1.5px solid #E2E8F0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '6px' }}>End Time</label>
                  <input type="time" value={slotForm.end_time} onChange={e => setSlotForm(f => ({ ...f, end_time: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1.5px solid #E2E8F0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '6px' }}>Room (optional)</label>
                <input type="text" value={slotForm.room} onChange={e => setSlotForm(f => ({ ...f, room: e.target.value }))} placeholder="e.g. Room 201"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1.5px solid #E2E8F0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowModal(null)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1.5px solid #E2E8F0', background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>Cancel</button>
              <button onClick={handleSaveSlot} disabled={saving || !!conflict || !slotForm.subject_id || !slotForm.teacher_id}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'linear-gradient(135deg,#1E40AF,#7C3AED)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', opacity: (saving || !!conflict || !slotForm.subject_id || !slotForm.teacher_id) ? 0.5 : 1 }}>
                {saving ? 'Saving...' : '💾 Save Slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
