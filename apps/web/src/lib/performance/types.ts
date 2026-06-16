// ─────────────────────────────────────────────────────────────────────────────
// Student Performance Analysis Engine — Type Definitions
// Pure rule-based engine, no ML/AI dependencies.
// ─────────────────────────────────────────────────────────────────────────────

export type PerformanceCategory =
  | 'Excellent'
  | 'Good'
  | 'Average'
  | 'Needs Improvement'
  | 'Very Weak';

export type TrendCategory =
  | 'Significant Improvement'
  | 'Gradual Improvement'
  | 'Consistent Performance'
  | 'Declining Performance';

export type ToughnessLevel = 1 | 2 | 3 | 4 | 5;

// ── Input ──────────────────────────────────────────────────────────────────

/** Raw mark record fetched from DB for a single exam */
export interface RawMarkRecord {
  marks_obtained: number | null;
  is_absent: boolean;
  exam_id: string;
  exam_name: string;
  exam_type: string;   // unit_test | class_test | midterm | terminal | annual | board
  exam_date: string;
  total_marks: number;
  subject_id: string;
  subject_name: string;
}

/** Aggregated input per subject for the engine */
export interface SubjectInput {
  subjectId: string;
  subjectName: string;
  currentMark: number;          // most recent exam mark
  currentMaxMark: number;
  currentExamType: string;
  previousMarks: number[];      // all prior exam marks (same subject, excluding current)
  previousMaxMarks: number[];   // matching max marks for previous exams
}

// ── Output ─────────────────────────────────────────────────────────────────

export interface SubjectAnalysis {
  subjectId: string;
  subject: string;
  currentMark: number;
  currentMaxMark: number;
  percentage: number;                // (currentMark / currentMaxMark) * 100
  previousAverage: number | null;    // average of previous marks (percentage)
  improvement: number | null;        // currentMark - avg(previousMarks) in absolute marks
  category: PerformanceCategory;
  trend: TrendCategory | 'No Previous Data';
  toughnessLevel: ToughnessLevel;
  remark: string;                    // full generated paragraph
  rank?: number;                     // assigned after sorting all subjects
}

export interface StudentAnalysis {
  studentName: string;
  className: string;
  sectionName: string;
  overallPercentage: number;
  bestSubject: string;
  weakestSubject: string;
  improvingSubjectsCount: number;
  decliningSubjectsCount: number;
  overallSummary: string;
  overallCategory: PerformanceCategory;
  subjects: SubjectAnalysis[];
}

/** JSON output shape as specified in requirements */
export interface AnalysisJSON {
  student_name: string;
  overall_percentage: number;
  best_subject: string;
  weakest_subject: string;
  overall_summary: string;
  subjects: Array<{
    subject: string;
    percentage: number;
    trend: string;
    category: string;
    remark: string;
  }>;
}
