// ─────────────────────────────────────────────────────────────────────────────
// Remark Templates — Fully customizable, pure data (no logic)
// Each category has multiple sentences. The engine picks one per slot
// deterministically (based on subject name hash) so the same student always
// gets the same remarks, but different subjects get different sentences.
// ─────────────────────────────────────────────────────────────────────────────

import type { PerformanceCategory, TrendCategory } from './types';

export const PERFORMANCE_REMARKS: Record<PerformanceCategory, string[]> = {
  'Excellent': [
    'Demonstrates an exceptional understanding of core concepts with outstanding precision.',
    'Consistently performs at the highest academic standard, showcasing deep subject mastery.',
    'Shows remarkable analytical ability and a strong grasp of advanced topics.',
    'Exhibits outstanding academic discipline and thorough preparation.',
    'Performance is commendable and reflects a high degree of intellectual engagement.',
  ],
  'Good': [
    'Shows a good understanding of the subject with reliable academic performance.',
    'Performs well with steady and positive academic progress throughout.',
    'Demonstrates a commendable learning attitude and solid conceptual clarity.',
    'Exhibits good subject knowledge and consistent effort in preparation.',
    'Performance reflects a well-rounded understanding of fundamental concepts.',
  ],
  'Average': [
    'Has a basic understanding of key concepts with room for further improvement.',
    'Can significantly improve with regular practice and focused revision sessions.',
    'Shows potential for better performance with structured academic support.',
    'Demonstrates a foundational grasp of the subject; deeper study is recommended.',
    'Performance is satisfactory, but greater consistency will yield stronger results.',
  ],
  'Needs Improvement': [
    'Requires additional practice and targeted guidance to strengthen academic performance.',
    'Needs to focus on reinforcing core concepts through regular revision and exercises.',
    'Should prioritize systematic study and seek clarification on challenging topics.',
    'Conceptual gaps are evident and need to be addressed through dedicated effort.',
    'Consistent effort and structured support will be essential to improve outcomes.',
  ],
  'Very Weak': [
    'Significant academic intervention and personalized support are strongly recommended.',
    'Needs focused and sustained attention to bridge critical learning gaps.',
    'Should work on improving study habits, concept clarity, and revision frequency.',
    'Immediate remedial action and close monitoring are advised for better outcomes.',
    'A structured remediation plan and regular teacher interaction will be highly beneficial.',
  ],
};

export const TREND_REMARKS: Record<TrendCategory, string> = {
  'Significant Improvement':
    'Notably, there has been a remarkable improvement compared to previous assessments, reflecting excellent dedication and hard work.',
  'Gradual Improvement':
    'A positive upward trend is observed when compared to previous performances, indicating steady and encouraging progress.',
  'Consistent Performance':
    'Performance has remained consistent with prior assessments, demonstrating stability in academic effort.',
  'Declining Performance':
    'A decline is noted compared to previous assessments. Focused attention and revised study strategies are recommended.',
};

export const TOUGHNESS_POSITIVE =
  'Notably, the student performed commendably despite the elevated difficulty level of this examination — a testament to strong preparation.';

export const TOUGHNESS_NEGATIVE =
  'It is worth noting that the heightened difficulty of this examination may have been a contributing factor to the current score.';

export const OVERALL_OPENING: Record<PerformanceCategory, string> = {
  'Excellent':
    'The student demonstrates outstanding academic achievement overall, reflecting exceptional dedication and intellectual capability.',
  'Good':
    'The student demonstrates a strong and commendable level of academic performance overall, with consistent positive progress.',
  'Average':
    'The student demonstrates a satisfactory level of academic performance overall, with clear potential for further growth.',
  'Needs Improvement':
    'The student\'s overall academic performance requires greater attention and consistent effort to reach the expected standard.',
  'Very Weak':
    'The student\'s overall academic performance is significantly below the expected level and requires immediate and structured intervention.',
};
