'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────
interface TimetableSlot {
  id: string; section_id: string; subject_id: string; teacher_id: string;
  day_of_week: number; period_number: number; start_time: string; end_time: string;
  room: string | null; subject_name?: string; teacher_name?: string; is_confirmed?: boolean;
}
interface Section { id: string; name: string; class_name: string; class_teacher_id?: string; }
interface Subject { id: string; name: string; teacher_id?: string; teacher_name?: string; }
interface Teacher { id: string; full_name: string; }

// ─── Constants ───────────────────────────────────────────────────────────────
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SUBJECT_COLORS = [
  '#EFF6FF', '#F0FDF4', '#FFFBEB', '#FFF1F2', '#F5F3FF',
  '#F0FDFA', '#FFF7ED', '#F0F9FF', '#FDF4FF', '#F7FEE7',
  '#ECFDF5', '#FEF9C3'
];
const SUBJECT_BORDER = [
  '#BFDBFE', '#BBF7D0', '#FDE68A', '#FECDD3', '#DDD6FE',
  '#99F6E4', '#FED7AA', '#BAE6FD', '#E9D5FF', '#D9F99D',
  '#A7F3D0', '#FEF08A'
];

// ─── Generate Result Type ────────────────────────────────────────────────────
interface GenerateResult {
  slots: Omit<TimetableSlot, 'id' | 'section_id' | 'is_confirmed'>[];
  errors: string[];
  warnings: string[];
}

// ─── Auto-Generate Algorithm (Column-First, Consistent Periods) ───────────────
//
// DESIGN:
//   • Each period number is a "column". The same subject sits at the same
//     period on every day it is scheduled → consistent daily structure.
//   • Priority order: CT → P1 every day | ⭐ Starred → P2, P3 … | Regular → rest
//   • Option-B: one period column can serve different regular subjects on
//     different days when P/W < days.
//   • Conflict fallback (teacher busy at their fixed period on a specific day):
//       1. If teacher is busy, leave slot empty to maintain column consistency.
// ─────────────────────────────────────────────────────────────────────────────
function generateTimetable(
  subjects: Subject[],
  periodsPerDay: number,
  days: number,
  periodsPerWeekConfig: Record<string, number>,
  existingSlots: TimetableSlot[],
  startTime: string,
  periodDuration: number,
  breakAfterPeriod: number,
  classTeacherId?: string,
  classTeacherSubjectId?: string,
  specialConfig?: Record<string, { isSpecial: boolean; fixedPeriod: number }>
): GenerateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const result: Omit<TimetableSlot, 'id' | 'section_id' | 'is_confirmed'>[] = [];

  const pad = (n: number) => String(n).padStart(2, '0');
  const calcTime = (period: number) => {
    const [sh, sm] = startTime.split(':').map(Number);
    let totalMins = sh * 60 + sm + (period - 1) * periodDuration;
    if (period > breakAfterPeriod) totalMins += 30;
    const endMins = totalMins + periodDuration;
    return {
      start: `${pad(Math.floor(totalMins / 60))}:${pad(totalMins % 60)}`,
      end: `${pad(Math.floor(endMins / 60))}:${pad(endMins % 60)}`,
    };
  };

  const noTeacherSubs = subjects.filter(s => !s.teacher_id && (periodsPerWeekConfig[s.id] ?? 0) > 0);
  noTeacherSubs.forEach(s =>
    warnings.push(`"${s.name}" has no teacher assigned — it will be skipped in auto-generation.`)
  );

  const schedulable = subjects.filter(s => !!s.teacher_id && (periodsPerWeekConfig[s.id] ?? 0) > 0);

  const totalRequired = schedulable.reduce(
    (acc, s) => acc + Math.min(days, periodsPerWeekConfig[s.id] ?? 0), 0
  );
  const totalAvailable = days * periodsPerDay;

  if (totalRequired > totalAvailable) {
    errors.push(
      `Total periods requested (${totalRequired}) exceeds available slots ` +
      `(${days} days × ${periodsPerDay} periods/day = ${totalAvailable} slots).`
    );
    return { slots: [], errors, warnings };
  }

  if (schedulable.length === 0) {
    errors.push('No subjects have a teacher assigned and P/W > 0.');
    return { slots: [], errors, warnings };
  }

  const crossBusy = new Set<string>();
  existingSlots.forEach(s => {
    if (s.teacher_id) crossBusy.add(`${s.teacher_id}_${s.day_of_week}_${s.period_number}`);
  });
  const thisSecBusy = new Set<string>();

  const isTeacherFree = (tid: string, day: number, period: number) =>
    !crossBusy.has(`${tid}_${day}_${period}`) &&
    !thisSecBusy.has(`${tid}_${day}_${period}`);

  const markBusy = (tid: string, day: number, period: number) =>
    thisSecBusy.add(`${tid}_${day}_${period}`);

  // ── Step 1: Separate subjects by category ───────────────────────────
  const ctSub = (classTeacherId && classTeacherSubjectId)
    ? schedulable.find(s => s.id === classTeacherSubjectId)
    : undefined;

  const ctPw = ctSub ? Math.min(days, periodsPerWeekConfig[ctSub.id] ?? days) : 0;

  const starredSubs = schedulable
    .filter(s => specialConfig?.[s.id]?.isSpecial && s.id !== ctSub?.id)
    .sort((a, b) => (specialConfig![a.id]?.fixedPeriod ?? 1) - (specialConfig![b.id]?.fixedPeriod ?? 1));

  if (starredSubs.length > (periodsPerDay - 1)) {
    errors.push(
      `Not enough periods per day to assign a dedicated period to each priority (starred) subject. ` +
      `You have ${starredSubs.length} priority subject(s) but only ${periodsPerDay - 1} period column(s) available.`
    );
    return { slots: [], errors, warnings };
  }

  const reservedIds = new Set<string>([
    ...(ctSub ? [ctSub.id] : []),
    ...starredSubs.map(s => s.id),
  ]);

  const regularSubs = schedulable.filter(s => !reservedIds.has(s.id));

  // ── Step 2: Backtracking search to assign subjects to period numbers ──
  interface SearchSubject {
    id: string;
    name: string;
    teacher_id: string;
    teacher_name: string;
    pw: number;
    isSpecial: boolean;
    fixedPeriod: number;
  }

  const starredSearchSubs: SearchSubject[] = starredSubs.map(s => ({
    id: s.id,
    name: s.name,
    teacher_id: s.teacher_id!,
    teacher_name: s.teacher_name || '',
    pw: Math.min(days, periodsPerWeekConfig[s.id] ?? days),
    isSpecial: true,
    fixedPeriod: specialConfig?.[s.id]?.fixedPeriod ?? 1
  }));

  const regularSearchSubs: SearchSubject[] = regularSubs.map(s => ({
    id: s.id,
    name: s.name,
    teacher_id: s.teacher_id!,
    teacher_name: s.teacher_name || '',
    pw: Math.min(days, periodsPerWeekConfig[s.id] ?? 0),
    isSpecial: false,
    fixedPeriod: 1
  }));

  // Sort regular subjects by weight descending for efficient packing (LPT rule)
  const sortedRegs = [...regularSearchSubs].sort((a, b) => b.pw - a.pw || a.id.localeCompare(b.id));

  const numStarred = starredSearchSubs.length;
  const numRegular = sortedRegs.length;
  const minStarredSum = (numStarred * (numStarred + 3)) / 2;

  let bestSolution: {
    binSubjects: SearchSubject[][];
    conflicts: number;
    starredSum: number;
  } | null = null;

  const binLoad = Array(periodsPerDay + 1).fill(0);
  const binSubjects: SearchSubject[][] = Array.from({ length: periodsPerDay + 1 }, () => []);

  // Initialize Period 1 with CT subject
  if (ctSub) {
    binLoad[1] = ctPw;
    binSubjects[1] = [{
      id: ctSub.id,
      name: ctSub.name,
      teacher_id: ctSub.teacher_id!,
      teacher_name: ctSub.teacher_name || '',
      pw: ctPw,
      isSpecial: false,
      fixedPeriod: 1
    }];
  }

  let statesVisited = 0;
  const MAX_STATES = 50000;

  function calculateConflictsForBin(p: number, subjectsInBin: SearchSubject[]): number {
    let conflicts = 0;
    let currentDayOffset = 0;
    for (const sub of subjectsInBin) {
      for (let d = 0; d < sub.pw; d++) {
        const day = currentDayOffset + d + 1;
        if (!isTeacherFree(sub.teacher_id, day, p)) {
          conflicts++;
        }
      }
      currentDayOffset += sub.pw;
    }
    return conflicts;
  }

  function calculateAllConflicts(): number {
    let totalConflicts = 0;
    for (let p = 1; p <= periodsPerDay; p++) {
      if (binSubjects[p].length > 0) {
        totalConflicts += calculateConflictsForBin(p, binSubjects[p]);
      }
    }
    return totalConflicts;
  }

  const starredPeriods: number[] = [];

  function searchRegular(regIndex: number) {
    if (statesVisited > MAX_STATES) return;
    statesVisited++;

    if (regIndex === numRegular) {
      const conflicts = calculateAllConflicts();
      const starredSum = starredPeriods.reduce((a, b) => a + b, 0);
      const cost = conflicts * 1000 + starredSum;

      if (bestSolution === null || cost < (bestSolution.conflicts * 1000 + bestSolution.starredSum)) {
        bestSolution = {
          binSubjects: binSubjects.map(arr => [...arr]),
          conflicts,
          starredSum
        };
      }
      return;
    }

    const sub = sortedRegs[regIndex];
    for (let p = 2; p <= periodsPerDay; p++) {
      if (binLoad[p] + sub.pw <= days) {
        if (bestSolution && bestSolution.conflicts === 0 && bestSolution.starredSum === minStarredSum) {
          return; // Already found globally optimal solution
        }

        binLoad[p] += sub.pw;
        binSubjects[p].push(sub);

        searchRegular(regIndex + 1);

        binLoad[p] -= sub.pw;
        binSubjects[p].pop();
      }
    }
  }

  function searchStarred(starIndex: number) {
    if (statesVisited > MAX_STATES) return;
    statesVisited++;

    if (starIndex === numStarred) {
      searchRegular(0);
      return;
    }

    const sub = starredSearchSubs[starIndex];
    for (let p = 2; p <= periodsPerDay; p++) {
      // Check if period p already has a starred subject assigned
      const hasStarred = binSubjects[p].some(s => s.isSpecial);
      if (hasStarred) continue;

      if (binLoad[p] + sub.pw <= days) {
        binLoad[p] += sub.pw;
        binSubjects[p].push(sub);
        starredPeriods.push(p);

        searchStarred(starIndex + 1);

        binLoad[p] -= sub.pw;
        binSubjects[p].pop();
        starredPeriods.pop();
      }
    }
  }

  // Execute backtracking search
  searchStarred(0);

  if (!bestSolution) {
    errors.push(
      "Cannot pack subjects into the available period columns without splitting them. " +
      "Please adjust Periods/Day or Periods/Week values."
    );
    return { slots: [], errors, warnings };
  }

  // ── Step 2.5: Report details on swaps and shared columns ────────────────
  const DAYS_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const solution = bestSolution as { binSubjects: SearchSubject[][]; conflicts: number; starredSum: number };

  // Explain why starred/priority subjects were assigned to other periods if shifted
  for (const sub of starredSearchSubs) {
    let assignedPeriod = -1;
    for (let p = 2; p <= periodsPerDay; p++) {
      if (solution.binSubjects[p].some(s => s.id === sub.id)) {
        assignedPeriod = p;
        break;
      }
    }

    if (assignedPeriod !== -1 && assignedPeriod !== sub.fixedPeriod) {
      const stepReasons: string[] = [];

      for (let p = sub.fixedPeriod; p < assignedPeriod; p++) {
        if (p === 1) {
          stepReasons.push("Period 1 is reserved for Class Teacher's subject");
        } else {
          // Check if taken by another starred subject
          const taker = starredSearchSubs.find(other => {
            if (other.id === sub.id) return false;
            return solution.binSubjects[p]?.some(s => s.id === other.id);
          });

          if (taker) {
            stepReasons.push(`Period ${p} is taken by priority subject "${taker.name}"`);
          } else {
            // Check for teacher busy
            const busyDays: string[] = [];
            for (let d = 1; d <= days; d++) {
              if (!isTeacherFree(sub.teacher_id, d, p)) {
                busyDays.push(DAYS_NAMES[d - 1]);
              }
            }
            if (busyDays.length > 0) {
              stepReasons.push(`Period ${p} teacher is busy on ${busyDays.join(", ")}`);
            } else {
              stepReasons.push(`Period ${p} was skipped to optimize other priority subjects or avoid conflicts`);
            }
          }
        }
      }

      if (stepReasons.length > 0) {
        warnings.push(
          `ℹ️ Priority subject "${sub.name}" was assigned to Period ${assignedPeriod} instead of preferred Period ${sub.fixedPeriod} because: ${stepReasons.join("; ")}.`
        );
      }
    }
  }

  // Explain shared periods
  for (let p = 2; p <= periodsPerDay; p++) {
    const subs = solution.binSubjects[p];
    if (subs.length > 1) {
      const shareList = subs.map(s => `"${s.name}" (${s.pw} days/week)`).join(" and ");
      warnings.push(`ℹ️ Period ${p} is shared between ${shareList}.`);
    }
  }

  // ── Step 3: Populate columns map based on the best solution ───────────
  type ColEntry = { subject_id: string; teacher_id: string; subject_name: string; teacher_name: string };
  const columns = new Map<number, (ColEntry | null)[]>();

  // Initialize all columns 2 to periodsPerDay with null arrays
  for (let p = 2; p <= periodsPerDay; p++) {
    columns.set(p, Array(days).fill(null));
  }

  // Set Period 1 if CT subject exists
  if (ctSub && periodsPerDay >= 1) {
    const entry: ColEntry = {
      subject_id: ctSub.id,
      teacher_id: ctSub.teacher_id!,
      subject_name: ctSub.name,
      teacher_name: ctSub.teacher_name || ''
    };
    columns.set(1, Array.from({ length: days }, (_, i) => (i < ctPw ? entry : null)));
  }

  // Set periods 2 to periodsPerDay
  for (let p = 2; p <= periodsPerDay; p++) {
    const col = Array(days).fill(null);
    let dayIdx = 0;
    const subsInBin = solution.binSubjects[p];

    // Sort starred first, then regular by pw descending, then id (to ensure deterministic behavior)
    const sortedSubs = [...subsInBin].sort((a, b) => {
      if (a.isSpecial !== b.isSpecial) return a.isSpecial ? -1 : 1;
      return b.pw - a.pw || a.id.localeCompare(b.id);
    });

    for (const sub of sortedSubs) {
      const entry: ColEntry = {
        subject_id: sub.id,
        teacher_id: sub.teacher_id,
        subject_name: sub.name,
        teacher_name: sub.teacher_name
      };
      for (let i = 0; i < sub.pw; i++) {
        if (dayIdx < days) {
          col[dayIdx] = entry;
          dayIdx++;
        }
      }
    }
    columns.set(p, col);
  }

  // ── Step 4: Generate output slots ──────────────────────────────────────
  for (const [period, col] of Array.from(columns.entries()).sort(([a], [b]) => a - b)) {
    const { start, end } = calcTime(period);

    for (let di = 0; di < days; di++) {
      const day = di + 1;
      const primary = col[di];
      if (!primary) continue;

      if (isTeacherFree(primary.teacher_id, day, period)) {
        result.push({ ...primary, day_of_week: day, period_number: period, start_time: start, end_time: end, room: null });
        markBusy(primary.teacher_id, day, period);
      } else {
        warnings.push(
          `⚠️ "${primary.subject_name}" teacher is busy on ${DAYS_NAMES[di]}, Period ${period} ` +
          `(teaching another class). This slot is left empty to maintain schedule consistency.`
        );
      }
    }
  }

  // ── Step 5: Count validation ──────────────────────────────────────────
  const placedCounts: Record<string, number> = {};
  result.forEach(r => { placedCounts[r.subject_id] = (placedCounts[r.subject_id] || 0) + 1; });

  for (const sub of schedulable) {
    const requested = Math.min(days, periodsPerWeekConfig[sub.id] ?? 0);
    const placed = placedCounts[sub.id] || 0;
    if (placed > requested) {
      errors.push(
        `❌ "${sub.name}" was placed ${placed} time(s) but you only requested ${requested} period(s)/week. ` +
        `This is a scheduling bug — please report it.`
      );
    } else if (placed < requested) {
      const missing = requested - placed;
      warnings.push(
        `⚠ "${sub.name}" needed ${requested} period(s)/week but only ${placed} could be placed ` +
        `(${missing} missing — teacher has conflicts in all remaining empty slots). ` +
        `Try increasing Periods/Day or resolving teacher conflicts.`
      );
    }
  }

  return { slots: result, errors, warnings };
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
  const [assignments, setAssignments] = useState<{ subject_id: string, section_id: string, teacher_id: string, teacher_name: string }[]>([]);
  const [schoolId, setSchoolId] = useState('');

  // UI state
  const [selectedSection, setSelectedSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'manual' | 'auto' | 'teacher'>('manual');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

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
  const [subjectTeacherOverrides, setSubjectTeacherOverrides] = useState<Record<string, string>>({});
  const [specialSubjects, setSpecialSubjects] = useState<Record<string, { isSpecial: boolean; fixedPeriod: number }>>({});
  const [preview, setPreview] = useState<Omit<TimetableSlot, 'id' | 'section_id' | 'is_confirmed'>[]>([]);
  const [generating, setGenerating] = useState(false);
  const [applyingPreview, setApplyingPreview] = useState(false);
  const [generateErrors, setGenerateErrors] = useState<string[]>([]);
  const [generateWarnings, setGenerateWarnings] = useState<string[]>([]);

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

    let secQ = supabase.from('sections').select('id, name, class_teacher_id, classes(name)').eq('school_id', sid);
    if (yr?.id) secQ = secQ.eq('academic_year_id', yr.id);
    const { data: secD } = await secQ;
    let secData = secD;
    if (!secData?.length) {
      const { data: a } = await supabase.from('sections').select('id, name, class_teacher_id, classes(name)').eq('school_id', sid);
      secData = a;
    }
    if (secData) setSections(secData.map((s: Record<string, unknown>) => ({ id: s.id as string, name: s.name as string, class_name: (s.classes as Record<string, string>)?.name || '', class_teacher_id: s.class_teacher_id as string | undefined })));

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
      if (assignment) return { ...sub, teacher_id: assignment.teacher_id, teacher_name: assignment.teacher_name };
      return sub;
    });
  }, [subjects, assignments, selectedSection]);

  useEffect(() => {
    const overrides: Record<string, string> = {};
    currentSubjects.forEach(sub => { if (sub.teacher_id) overrides[sub.id] = sub.teacher_id; });
    setSubjectTeacherOverrides(overrides);
  }, [selectedSection, assignments]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleClearTimetable = async () => {
    if (!selectedSection) return;
    const section = sections.find(s => s.id === selectedSection);
    const label = section ? `${section.class_name} — ${section.name}` : 'this section';
    const confirmed = window.confirm(`⚠️ Clear entire timetable for ${label}?\n\nThis will permanently delete all ${slots.length} scheduled period(s). This action cannot be undone.`);
    if (!confirmed) return;
    setClearing(true);
    await supabase.from('timetable').delete().eq('section_id', selectedSection);
    setSlots([]);
    setPreview([]);
    setIsConfirmed(false);
    await fetchAllSlots();
    setClearing(false);
  };

  const handleAutoGenerate = () => {
    setGenerating(true);
    setGenerateErrors([]);
    setGenerateWarnings([]);
    const otherSlots = allSlots.filter(s => s.section_id !== selectedSection);
    const currentSection = sections.find(s => s.id === selectedSection);
    const classTeacherId = currentSection?.class_teacher_id;

    const subjectsWithOverrides = currentSubjects.map(sub => {
      const tid = subjectTeacherOverrides[sub.id] || sub.teacher_id || '';
      const tname = tid ? (teachers.find(t => t.id === tid)?.full_name || sub.teacher_name || '') : '';
      return { ...sub, teacher_id: tid, teacher_name: tname };
    });

    const classTeacherSubject = classTeacherId
      ? subjectsWithOverrides.find(s => s.teacher_id === classTeacherId)
      : undefined;

    const { slots, errors, warnings } = generateTimetable(
      subjectsWithOverrides, periods, days, periodsPerWeek,
      otherSlots as TimetableSlot[],
      startTime, periodDuration, breakAfterPeriod,
      classTeacherId,
      classTeacherSubject?.id,
      specialSubjects,
    );

    setGenerateErrors(errors);
    setGenerateWarnings(warnings);
    if (errors.length === 0) {
      setPreview(slots);
    } else {
      setPreview([]);
    }
    setGenerating(false);
  };

  const handleApplyPreview = async () => {
    if (!preview.length) return;
    setApplyingPreview(true);
    const { data: yr } = await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle();
    await supabase.from('timetable').delete().eq('section_id', selectedSection);
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {isConfirmed ? (
                  <button onClick={handleResetDraft} disabled={confirming} style={{ padding: '8px 20px', borderRadius: '10px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
                    {confirming ? '...' : '✏️ Reset to Draft'}
                  </button>
                ) : (
                  <button onClick={handleConfirm} disabled={confirming} style={{ padding: '8px 20px', borderRadius: '10px', background: '#22C55E', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', boxShadow: '0 4px 14px rgba(34,197,94,0.4)' }}>
                    {confirming ? '...' : '🔒 Confirm Timetable'}
                  </button>
                )}
                <button onClick={handleClearTimetable} disabled={clearing}
                  title="Delete all periods for this section"
                  style={{ padding: '8px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.18)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.35)', fontWeight: 700, cursor: clearing ? 'not-allowed' : 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {clearing ? '⏳' : '🗑️'} {clearing ? 'Clearing...' : 'Clear'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section Selector ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <select value={selectedSection} onChange={e => { setSelectedSection(e.target.value); setPreview([]); setGenerateErrors([]); setGenerateWarnings([]); }}
          style={{ padding: '10px 16px', borderRadius: '12px', border: '1.5px solid #E2E8F0', fontSize: '0.9rem', fontWeight: 600, color: '#1E293B', background: '#fff', minWidth: '220px' }}>
          <option value="">Select Section...</option>
          {sections.map(s => <option key={s.id} value={s.id}>{s.class_name} — {s.name}</option>)}
        </select>
        {selectedSection && <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{slots.length} slot{slots.length !== 1 ? 's' : ''} scheduled</span>}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      {selectedSection && (
        <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', borderRadius: '14px', padding: '4px', width: 'fit-content' }}>
          {(['manual', 'auto', 'teacher'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 22px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', transition: 'all .2s',
                background: activeTab === tab ? '#fff' : 'transparent',
                color: activeTab === tab ? '#1E40AF' : '#64748B',
                boxShadow: activeTab === tab ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
              }}>
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
                          const isSpecialSlot = slot ? !!specialSubjects[slot.subject_id]?.isSpecial : false;
                          return (
                            <td key={day} style={{ padding: '4px' }}>
                              {slot ? (
                                <div onClick={() => { if (isConfirmed) return; setShowModal({ day, period }); setSlotForm({ subject_id: slot.subject_id, teacher_id: slot.teacher_id, start_time: slot.start_time, end_time: slot.end_time, room: slot.room || '' }); setConflict(''); }}
                                  style={{ padding: '8px 10px', borderRadius: '10px', background: SUBJECT_COLORS[ci], border: `1.5px solid ${SUBJECT_BORDER[ci]}`, minHeight: '64px', cursor: isConfirmed ? 'default' : 'pointer', position: 'relative', transition: 'box-shadow .15s' }}
                                  onMouseEnter={e => { if (!isConfirmed) (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}>
                                  <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', lineHeight: 1.3 }}>
                                    {isSpecialSlot && <span style={{ fontSize: '0.7rem', marginRight: 3 }}>⭐</span>}
                                    {slot.subject_name}
                                  </p>
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
                                <div onClick={() => { if (isConfirmed) return; setShowModal({ day, period }); setSlotForm({ subject_id: '', teacher_id: '', start_time: `${String(7 + period).padStart(2, '0')}:00`, end_time: `${String(7 + period).padStart(2, '0')}:45`, room: '' }); setConflict(''); }}
                                  style={{ minHeight: '64px', borderRadius: '10px', border: '2px dashed #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isConfirmed ? 'default' : 'pointer', color: '#CBD5E1', fontSize: '1.2rem', transition: 'all .15s' }}
                                  onMouseEnter={e => { if (!isConfirmed) { (e.currentTarget as HTMLElement).style.borderColor = '#93C5FD'; (e.currentTarget as HTMLElement).style.background = '#EFF6FF'; } }}
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
            <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '20px' }}>

              {/* ── Error / Warning Banners (full-width, spans both columns) ── */}
              {(generateErrors.length > 0 || generateWarnings.length > 0) && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '10px' }}>

                  {/* Error banner — blocks preview */}
                  {generateErrors.length > 0 && (
                    <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: '16px', padding: '18px 22px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '1.4rem' }}>❌</span>
                        <p style={{ fontWeight: 800, fontSize: '0.95rem', color: '#DC2626', margin: 0 }}>Cannot Generate Timetable</p>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {generateErrors.map((e, i) => (
                          <li key={i} style={{ fontSize: '0.85rem', color: '#B91C1C', lineHeight: 1.5 }}>{e}</li>
                        ))}
                      </ul>
                      <p style={{ fontSize: '0.78rem', color: '#B91C1C', marginTop: '12px', margin: '12px 0 0', fontWeight: 600 }}>
                        💡 Fix the issue above and click ⚡ Generate again.
                      </p>
                    </div>
                  )}

                  {/* Warning banner — generated but with caveats */}
                  {generateWarnings.length > 0 && (
                    <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: '16px', padding: '18px 22px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '1.4rem' }}>⚠️</span>
                        <p style={{ fontWeight: 800, fontSize: '0.95rem', color: '#D97706', margin: 0 }}>
                          {generateErrors.length > 0 ? 'Additional Warnings' : 'Generated with Issues'}
                        </p>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {generateWarnings.map((w, i) => (
                          <li key={i} style={{ fontSize: '0.85rem', color: '#92400E', lineHeight: 1.5 }}>{w}</li>
                        ))}
                      </ul>
                      {generateErrors.length === 0 && (
                        <p style={{ fontSize: '0.78rem', color: '#92400E', marginTop: '12px', margin: '12px 0 0', fontWeight: 600 }}>
                          📋 Review the preview carefully before applying.
                        </p>
                      )}
                    </div>
                  )}

                </div>
              )}

              {/* Config panel */}
              <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
                <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>⚙️ Generator Settings</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {[
                    { label: 'Periods / Day', value: periods, onChange: (v: string) => setPeriods(parseInt(v) || 8), type: 'number', min: 4, max: 12 },
                    { label: 'Days / Week', value: days, onChange: (v: string) => setDays(parseInt(v) || 6), type: 'number', min: 5, max: 6 },
                    { label: 'Start Time', value: startTime, onChange: setStartTime, type: 'time' },
                    { label: 'Period Duration (min)', value: periodDuration, onChange: (v: string) => setPeriodDuration(parseInt(v) || 45), type: 'number', min: 30, max: 90 },
                    { label: 'Break After Period', value: breakAfterPeriod, onChange: (v: string) => setBreakAfterPeriod(parseInt(v) || 4), type: 'number', min: 1, max: 8 },
                  ].map(f => (
                    <div key={f.label}>
                      <label style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '4px' }}>{f.label}</label>
                      <input type={f.type} value={f.value} onChange={e => (f.onChange as (v: string) => void)(e.target.value)}
                        min={(f as { min?: number }).min} max={(f as { max?: number }).max}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #E2E8F0', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                    </div>
                  ))}

                  <div>
                    {/* ── Header row with overflow badge ──────────────────── */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <label style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>📚 Subjects · Periods/Week · Teacher</label>
                      {(() => {
                        // Accurately compute available slots accounting for:
                        // - Period 1 reserved for class teacher (every day)
                        // - Next N periods reserved for starred subjects (non-CT)
                        const currentSec = sections.find(s => s.id === selectedSection);
                        const hasClassTeacher = !!currentSec?.class_teacher_id;
                        const ctTeacherId = currentSec?.class_teacher_id;
                        const ctSubjectId = ctTeacherId
                          ? currentSubjects.find(s => s.teacher_id === ctTeacherId)?.id
                          : undefined;
                        const starredNonCT = currentSubjects.filter(
                          s => specialSubjects[s.id]?.isSpecial && s.id !== ctSubjectId
                        ).length;
                        const reservedPerDay = (hasClassTeacher ? 1 : 0) + starredNonCT;
                        const totalAvailable = days * Math.max(0, periods - reservedPerDay);
                        // Count pool-needing periods: non-starred subjects, minus CT's pre-placed days
                        const regularSubs = currentSubjects.filter(s => !specialSubjects[s.id]?.isSpecial);
                        const total = regularSubs.reduce((acc, sub) => {
                          const w = periodsPerWeek[sub.id] ?? 0;
                          return acc + (sub.id === ctSubjectId ? Math.max(0, w - days) : w);
                        }, 0);
                        return total > totalAvailable
                          ? <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>⚠ {total} &gt; {totalAvailable} slots — overflow</span>
                          : <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>✓ {total} / {totalAvailable} slots</span>;
                      })()}
                    </div>

                    {/* ── Placement rule hint ──────────────────────────────── */}
                    {/* Shows: CT → P1 | ⭐ Starred → P2..Pk | Regular → rest  */}
                    {(() => {
                      const currentSec = sections.find(s => s.id === selectedSection);
                      const hasCT = !!currentSec?.class_teacher_id;
                      const ctTeacherId = currentSec?.class_teacher_id;
                      const ctSubjectId = ctTeacherId
                        ? currentSubjects.find(s => s.teacher_id === ctTeacherId)?.id
                        : undefined;
                      const starredNonCT = currentSubjects.filter(
                        s => specialSubjects[s.id]?.isSpecial && s.id !== ctSubjectId
                      );
                      if (!hasCT && starredNonCT.length === 0) return null;
                      const starredStart = hasCT ? 2 : 1;
                      const starredEnd = starredStart + starredNonCT.length - 1;
                      return (
                        <p style={{ margin: '0 0 6px', fontSize: '0.67rem', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', padding: '4px 8px', lineHeight: 1.5 }}>
                          {hasCT && <span>🏫 <strong>Period 1</strong> → Class Teacher (every day)</span>}
                          {hasCT && starredNonCT.length > 0 && <span> · </span>}
                          {starredNonCT.length > 0 && (
                            <span>⭐ Starred subjects fill <strong>periods {starredStart}{starredNonCT.length > 1 ? `–${starredEnd}` : ''}</strong> every day</span>
                          )}
                          <span> · Regular subjects fill the remaining periods</span>
                        </p>
                      );
                    })()}

                    {/* ── Column headers: Subject | P/W | Teacher | ⭐ | Pos ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 1fr 28px 44px', gap: '4px', marginBottom: '4px', padding: '0 2px' }}>
                      <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</span>
                      <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>P/W</span>
                      <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Teacher</span>
                      <span style={{ fontSize: '0.68rem', color: '#F59E0B', fontWeight: 700, textAlign: 'center' }} title="Mark as Priority — subject is pinned to early periods">⭐</span>
                      {/* "Pos" = preferred period position among priority subjects (1 = earliest) */}
                      <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}
                        title="Preferred period position among priority subjects — 1 = first morning slot">Pos</span>
                    </div>

                    {/* ── Per-subject rows ─────────────────────────────────── */}
                    {currentSubjects.map(sub => {
                      const sc = specialSubjects[sub.id];
                      const isSpecial = sc?.isSpecial ?? false;
                      const fixedPeriod = sc?.fixedPeriod ?? 1;
                      const val = periodsPerWeek[sub.id] ?? 0;
                      const maxPerWeek = days;
                      // For starred subjects, "over" means > days (can't exceed 1 per day)
                      const isOver = isSpecial ? val > days : val > days * (periods - 1);
                      const selectedTid = subjectTeacherOverrides[sub.id] || '';
                      return (
                        <div key={sub.id} style={{ display: 'grid', gridTemplateColumns: '1fr 44px 1fr 28px 44px', gap: '4px', marginBottom: '5px', alignItems: 'center', background: isSpecial ? '#FFFBEB' : 'transparent', borderRadius: isSpecial ? '8px' : 0, padding: isSpecial ? '4px 6px' : '0', border: isSpecial ? '1px solid #FDE68A' : 'none' }}>
                          <span style={{ fontSize: '0.75rem', color: isSpecial ? '#92400E' : '#334155', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isSpecial && <span style={{ marginRight: 3 }}>⭐</span>}
                            {sub.name}
                            {isOver && <span style={{ marginLeft: 4, fontSize: '0.6rem', color: '#D97706' }}>⚠</span>}
                          </span>
                          {/* P/W input — for starred: how many days/week this priority subject appears */}
                          <input type="number" min={1} max={isSpecial ? days : maxPerWeek * periods} value={val || (isSpecial ? days : 0)}
                            onChange={e => { const v = parseInt(e.target.value); setPeriodsPerWeek(p => ({ ...p, [sub.id]: isNaN(v) ? 0 : Math.min(v, isSpecial ? days : days * periods) })); }}
                            style={{ padding: '4px 4px', borderRadius: '8px', border: `1px solid ${isOver ? '#FCA5A5' : isSpecial ? '#FDE68A' : '#E2E8F0'}`, textAlign: 'center', fontSize: '0.78rem', background: isOver ? '#FEF2F2' : isSpecial ? '#FEF3C7' : 'white', width: '100%', boxSizing: 'border-box', fontWeight: isSpecial ? 700 : 400 }} />
                          {(() => {
                            // Only show teachers assigned to THIS subject in THIS section.
                            // Falls back to all teachers if no section-specific assignments exist.
                            const sectionAssignments = assignments.filter(
                              a => a.subject_id === sub.id && a.section_id === selectedSection
                            );
                            const eligibleTeachers = sectionAssignments.length > 0
                              ? teachers.filter(t => sectionAssignments.some(a => a.teacher_id === t.id))
                              : teachers;
                            const hasSectionFilter = sectionAssignments.length > 0;
                            return (
                              <select value={selectedTid}
                                onChange={e => setSubjectTeacherOverrides(o => ({ ...o, [sub.id]: e.target.value }))}
                                title={hasSectionFilter ? `Showing ${eligibleTeachers.length} assigned teacher(s) for this class` : 'No specific assignment found — showing all teachers'}
                                style={{ padding: '4px 6px', borderRadius: '8px', border: `1px solid ${hasSectionFilter ? '#BBF7D0' : '#E2E8F0'}`, fontSize: '0.72rem', width: '100%', background: hasSectionFilter ? '#F0FDF4' : 'white', color: selectedTid ? '#0F172A' : '#94A3B8' }}>
                                <option value="">-- No teacher --</option>
                                {eligibleTeachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                                {/* If current override is not in eligible list, show it anyway to avoid blank */}
                                {selectedTid && !eligibleTeachers.some(t => t.id === selectedTid) && (() => {
                                  const fallback = teachers.find(t => t.id === selectedTid);
                                  return fallback ? <option key={fallback.id} value={fallback.id}>{fallback.full_name} ⚠️</option> : null;
                                })()}
                              </select>
                            );
                          })()}
                          {/* Starred toggle */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <input type="checkbox" id={`special_${sub.id}`} checked={isSpecial}
                              onChange={e => {
                                const checked = e.target.checked;
                                // Auto-set P/W = days (every day) when first marked as priority
                                if (checked && !periodsPerWeek[sub.id]) {
                                  setPeriodsPerWeek(p => ({ ...p, [sub.id]: days }));
                                }
                                setSpecialSubjects(prev => ({ ...prev, [sub.id]: { isSpecial: checked, fixedPeriod: prev[sub.id]?.fixedPeriod ?? 1 } }));
                              }}
                              style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#F59E0B' }} />
                          </div>
                          {/* Pos input: preferred period position (1 = first morning slot, 2 = second, …) */}
                          <input type="number" min={1} max={periods} value={fixedPeriod} disabled={!isSpecial}
                            onChange={e => { const v = parseInt(e.target.value); setSpecialSubjects(prev => ({ ...prev, [sub.id]: { isSpecial: true, fixedPeriod: isNaN(v) ? 1 : Math.max(v, 1) } })); }}
                            title="Preferred period position among priority subjects — 1 = earliest morning slot"
                            style={{ padding: '4px 4px', borderRadius: '8px', border: `1px solid ${isSpecial ? '#FDE68A' : '#E2E8F0'}`, textAlign: 'center', fontSize: '0.78rem', background: isSpecial ? '#FEF3C7' : '#F8FAFC', width: '100%', boxSizing: 'border-box', fontWeight: isSpecial ? 700 : 400, opacity: isSpecial ? 1 : 0.35 }} />
                        </div>
                      );
                    })}
                  </div>

                  <button onClick={handleAutoGenerate} disabled={generating}
                    style={{ padding: '12px', borderRadius: '12px', background: 'linear-gradient(135deg,#1E40AF,#7C3AED)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                    {generating ? '⏳ Generating...' : '⚡ Generate Timetable'}
                  </button>
                </div>
              </div>

              {/* Preview grid */}
              <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>Preview</h3>
                    {preview.length > 0 && (
                      <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                        📋 Class teacher in <strong>period 1</strong> · Starred subjects next · Regular subjects fill the rest
                      </p>
                    )}
                  </div>
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
                        {Array.from({ length: periods }, (_, p) => p + 1).map(period => {
                          // Draw a divider after the last reserved row (CT + starred)
                          const isLastReservedRow = (() => {
                            const currentSec = sections.find(s => s.id === selectedSection);
                            const hasCT = !!currentSec?.class_teacher_id;
                            const ctTeacherId = currentSec?.class_teacher_id;
                            const ctSubjectId = ctTeacherId
                              ? currentSubjects.find(s => s.teacher_id === ctTeacherId)?.id
                              : undefined;
                            const starredNonCT = currentSubjects.filter(
                              s => specialSubjects[s.id]?.isSpecial && s.id !== ctSubjectId
                            ).length;
                            const totalReserved = (hasCT ? 1 : 0) + starredNonCT;
                            return totalReserved > 0 && period === totalReserved;
                          })();
                          return (
                            <tr key={period} style={{ borderTop: isLastReservedRow ? '3px solid #FDE68A' : '1px solid #F1F5F9' }}>
                              <td style={{ padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#94A3B8' }}>P{period}</td>
                              {Array.from({ length: days }, (_, di) => di + 1).map(day => {
                                const ps = getPreviewSlot(day, period);
                                const ci = ps ? (subjectColorMap[ps.subject_id] ?? 0) : 0;
                                const isPsSpecial = ps ? !!specialSubjects[ps.subject_id]?.isSpecial : false;
                                return (
                                  <td key={day} style={{ padding: '4px' }}>
                                    {ps ? (
                                      <div style={{ padding: '6px 8px', borderRadius: '8px', background: isPsSpecial ? '#FFFBEB' : SUBJECT_COLORS[ci], border: `1.5px solid ${isPsSpecial ? '#FDE68A' : SUBJECT_BORDER[ci]}`, minHeight: '56px' }}>
                                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#1E293B' }}>
                                          {isPsSpecial && <span style={{ fontSize: '0.7rem', marginRight: 3 }}>⭐</span>}
                                          {ps.subject_name}
                                        </p>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: '#475569' }}>{ps.teacher_name}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.62rem', color: '#94A3B8' }}>{ps.start_time}–{ps.end_time}</p>
                                      </div>
                                    ) : <div style={{ minHeight: '56px', borderRadius: '8px', background: '#F8FAFC' }} />}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
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
                      {Array.from({ length: periods }, (_, p) => p + 1).map(period => (
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
                {(() => {
                  // Only show teachers assigned to the selected subject in this section.
                  // Falls back to all teachers if no section-specific assignments exist or no subject is selected.
                  const sectionAssignments = assignments.filter(
                    a => a.subject_id === slotForm.subject_id && a.section_id === selectedSection
                  );
                  const eligibleTeachers = sectionAssignments.length > 0
                    ? teachers.filter(t => sectionAssignments.some(a => a.teacher_id === t.id))
                    : teachers;
                  const hasSectionFilter = sectionAssignments.length > 0 && !!slotForm.subject_id;
                  return (
                    <select value={slotForm.teacher_id} onChange={e => { setSlotForm(f => ({ ...f, teacher_id: e.target.value })); checkConflict(e.target.value, showModal.day, showModal.period); }}
                      title={hasSectionFilter ? `Showing ${eligibleTeachers.length} assigned teacher(s) for this class` : 'No specific assignment found — showing all teachers'}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: `1.5px solid ${conflict ? '#FCA5A5' : hasSectionFilter ? '#BBF7D0' : '#E2E8F0'}`, fontSize: '0.9rem', boxSizing: 'border-box', background: hasSectionFilter ? '#F0FDF4' : 'white', color: slotForm.teacher_id ? '#0F172A' : '#94A3B8' }}>
                      <option value="">Select teacher...</option>
                      {eligibleTeachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                      {/* If current selection is not in eligible list, show it anyway to avoid blank */}
                      {slotForm.teacher_id && !eligibleTeachers.some(t => t.id === slotForm.teacher_id) && (() => {
                        const fallback = teachers.find(t => t.id === slotForm.teacher_id);
                        return fallback ? <option key={fallback.id} value={fallback.id}>{fallback.full_name} ⚠️</option> : null;
                      })()}
                    </select>
                  );
                })()}
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