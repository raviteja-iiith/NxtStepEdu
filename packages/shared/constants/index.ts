// ============================================================
// CONSTANTS — School ERP Management System
// Enums, labels, and configuration constants
// ============================================================

export const ROLES = {
  ADMIN: 'admin',
  PRINCIPAL: 'principal',
  TEACHER: 'teacher',
  PARENT: 'parent',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Super Admin',
  principal: 'Principal',
  teacher: 'Teacher',
  parent: 'Parent',
};

export const ROLE_ICONS: Record<string, string> = {
  principal: '🏫',
  teacher: '👨‍🏫',
  parent: '👨‍👩‍👧',
};

export const SUBSCRIPTION_PLANS = {
  BASIC: 'basic',
  STANDARD: 'standard',
  PREMIUM: 'premium',
} as const;

export const SUBSCRIPTION_PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
};

export const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  EXCUSED: 'excused',
} as const;

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
};

export const ATTENDANCE_STATUS_COLORS: Record<string, string> = {
  present: '#16A34A',
  absent: '#DC2626',
  late: '#D97706',
  excused: '#3B82F6',
};

export const FEE_TYPES = {
  TUITION: 'tuition',
  TRANSPORT: 'transport',
  HOSTEL: 'hostel',
  EXAMINATION: 'examination',
  ACTIVITY: 'activity',
  LIBRARY: 'library',
  UNIFORM: 'uniform',
  MISCELLANEOUS: 'miscellaneous',
} as const;

export const FEE_TYPE_LABELS: Record<string, string> = {
  tuition: 'Tuition',
  transport: 'Transport',
  hostel: 'Hostel',
  examination: 'Examination',
  activity: 'Activity',
  library: 'Library',
  uniform: 'Uniform',
  miscellaneous: 'Miscellaneous',
};

export const FEE_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  OVERDUE: 'overdue',
  PARTIALLY_PAID: 'partially_paid',
  WAIVED: 'waived',
} as const;

export const FEE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  overdue: 'Overdue',
  partially_paid: 'Partially Paid',
  waived: 'Waived',
};

export const EXAM_TYPES = {
  UNIT_TEST: 'unit_test',
  MID_TERM: 'mid_term',
  FINAL: 'final',
  PRACTICAL: 'practical',
  INTERNAL: 'internal',
} as const;

export const EXAM_TYPE_LABELS: Record<string, string> = {
  unit_test: 'Unit Test',
  mid_term: 'Mid Term',
  final: 'Final Exam',
  practical: 'Practical',
  internal: 'Internal',
};

export const LEAVE_TYPES = {
  SICK: 'sick',
  CASUAL: 'casual',
  EARNED: 'earned',
  EMERGENCY: 'emergency',
  MATERNITY: 'maternity',
  PATERNITY: 'paternity',
  OTHER: 'other',
} as const;

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: 'Sick Leave',
  casual: 'Casual Leave',
  earned: 'Earned Leave',
  emergency: 'Emergency Leave',
  maternity: 'Maternity Leave',
  paternity: 'Paternity Leave',
  other: 'Other',
};

export const DOCUMENT_TYPES = {
  BONAFIDE: 'bonafide',
  TRANSFER_CERTIFICATE: 'transfer_certificate',
  CHARACTER_CERTIFICATE: 'character_certificate',
  MIGRATION_CERTIFICATE: 'migration_certificate',
  PROVISIONAL_CERTIFICATE: 'provisional_certificate',
} as const;

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  bonafide: 'Bonafide Certificate',
  transfer_certificate: 'Transfer Certificate',
  character_certificate: 'Character Certificate',
  migration_certificate: 'Migration Certificate',
  provisional_certificate: 'Provisional Certificate',
};

export const DAYS_OF_WEEK: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const RELATIONSHIPS = ['father', 'mother', 'guardian', 'other'] as const;

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;
export const DEBOUNCE_DELAY_MS = 300;
export const TEMP_PASSWORD_LENGTH = 8;
export const TEMP_PIN_LENGTH = 6;
export const MAX_FILE_SIZE_MB = 10;
export const MAX_PROFILE_PHOTO_SIZE_MB = 2;
export const PAGINATION_DEFAULT_SIZE = 50;
export const SIGNED_URL_EXPIRY_HOURS = 1;
