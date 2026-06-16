// ─────────────────────────────────────────────────────────────────────────────
// Student Performance Analysis Engine
// Pure rule-based logic — NO machine learning, NO LLM calls.
// Modular design to allow future ML integration as a drop-in replacement.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  RawMarkRecord,
  SubjectInput,
  SubjectAnalysis,
  StudentAnalysis,
  PerformanceCategory,
  TrendCategory,
  ToughnessLevel,
  AnalysisJSON,
} from './types';
import {
  PERFORMANCE_REMARKS,
  TREND_REMARKS,
  TOUGHNESS_POSITIVE,
  TOUGHNESS_NEGATIVE,
  OVERALL_OPENING,
} from './templates';

// ── Toughness Mapping ────────────────────────────────────────────────────────
// Derived from exam_type since DB has no explicit toughness_level column.
// Easily configurable — just update this map.
const EXAM_TYPE_TOUGHNESS: Record<string, ToughnessLevel> = {
  unit_test: 1,
  class_test: 2,
  quiz: 2,
  midterm: 3,
  mid_term: 3,
  half_yearly: 3,
  terminal: 4,
  quarterly: 3,
  pre_board: 4,
  annual: 5,
  board: 5,
  final: 5,
};

// ── Utility ──────────────────────────────────────────────────────────────────

/** Simple hash of a string → number (for deterministic remark selection) */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Pick a remark sentence deterministically by subject name so it's stable */
function pickRemark(arr: string[], seed: string): string {
  return arr[hashStr(seed) % arr.length];
}

// ── Core Calculations ────────────────────────────────────────────────────────

export function calculatePercentage(marks: number, maxMarks: number): number {
  if (maxMarks <= 0) return 0;
  return Math.round((marks / maxMarks) * 1000) / 10; // 1 decimal
}

export function getToughnessLevel(examType: string): ToughnessLevel {
  const key = (examType || '').toLowerCase().replace(/\s+/g, '_');
  return EXAM_TYPE_TOUGHNESS[key] ?? 3; // default: Moderate
}

export function determineCategory(percentage: number): PerformanceCategory {
  if (percentage >= 90) return 'Excellent';
  if (percentage >= 75) return 'Good';
  if (percentage >= 60) return 'Average';
  if (percentage >= 40) return 'Needs Improvement';
  return 'Very Weak';
}

export function determineTrend(
  currentMarks: number,
  currentMaxMarks: number,
  previousMarks: number[],
  previousMaxMarks: number[]
): TrendCategory | 'No Previous Data' {
  if (previousMarks.length === 0) return 'No Previous Data';

  // Compare percentages (normalised) for fair trend analysis
  const currentPct = calculatePercentage(currentMarks, currentMaxMarks);
  const prevPcts = previousMarks.map((m, i) =>
    calculatePercentage(m, previousMaxMarks[i] || currentMaxMarks)
  );
  const avgPrevPct = prevPcts.reduce((a, b) => a + b, 0) / prevPcts.length;
  const improvement = currentPct - avgPrevPct;

  if (improvement > 10) return 'Significant Improvement';
  if (improvement > 0) return 'Gradual Improvement';
  if (improvement === 0) return 'Consistent Performance';
  return 'Declining Performance';
}

// ── Remark Generation ────────────────────────────────────────────────────────

export function generateSubjectRemark(
  category: PerformanceCategory,
  trend: TrendCategory | 'No Previous Data',
  toughness: ToughnessLevel,
  percentage: number,
  subjectName: string
): string {
  const parts: string[] = [];

  // 1. Performance remark (deterministic per subject name)
  parts.push(pickRemark(PERFORMANCE_REMARKS[category], subjectName));

  // 2. Trend remark (skip if no previous data)
  if (trend !== 'No Previous Data') {
    parts.push(TREND_REMARKS[trend as TrendCategory]);
  }

  // 3. Toughness modifier
  if (toughness >= 4 && percentage >= 70) {
    parts.push(TOUGHNESS_POSITIVE);
  } else if (toughness >= 4 && percentage < 50) {
    parts.push(TOUGHNESS_NEGATIVE);
  }

  return parts.join(' ');
}

// ── Subject Analysis ─────────────────────────────────────────────────────────

export function analyzeSubject(input: SubjectInput): SubjectAnalysis {
  const percentage = calculatePercentage(input.currentMark, input.currentMaxMark);
  const category = determineCategory(percentage);
  const toughnessLevel = getToughnessLevel(input.currentExamType);
  const trend = determineTrend(
    input.currentMark,
    input.currentMaxMark,
    input.previousMarks,
    input.previousMaxMarks
  );

  // Previous average as percentage
  let previousAverage: number | null = null;
  if (input.previousMarks.length > 0) {
    const prevPcts = input.previousMarks.map((m, i) =>
      calculatePercentage(m, input.previousMaxMarks[i] || input.currentMaxMark)
    );
    previousAverage = Math.round((prevPcts.reduce((a, b) => a + b, 0) / prevPcts.length) * 10) / 10;
  }

  // Improvement in percentage points
  const improvement = previousAverage !== null ? Math.round((percentage - previousAverage) * 10) / 10 : null;

  const remark = generateSubjectRemark(
    category,
    trend,
    toughnessLevel,
    percentage,
    input.subjectName
  );

  return {
    subjectId: input.subjectId,
    subject: input.subjectName,
    currentMark: input.currentMark,
    currentMaxMark: input.currentMaxMark,
    percentage,
    previousAverage,
    improvement,
    category,
    trend,
    toughnessLevel,
    remark,
  };
}

// ── Overall Summary Generation ────────────────────────────────────────────────

export function generateOverallSummary(
  studentName: string,
  subjects: SubjectAnalysis[],
  overallCategory: PerformanceCategory
): string {
  if (subjects.length === 0) return 'Insufficient data to generate a summary.';

  const sorted = [...subjects].sort((a, b) => b.percentage - a.percentage);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const improving = subjects.filter(
    (s) => s.trend === 'Significant Improvement' || s.trend === 'Gradual Improvement'
  );
  const declining = subjects.filter((s) => s.trend === 'Declining Performance');

  const sentences: string[] = [];

  // Opening based on overall category
  sentences.push(OVERALL_OPENING[overallCategory]);

  // Best/Worst subject callout
  if (subjects.length > 1) {
    sentences.push(
      `Strong performance is observed in ${best.subject}` +
        (best.percentage >= 75 ? `, where the student scored ${best.percentage}%.` : '.')
    );
    if (worst.percentage < 60) {
      sentences.push(
        `Continued effort and focused practice are recommended in ${worst.subject} to raise performance to the expected level.`
      );
    }
  }

  // Trend commentary
  if (improving.length > 0) {
    const names = improving.map((s) => s.subject).join(', ');
    sentences.push(
      `Recent assessments indicate a positive upward trend in ${names}, reflecting commendable hard work.`
    );
  }
  if (declining.length > 0) {
    const names = declining.map((s) => s.subject).join(', ');
    sentences.push(
      `Attention is needed in ${names}, where performance has shown a declining trend compared to previous assessments.`
    );
  }

  // Closing advice
  if (overallCategory === 'Excellent') {
    sentences.push(
      'The student is encouraged to maintain this exceptional standard and continue pursuing academic excellence.'
    );
  } else if (overallCategory === 'Good') {
    sentences.push(
      'Regular revision and targeted effort on weaker areas will further strengthen the student\'s academic profile.'
    );
  } else {
    sentences.push(
      'Regular revision, focused attention on weaker areas, and consistent study habits will be instrumental in achieving better academic outcomes.'
    );
  }

  return sentences.join(' ');
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Groups raw marks by subject, picks the most recent exam as "current",
 * uses all older marks as "previous", and runs the full analysis.
 */
export function analyzeStudent(
  studentName: string,
  className: string,
  sectionName: string,
  rawMarks: RawMarkRecord[]
): StudentAnalysis {
  // Filter out absent records and nulls
  const validMarks = rawMarks.filter(
    (m) => !m.is_absent && m.marks_obtained !== null
  ) as (RawMarkRecord & { marks_obtained: number })[];

  // Group by subject
  const bySubject = new Map<string, typeof validMarks>();
  for (const m of validMarks) {
    const key = m.subject_id;
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key)!.push(m);
  }

  const subjectAnalyses: SubjectAnalysis[] = [];

  bySubject.forEach((marks, _subjectId) => {
    // Sort by exam_date descending — most recent first
    const sorted = [...marks].sort(
      (a, b) => new Date(b.exam_date).getTime() - new Date(a.exam_date).getTime()
    );

    const current = sorted[0];
    const previous = sorted.slice(1);

    const input: SubjectInput = {
      subjectId: current.subject_id,
      subjectName: current.subject_name,
      currentMark: current.marks_obtained,
      currentMaxMark: current.total_marks,
      currentExamType: current.exam_type,
      previousMarks: previous.map((p) => p.marks_obtained),
      previousMaxMarks: previous.map((p) => p.total_marks),
    };

    subjectAnalyses.push(analyzeSubject(input));
  });

  // Sort subjects by percentage desc, assign ranks
  subjectAnalyses.sort((a, b) => b.percentage - a.percentage);
  subjectAnalyses.forEach((s, i) => (s.rank = i + 1));

  // Overall stats
  const overallPercentage =
    subjectAnalyses.length > 0
      ? Math.round(
          (subjectAnalyses.reduce((sum, s) => sum + s.percentage, 0) /
            subjectAnalyses.length) *
            10
        ) / 10
      : 0;

  const overallCategory = determineCategory(overallPercentage);
  const bestSubject = subjectAnalyses[0]?.subject ?? '—';
  const weakestSubject = subjectAnalyses[subjectAnalyses.length - 1]?.subject ?? '—';
  const improvingSubjectsCount = subjectAnalyses.filter(
    (s) => s.trend === 'Significant Improvement' || s.trend === 'Gradual Improvement'
  ).length;
  const decliningSubjectsCount = subjectAnalyses.filter(
    (s) => s.trend === 'Declining Performance'
  ).length;

  const overallSummary = generateOverallSummary(
    studentName,
    subjectAnalyses,
    overallCategory
  );

  return {
    studentName,
    className,
    sectionName,
    overallPercentage,
    bestSubject,
    weakestSubject,
    improvingSubjectsCount,
    decliningSubjectsCount,
    overallSummary,
    overallCategory,
    subjects: subjectAnalyses,
  };
}

/** Convert StudentAnalysis to the required JSON output format */
export function toAnalysisJSON(analysis: StudentAnalysis): AnalysisJSON {
  return {
    student_name: analysis.studentName,
    overall_percentage: analysis.overallPercentage,
    best_subject: analysis.bestSubject,
    weakest_subject: analysis.weakestSubject,
    overall_summary: analysis.overallSummary,
    subjects: analysis.subjects.map((s) => ({
      subject: s.subject,
      percentage: s.percentage,
      trend: s.trend,
      category: s.category,
      remark: s.remark,
    })),
  };
}
