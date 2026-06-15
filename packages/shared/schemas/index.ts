import { z } from 'zod';

// ============================================================
// ZOD VALIDATION SCHEMAS — Used in both web and mobile forms
// ============================================================

// === AUTH SCHEMAS ===

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const parentLoginSchema = z.object({
  phone: z.string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  pin: z.string()
    .regex(/^\d{6}$/, 'PIN must be 6 digits'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const adminLoginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

// === SCHOOL SCHEMAS ===

export const createSchoolSchema = z.object({
  name: z.string().min(2, 'School name must be at least 2 characters'),
  code: z.string()
    .min(4, 'Code must be 4-8 characters')
    .max(8, 'Code must be 4-8 characters')
    .regex(/^[a-z0-9]+$/, 'Code must be lowercase alphanumeric only'),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits').optional().or(z.literal('')),
  phone: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  subscription_plan: z.enum(['basic', 'standard', 'premium']),
  subscription_start: z.string().optional(),
  subscription_end: z.string().optional(),
});

export const editSchoolSchema = createSchoolSchema.omit({ code: true });

// === PRINCIPAL SCHEMAS ===

export const createPrincipalSchema = z.object({
  school_id: z.string().uuid('Select a school'),
  full_name: z.string().min(2, 'Full name is required'),
  phone: z.string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  email: z.string().email('Enter a valid email'),
  employee_id: z.string().optional(),
  qualification: z.string().optional(),
});

// === TEACHER SCHEMAS ===

export const createTeacherSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  phone: z.string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  employee_id: z.string().optional(),
  qualification: z.string().optional(),
  specialization: z.string().optional(),
  joining_date: z.string().optional(),
});

// === PARENT SCHEMAS ===

export const createParentSchema = z.object({
  student_id: z.string().uuid('Select a student'),
  full_name: z.string().min(2, 'Full name is required'),
  relationship: z.enum(['father', 'mother', 'guardian', 'other']),
  phone: z.string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  occupation: z.string().optional(),
  is_primary_contact: z.boolean().default(false),
});

// === STUDENT SCHEMAS ===

export const createStudentSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  admission_number: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']),
  blood_group: z.string().optional(),
  class_id: z.string().uuid('Select a class'),
  section_id: z.string().uuid('Select a section'),
  roll_number: z.number().int().positive().optional(),
  address: z.string().optional(),
  admission_date: z.string().optional(),
});

// === ACADEMIC SCHEMAS ===

export const createAcademicYearSchema = z.object({
  name: z.string().min(1, 'Name is required (e.g., "2025-2026")'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
}).refine((data) => new Date(data.end_date) > new Date(data.start_date), {
  message: 'End date must be after start date',
  path: ['end_date'],
});

export const createClassSchema = z.object({
  name: z.string().min(1, 'Class name is required'),
  numeric_order: z.number().int().positive().optional(),
});

export const createSectionSchema = z.object({
  class_id: z.string().uuid('Select a class'),
  name: z.string().min(1, 'Section name is required'),
  class_teacher_id: z.string().uuid().optional(),
  max_students: z.number().int().positive().default(50),
});

export const createSubjectSchema = z.object({
  class_id: z.string().uuid('Select a class'),
  name: z.string().min(1, 'Subject name is required'),
  code: z.string().optional(),
  teacher_id: z.string().uuid().optional(),
});

// === ATTENDANCE SCHEMAS ===

export const markAttendanceSchema = z.object({
  section_id: z.string().uuid('Select a section'),
  date: z.string().min(1, 'Date is required'),
  entries: z.array(z.object({
    student_id: z.string().uuid(),
    status: z.enum(['present', 'absent', 'late', 'excused']),
    remarks: z.string().optional(),
  })),
});

// === ASSIGNMENT SCHEMAS ===

export const createAssignmentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  subject_id: z.string().uuid('Select a subject'),
  section_id: z.string().uuid('Select a section'),
  description: z.string().optional(),
  deadline: z.string().min(1, 'Deadline is required'),
  max_marks: z.number().int().positive().optional(),
  is_published: z.boolean().default(true),
});

// === EXAM SCHEMAS ===

export const createExamSchema = z.object({
  name: z.string().min(1, 'Exam name is required'),
  exam_type: z.enum(['unit_test', 'mid_term', 'final', 'practical', 'internal']),
  class_id: z.string().uuid('Select a class'),
  section_id: z.string().uuid().optional(),
  subject_id: z.string().uuid('Select a subject'),
  exam_date: z.string().min(1, 'Exam date is required'),
  start_time: z.string().optional(),
  duration_minutes: z.number().int().positive().optional(),
  total_marks: z.number().int().positive('Total marks must be positive'),
  passing_marks: z.number().int().positive().optional(),
});

// === FEE SCHEMAS ===

export const createFeeStructureSchema = z.object({
  class_id: z.string().uuid().optional(),
  fee_type: z.enum(['tuition', 'transport', 'hostel', 'examination', 'activity', 'library', 'uniform', 'miscellaneous']),
  name: z.string().min(1, 'Fee name is required'),
  amount: z.number().positive('Amount must be positive'),
  due_date: z.string().optional(),
  is_recurring: z.boolean().default(false),
  recurring_interval: z.enum(['monthly', 'quarterly', 'annual']).optional(),
});

// === ANNOUNCEMENT SCHEMAS ===

export const createAnnouncementSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  target_audience: z.enum(['all', 'teachers', 'parents', 'class', 'section']),
  target_class_id: z.string().uuid().optional(),
  target_section_id: z.string().uuid().optional(),
  is_urgent: z.boolean().default(false),
});

// === LEAVE SCHEMAS ===

export const createLeaveRequestSchema = z.object({
  leave_type: z.enum(['sick', 'casual', 'earned', 'emergency', 'maternity', 'paternity', 'other']),
  from_date: z.string().min(1, 'From date is required'),
  to_date: z.string().min(1, 'To date is required'),
  reason: z.string().min(5, 'Please provide a reason (at least 5 characters)'),
}).refine((data) => new Date(data.to_date) >= new Date(data.from_date), {
  message: 'To date must be on or after from date',
  path: ['to_date'],
});

// === Type exports ===
export type LoginInput = z.infer<typeof loginSchema>;
export type ParentLoginInput = z.infer<typeof parentLoginSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;
export type CreatePrincipalInput = z.infer<typeof createPrincipalSchema>;
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type CreateParentInput = z.infer<typeof createParentSchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;
export type CreateClassInput = z.infer<typeof createClassSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type CreateExamInput = z.infer<typeof createExamSchema>;
export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
