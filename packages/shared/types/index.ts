// ============================================================
// CORE TYPES — School ERP Management System
// Maps directly to Supabase database schema
// ============================================================

// === ENUMS ===

export type UserRole = 'admin' | 'principal' | 'teacher' | 'parent';

export type SubscriptionPlan = 'basic' | 'standard' | 'premium';

export type Gender = 'male' | 'female' | 'other';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export type FeeType = 'tuition' | 'transport' | 'hostel' | 'examination' | 'activity' | 'library' | 'uniform' | 'miscellaneous';

export type FeeStatus = 'pending' | 'paid' | 'overdue' | 'partially_paid' | 'waived';

export type PaymentMode = 'online' | 'cash' | 'cheque' | 'bank_transfer' | 'dd';

export type RecurringInterval = 'monthly' | 'quarterly' | 'annual';

export type ExamType = 'unit_test' | 'mid_term' | 'final' | 'practical' | 'internal';

export type AssignmentSubmissionStatus = 'submitted' | 'late' | 'graded' | 'returned';

export type LeaveType = 'sick' | 'casual' | 'earned' | 'emergency' | 'maternity' | 'paternity' | 'other';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type DocumentType = 'bonafide' | 'transfer_certificate' | 'character_certificate' | 'migration_certificate' | 'provisional_certificate';

export type DocumentRequestStatus = 'pending' | 'processing' | 'ready' | 'delivered' | 'rejected';

export type MeetingStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';

export type TargetAudience = 'all' | 'teachers' | 'parents' | 'class' | 'section';

export type HolidayType = 'national' | 'regional' | 'school' | 'other';

export type RemarkType = 'behavior' | 'academic' | 'achievement' | 'concern';

export type ResourceType = 'notes' | 'video' | 'worksheet' | 'presentation' | 'link' | 'image';

export type LessonPlanStatus = 'planned' | 'in_progress' | 'completed' | 'pending_review';

export type EventType = 'holiday' | 'exam' | 'sports' | 'cultural' | 'meeting' | 'ptm' | 'other';

export type NotificationType = 'attendance' | 'fee' | 'assignment' | 'exam' | 'general' | 'announcement';

export type PaymentStatus = 'pending' | 'paid';

// === CORE ENTITIES ===

export interface School {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  is_active: boolean;
  subscription_plan: SubscriptionPlan;
  subscription_start: string | null;
  subscription_end: string | null;
  razorpay_key_id: string | null;
  razorpay_key_secret: string | null;
  sms_enabled: boolean;
  ai_enabled: boolean;
  created_at: string;
  created_by: string | null;
}

export interface User {
  id: string;
  school_id: string | null;
  role: UserRole;
  username: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  is_active: boolean;
  is_first_login: boolean;
  created_by: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface PrincipalProfile {
  id: string;
  user_id: string;
  school_id: string;
  employee_id: string | null;
  qualification: string | null;
  joining_date: string | null;
  created_at: string;
}

export interface TeacherProfile {
  id: string;
  user_id: string;
  school_id: string;
  employee_id: string | null;
  qualification: string | null;
  specialization: string | null;
  joining_date: string | null;
  created_at: string;
}

export interface ParentProfile {
  id: string;
  user_id: string;
  school_id: string;
  occupation: string | null;
  address: string | null;
  emergency_contact: string | null;
  created_at: string;
}

// === ACADEMIC STRUCTURE ===

export interface AcademicYear {
  id: string;
  school_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  created_at: string;
}

export interface Class {
  id: string;
  school_id: string;
  name: string;
  numeric_order: number | null;
  academic_year_id: string;
  created_at: string;
}

export interface Section {
  id: string;
  school_id: string;
  class_id: string;
  name: string;
  class_teacher_id: string | null;
  max_students: number;
  academic_year_id: string;
  created_at: string;
}

export interface Subject {
  id: string;
  school_id: string;
  class_id: string;
  name: string;
  code: string | null;
  teacher_id: string | null;
  academic_year_id: string;
  created_at: string;
}

export interface TeacherSectionAssignment {
  id: string;
  school_id: string;
  teacher_id: string;
  section_id: string;
  subject_id: string;
  academic_year_id: string;
  created_at: string;
}

// === STUDENTS ===

export interface Student {
  id: string;
  school_id: string;
  admission_number: string | null;
  full_name: string;
  date_of_birth: string | null;
  gender: Gender | null;
  blood_group: string | null;
  photo_url: string | null;
  class_id: string;
  section_id: string;
  roll_number: number | null;
  academic_year_id: string;
  address: string | null;
  is_active: boolean;
  admission_date: string;
  created_by: string | null;
  created_at: string;
}

export interface StudentParentLink {
  id: string;
  student_id: string;
  parent_id: string;
  relationship: 'father' | 'mother' | 'guardian' | 'other';
  is_primary_contact: boolean;
  created_by: string | null;
  created_at: string;
}

// === TIMETABLE ===

export interface TimetableEntry {
  id: string;
  school_id: string;
  section_id: string;
  subject_id: string;
  teacher_id: string;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  room: string | null;
  academic_year_id: string;
  created_at: string;
}

// === ATTENDANCE ===

export interface Attendance {
  id: string;
  school_id: string;
  student_id: string;
  section_id: string;
  date: string;
  status: AttendanceStatus;
  marked_by: string;
  marked_at: string;
  remarks: string | null;
}

export interface Holiday {
  id: string;
  school_id: string;
  name: string;
  date: string;
  holiday_type: HolidayType;
  academic_year_id: string;
  created_at: string;
}

// === ASSIGNMENTS ===

export interface Assignment {
  id: string;
  school_id: string;
  teacher_id: string;
  subject_id: string;
  section_id: string;
  title: string;
  description: string | null;
  deadline: string;
  max_marks: number | null;
  attachments: FileAttachment[];
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  submitted_at: string;
  attachments: FileAttachment[];
  marks_obtained: number | null;
  remarks: string | null;
  status: AssignmentSubmissionStatus;
  graded_by: string | null;
  graded_at: string | null;
}

// === EXAMINATIONS ===

export interface Exam {
  id: string;
  school_id: string;
  name: string;
  exam_type: ExamType;
  class_id: string;
  section_id: string | null;
  subject_id: string;
  exam_date: string;
  start_time: string | null;
  duration_minutes: number | null;
  total_marks: number;
  passing_marks: number | null;
  academic_year_id: string;
  is_published: boolean;
  created_by: string;
  created_at: string;
}

export interface Mark {
  id: string;
  exam_id: string;
  student_id: string;
  school_id: string;
  marks_obtained: number | null;
  is_absent: boolean;
  remarks: string | null;
  entered_by: string;
  entered_at: string;
}

export interface ReportCard {
  id: string;
  student_id: string;
  school_id: string;
  academic_year_id: string;
  exam_group: string | null;
  generated_at: string;
  generated_by: string;
  ai_summary: string | null;
  download_url: string | null;
  is_published: boolean;
}

// === FEE MANAGEMENT ===

export interface FeeStructure {
  id: string;
  school_id: string;
  class_id: string | null;
  fee_type: FeeType;
  name: string;
  amount: number;
  due_date: string | null;
  academic_year_id: string;
  is_recurring: boolean;
  recurring_interval: RecurringInterval | null;
  created_by: string;
  created_at: string;
}

export interface Fee {
  id: string;
  student_id: string;
  school_id: string;
  fee_structure_id: string;
  amount: number;
  discount_amount: number;
  discount_reason: string | null;
  due_date: string;
  status: FeeStatus;
  academic_year_id: string;
  late_fee_applied: number;
  created_at: string;
}

export interface FeePayment {
  id: string;
  fee_id: string;
  student_id: string;
  school_id: string;
  amount_paid: number;
  payment_date: string;
  payment_mode: PaymentMode;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  receipt_number: string;
  collected_by: string | null;
  notes: string | null;
  created_at: string;
}

// === COMMUNICATION ===

export interface Message {
  id: string;
  school_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  attachments: FileAttachment[];
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  school_id: string;
  title: string;
  content: string;
  target_audience: TargetAudience;
  target_class_id: string | null;
  target_section_id: string | null;
  is_urgent: boolean;
  created_by: string;
  created_at: string;
  expires_at: string | null;
}

export interface MeetingRequest {
  id: string;
  school_id: string;
  parent_id: string;
  teacher_id: string;
  student_id: string;
  reason: string;
  proposed_date_1: string | null;
  proposed_time_1: string | null;
  proposed_date_2: string | null;
  proposed_time_2: string | null;
  confirmed_date: string | null;
  confirmed_time: string | null;
  status: MeetingStatus;
  meeting_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
}

// === TEACHER OPERATIONS ===

export interface LessonPlan {
  id: string;
  school_id: string;
  teacher_id: string;
  subject_id: string;
  section_id: string;
  week_start_date: string;
  topics: string;
  learning_objectives: string | null;
  resources_used: string | null;
  homework_given: string | null;
  status: LessonPlanStatus;
  principal_remarks: string | null;
  academic_year_id: string;
  created_at: string;
}

export interface Resource {
  id: string;
  school_id: string;
  teacher_id: string;
  subject_id: string;
  section_id: string;
  title: string;
  description: string | null;
  resource_type: ResourceType;
  file_url: string | null;
  external_link: string | null;
  is_published: boolean;
  created_at: string;
}

export interface StudentRemark {
  id: string;
  school_id: string;
  student_id: string;
  teacher_id: string;
  remark_type: RemarkType;
  remark: string;
  is_visible_to_parent: boolean;
  date: string;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  school_id: string;
  requester_id: string;
  leave_type: LeaveType;
  from_date: string;
  to_date: string;
  reason: string;
  attachment_url: string | null;
  status: ApprovalStatus;
  approved_by: string | null;
  approval_remarks: string | null;
  created_at: string;
}

// === DOCUMENTS & EVENTS ===

export interface DocumentRequest {
  id: string;
  school_id: string;
  student_id: string;
  requested_by: string;
  document_type: DocumentType;
  reason: string | null;
  status: DocumentRequestStatus;
  processed_by: string | null;
  processed_at: string | null;
  download_url: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface Event {
  id: string;
  school_id: string;
  title: string;
  description: string | null;
  event_date: string;
  end_date: string | null;
  event_type: EventType;
  is_holiday: boolean;
  target_audience: string;
  created_by: string;
  created_at: string;
}

// === NOTIFICATIONS & HR ===

export interface Notification {
  id: string;
  school_id: string;
  user_id: string;
  title: string;
  body: string;
  type: NotificationType | null;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface Payroll {
  id: string;
  school_id: string;
  teacher_id: string;
  month: number;
  year: number;
  basic: number;
  hra: number;
  ta: number;
  da: number;
  other_allowance: number;
  deductions: number;
  net_salary: number;
  payment_date: string | null;
  payment_status: PaymentStatus;
  slip_url: string | null;
  created_at: string;
}

// === HELPER TYPES ===

export interface FileAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

// === COMPOSITE TYPES (for joined queries) ===

export interface UserWithProfile extends User {
  principal_profile?: PrincipalProfile;
  teacher_profile?: TeacherProfile;
  parent_profile?: ParentProfile;
}

export interface StudentWithDetails extends Student {
  class?: Class;
  section?: Section;
  parents?: (StudentParentLink & { parent: User })[];
}

export interface SchoolWithStats extends School {
  student_count?: number;
  teacher_count?: number;
  principal?: User;
}
