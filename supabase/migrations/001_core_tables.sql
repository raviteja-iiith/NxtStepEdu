-- ============================================================
-- School ERP Management System — Complete Database Schema
-- Migration 001: Core Tables
-- ============================================================

-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS schools (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  code                  TEXT UNIQUE NOT NULL,
  address               TEXT,
  city                  TEXT,
  state                 TEXT,
  pincode               TEXT,
  phone                 TEXT,
  email                 TEXT,
  logo_url              TEXT,
  is_active             BOOLEAN DEFAULT true,
  subscription_plan     TEXT DEFAULT 'basic'
                          CHECK (subscription_plan IN ('basic','standard','premium')),
  subscription_start    DATE,
  subscription_end      DATE,
  razorpay_key_id       TEXT,
  razorpay_key_secret   TEXT,
  sms_enabled           BOOLEAN DEFAULT true,
  ai_enabled            BOOLEAN DEFAULT false,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  created_by            UUID
);

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id       UUID REFERENCES schools(id),
  role            TEXT NOT NULL
                    CHECK (role IN ('admin','principal','teacher','parent')),
  username        TEXT UNIQUE,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  photo_url       TEXT,
  is_active       BOOLEAN DEFAULT true,
  is_first_login  BOOLEAN DEFAULT true,
  created_by      UUID,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS principal_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  school_id       UUID REFERENCES schools(id),
  employee_id     TEXT,
  qualification   TEXT,
  joining_date    DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  school_id       UUID REFERENCES schools(id),
  employee_id     TEXT,
  qualification   TEXT,
  specialization  TEXT,
  joining_date    DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parent_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  school_id         UUID REFERENCES schools(id),
  occupation        TEXT,
  address           TEXT,
  emergency_contact TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ACADEMIC STRUCTURE
-- ============================================================

CREATE TABLE IF NOT EXISTS academic_years (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID REFERENCES schools(id),
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_current  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, name)
);

CREATE TABLE IF NOT EXISTS classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  name             TEXT NOT NULL,
  numeric_order    INTEGER,
  academic_year_id UUID REFERENCES academic_years(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, name, academic_year_id)
);

CREATE TABLE IF NOT EXISTS sections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID REFERENCES schools(id),
  class_id          UUID REFERENCES classes(id),
  name              TEXT NOT NULL,
  class_teacher_id  UUID REFERENCES users(id),
  max_students      INTEGER DEFAULT 50,
  academic_year_id  UUID REFERENCES academic_years(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, name, academic_year_id)
);

CREATE TABLE IF NOT EXISTS subjects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  class_id         UUID REFERENCES classes(id),
  name             TEXT NOT NULL,
  code             TEXT,
  teacher_id       UUID REFERENCES users(id),
  academic_year_id UUID REFERENCES academic_years(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_section_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  teacher_id       UUID REFERENCES users(id),
  section_id       UUID REFERENCES sections(id),
  subject_id       UUID REFERENCES subjects(id),
  academic_year_id UUID REFERENCES academic_years(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(teacher_id, section_id, subject_id, academic_year_id)
);

-- ============================================================
-- STUDENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS students (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  admission_number TEXT,
  full_name        TEXT NOT NULL,
  date_of_birth    DATE,
  gender           TEXT CHECK (gender IN ('male','female','other')),
  blood_group      TEXT,
  photo_url        TEXT,
  class_id         UUID REFERENCES classes(id),
  section_id       UUID REFERENCES sections(id),
  roll_number      INTEGER,
  academic_year_id UUID REFERENCES academic_years(id),
  address          TEXT,
  is_active        BOOLEAN DEFAULT true,
  admission_date   DATE DEFAULT CURRENT_DATE,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_parent_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID REFERENCES students(id) ON DELETE CASCADE,
  parent_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  relationship        TEXT NOT NULL
                        CHECK (relationship IN ('father','mother','guardian','other')),
  is_primary_contact  BOOLEAN DEFAULT false,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, parent_id)
);

-- ============================================================
-- TIMETABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS timetable (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  section_id       UUID REFERENCES sections(id),
  subject_id       UUID REFERENCES subjects(id),
  teacher_id       UUID REFERENCES users(id),
  day_of_week      INTEGER NOT NULL
                     CHECK (day_of_week BETWEEN 1 AND 6),
  period_number    INTEGER NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  room             TEXT,
  academic_year_id UUID REFERENCES academic_years(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(section_id, day_of_week, period_number, academic_year_id),
  UNIQUE(teacher_id, day_of_week, period_number, academic_year_id)
);

-- ============================================================
-- ATTENDANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID REFERENCES schools(id),
  student_id UUID REFERENCES students(id),
  section_id UUID REFERENCES sections(id),
  date       DATE NOT NULL,
  status     TEXT NOT NULL
               CHECK (status IN ('present','absent','late','excused')),
  marked_by  UUID REFERENCES users(id),
  marked_at  TIMESTAMPTZ DEFAULT NOW(),
  remarks    TEXT,
  UNIQUE(student_id, date)
);

CREATE TABLE IF NOT EXISTS holidays (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  name             TEXT NOT NULL,
  date             DATE NOT NULL,
  holiday_type     TEXT CHECK (holiday_type IN ('national','regional','school','other')),
  academic_year_id UUID REFERENCES academic_years(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ASSIGNMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID REFERENCES schools(id),
  teacher_id   UUID REFERENCES users(id),
  subject_id   UUID REFERENCES subjects(id),
  section_id   UUID REFERENCES sections(id),
  title        TEXT NOT NULL,
  description  TEXT,
  deadline     TIMESTAMPTZ NOT NULL,
  max_marks    INTEGER,
  attachments  JSONB DEFAULT '[]',
  is_published BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  student_id   UUID REFERENCES students(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  attachments  JSONB DEFAULT '[]',
  marks_obtained NUMERIC,
  remarks      TEXT,
  status       TEXT DEFAULT 'submitted'
                 CHECK (status IN ('submitted','late','graded','returned')),
  graded_by    UUID REFERENCES users(id),
  graded_at    TIMESTAMPTZ,
  UNIQUE(assignment_id, student_id)
);

-- ============================================================
-- EXAMINATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS exams (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  name             TEXT NOT NULL,
  exam_type        TEXT CHECK (exam_type IN ('unit_test','mid_term','final','practical','internal')),
  class_id         UUID REFERENCES classes(id),
  section_id       UUID REFERENCES sections(id),
  subject_id       UUID REFERENCES subjects(id),
  exam_date        DATE NOT NULL,
  start_time       TIME,
  duration_minutes INTEGER,
  total_marks      INTEGER NOT NULL,
  passing_marks    INTEGER,
  academic_year_id UUID REFERENCES academic_years(id),
  is_published     BOOLEAN DEFAULT false,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id        UUID REFERENCES exams(id),
  student_id     UUID REFERENCES students(id),
  school_id      UUID REFERENCES schools(id),
  marks_obtained NUMERIC,
  is_absent      BOOLEAN DEFAULT false,
  remarks        TEXT,
  entered_by     UUID REFERENCES users(id),
  entered_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS report_cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID REFERENCES students(id),
  school_id        UUID REFERENCES schools(id),
  academic_year_id UUID REFERENCES academic_years(id),
  exam_group       TEXT,
  generated_at     TIMESTAMPTZ DEFAULT NOW(),
  generated_by     UUID REFERENCES users(id),
  ai_summary       TEXT,
  download_url     TEXT,
  is_published     BOOLEAN DEFAULT false
);

-- ============================================================
-- FEE MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS fee_structures (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID REFERENCES schools(id),
  class_id           UUID REFERENCES classes(id),
  fee_type           TEXT NOT NULL
                       CHECK (fee_type IN ('tuition','transport','hostel','examination','activity','library','uniform','miscellaneous')),
  name               TEXT NOT NULL,
  amount             NUMERIC NOT NULL,
  due_date           DATE,
  academic_year_id   UUID REFERENCES academic_years(id),
  is_recurring       BOOLEAN DEFAULT false,
  recurring_interval TEXT CHECK (recurring_interval IN ('monthly','quarterly','annual')),
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fees (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID REFERENCES students(id),
  school_id         UUID REFERENCES schools(id),
  fee_structure_id  UUID REFERENCES fee_structures(id),
  amount            NUMERIC NOT NULL,
  discount_amount   NUMERIC DEFAULT 0,
  discount_reason   TEXT,
  due_date          DATE NOT NULL,
  status            TEXT DEFAULT 'pending'
                      CHECK (status IN ('pending','paid','overdue','partially_paid','waived')),
  academic_year_id  UUID REFERENCES academic_years(id),
  late_fee_applied  NUMERIC DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_id               UUID REFERENCES fees(id),
  student_id           UUID REFERENCES students(id),
  school_id            UUID REFERENCES schools(id),
  amount_paid          NUMERIC NOT NULL,
  payment_date         TIMESTAMPTZ DEFAULT NOW(),
  payment_mode         TEXT CHECK (payment_mode IN ('online','cash','cheque','bank_transfer','dd')),
  razorpay_order_id    TEXT,
  razorpay_payment_id  TEXT UNIQUE,
  razorpay_signature   TEXT,
  receipt_number       TEXT UNIQUE,
  collected_by         UUID REFERENCES users(id),
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COMMUNICATION
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID REFERENCES schools(id),
  sender_id   UUID REFERENCES users(id),
  receiver_id UUID REFERENCES users(id),
  content     TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  is_read     BOOLEAN DEFAULT false,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID REFERENCES schools(id),
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  target_audience   TEXT DEFAULT 'all'
                      CHECK (target_audience IN ('all','teachers','parents','class','section')),
  target_class_id   UUID REFERENCES classes(id),
  target_section_id UUID REFERENCES sections(id),
  is_urgent         BOOLEAN DEFAULT false,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  expires_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS meeting_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  parent_id        UUID REFERENCES users(id),
  teacher_id       UUID REFERENCES users(id),
  student_id       UUID REFERENCES students(id),
  reason           TEXT NOT NULL,
  proposed_date_1  DATE,
  proposed_time_1  TIME,
  proposed_date_2  DATE,
  proposed_time_2  TIME,
  confirmed_date   DATE,
  confirmed_time   TIME,
  status           TEXT DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','completed','cancelled')),
  meeting_notes    TEXT,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TEACHER OPERATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS lesson_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID REFERENCES schools(id),
  teacher_id          UUID REFERENCES users(id),
  subject_id          UUID REFERENCES subjects(id),
  section_id          UUID REFERENCES sections(id),
  week_start_date     DATE NOT NULL,
  topics              TEXT NOT NULL,
  learning_objectives TEXT,
  resources_used      TEXT,
  homework_given      TEXT,
  status              TEXT DEFAULT 'planned'
                        CHECK (status IN ('planned','in_progress','completed','pending_review')),
  principal_remarks   TEXT,
  academic_year_id    UUID REFERENCES academic_years(id),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID REFERENCES schools(id),
  teacher_id    UUID REFERENCES users(id),
  subject_id    UUID REFERENCES subjects(id),
  section_id    UUID REFERENCES sections(id),
  title         TEXT NOT NULL,
  description   TEXT,
  resource_type TEXT CHECK (resource_type IN ('notes','video','worksheet','presentation','link','image')),
  file_url      TEXT,
  external_link TEXT,
  is_published  BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_remarks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID REFERENCES schools(id),
  student_id           UUID REFERENCES students(id),
  teacher_id           UUID REFERENCES users(id),
  remark_type          TEXT CHECK (remark_type IN ('behavior','academic','achievement','concern')),
  remark               TEXT NOT NULL,
  is_visible_to_parent BOOLEAN DEFAULT true,
  date                 DATE DEFAULT CURRENT_DATE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  requester_id     UUID REFERENCES users(id),
  leave_type       TEXT CHECK (leave_type IN ('sick','casual','earned','emergency','maternity','paternity','other')),
  from_date        DATE NOT NULL,
  to_date          DATE NOT NULL,
  reason           TEXT NOT NULL,
  attachment_url   TEXT,
  status           TEXT DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by      UUID REFERENCES users(id),
  approval_remarks TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DOCUMENTS & EVENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS document_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  student_id       UUID REFERENCES students(id),
  requested_by     UUID REFERENCES users(id),
  document_type    TEXT CHECK (document_type IN ('bonafide','transfer_certificate','character_certificate','migration_certificate','provisional_certificate')),
  reason           TEXT,
  status           TEXT DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','ready','delivered','rejected')),
  processed_by     UUID REFERENCES users(id),
  processed_at     TIMESTAMPTZ,
  download_url     TEXT,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID REFERENCES schools(id),
  title           TEXT NOT NULL,
  description     TEXT,
  event_date      DATE NOT NULL,
  end_date        DATE,
  event_type      TEXT CHECK (event_type IN ('holiday','exam','sports','cultural','meeting','ptm','other')),
  is_holiday      BOOLEAN DEFAULT false,
  target_audience TEXT DEFAULT 'all',
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS & HR
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID REFERENCES schools(id),
  user_id        UUID REFERENCES users(id),
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  type           TEXT,
  reference_id   UUID,
  reference_type TEXT,
  is_read        BOOLEAN DEFAULT false,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID REFERENCES schools(id),
  teacher_id      UUID REFERENCES users(id),
  month           INTEGER CHECK (month BETWEEN 1 AND 12),
  year            INTEGER,
  basic           NUMERIC DEFAULT 0,
  hra             NUMERIC DEFAULT 0,
  ta              NUMERIC DEFAULT 0,
  da              NUMERIC DEFAULT 0,
  other_allowance NUMERIC DEFAULT 0,
  deductions      NUMERIC DEFAULT 0,
  net_salary      NUMERIC GENERATED ALWAYS AS (basic + hra + ta + da + other_allowance - deductions) STORED,
  payment_date    DATE,
  payment_status  TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','paid')),
  slip_url        TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(teacher_id, month, year)
);
