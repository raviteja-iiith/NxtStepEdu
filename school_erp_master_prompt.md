# School ERP Management System — Master Development Prompt

**Version:** 2.0 (Corrected & Expanded)
**Stack:** Next.js 14 + Supabase + Tailwind CSS (Web-first, React Native-ready)
**Target Market:** Indian K-12 Schools

---

## LOGICAL CORRECTIONS APPLIED

Before the full spec, here are the logical issues found in the original requirements and how they are corrected:

| # | Original Issue | Correction Applied |
|---|---|---|
| 1 | Admin manages admissions, classes, timetables | Admin is a **SaaS super-admin** — does NOT touch school-level ops. All school operations belong to the Principal. |
| 2 | Student is listed as a user role | **Student has no login** in this version. Student is a data entity created by Principal during admissions. |
| 3 | Unclear who approves teacher leaves | **Principal approves** all teacher leave requests. Admin is not involved. |
| 4 | Unclear who approves Bonafide/TC requests | **Principal processes** all document requests. |
| 5 | Fee structures unclear ownership | Principal creates fee structures for their school. Admin has nothing to do with per-school fees. |
| 6 | Report cards go straight to parents | **Flow:** Teacher enters marks → Report card generated → **Principal approves + publishes** → Parents can view. |
| 7 | WhatsApp listed as core notification | WhatsApp Business API has significant cost and compliance overhead. Mark as **Phase 2 / optional**. |
| 8 | Timetable conflict detection not specified | **System must block** saving a timetable if the same teacher is assigned to two sections at the same time slot. |
| 9 | Admin credential generation unclear | Admin creates School → auto-generates **Principal** credentials. Principal creates **Teacher** credentials. Teacher creates **Parent** credentials. |
| 10 | Mobile version as separate afterthought | Codebase **must be architected from Day 1** with maximum logic in shared packages so React Native reuse is seamless. |

---

## SECTION 1: PROJECT OVERVIEW

Build a full-stack, **multi-tenant School ERP Management System** as a web application. It is a SaaS platform where one Super Admin manages multiple school accounts. Each school is a completely isolated tenant.

**Primary users:** Super Admin, Principal, Teacher, Parent
**Student:** Data entity only (no login in v1)

**Core goals:**
- Eliminate paper-based school operations
- Real-time parent engagement via mobile/web
- Automated fee reminders and online collection
- Centralized academic and attendance tracking
- AI-driven performance insights
- Structured credential hierarchy — Admin → Principal → Teacher → Parent

---

## SECTION 2: SYSTEM ARCHITECTURE

### Multi-Tenant Model
- Every table has a `school_id` foreign key
- Supabase Row Level Security (RLS) enforces complete data isolation between schools
- A user from School A can never see or access School B's data — enforced at the database level, not just the frontend

### Monorepo Structure (MANDATORY for mobile readiness)

```
/school-erp/
├── apps/
│   ├── web/                        # Next.js 14 App Router
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/          # School select → Role select → Login
│   │   │   │   └── admin/login/    # Admin-only login
│   │   │   ├── admin/              # Super Admin portal
│   │   │   ├── principal/          # Principal portal
│   │   │   ├── teacher/            # Teacher portal
│   │   │   └── parent/             # Parent portal
│   │   ├── components/             # Web-only UI components
│   │   └── lib/                    # Web-only utilities (Next.js specific)
│   │
│   └── mobile/                     # React Native + Expo (FUTURE — scaffold now)
│       ├── app/                    # Expo Router pages
│       └── components/             # RN-specific UI components
│
├── packages/
│   ├── shared/                     # SHARED — identical code on web and mobile
│   │   ├── types/                  # All TypeScript interfaces and types
│   │   ├── schemas/                # Zod validation schemas (all forms)
│   │   ├── constants/              # Enums, role names, fee types, status values
│   │   ├── utils/                  # Pure functions (date helpers, formatters, etc.)
│   │   └── hooks/                  # Framework-agnostic logic hooks
│   │
│   └── supabase/                   # Supabase client + all query functions
│       ├── client.ts               # createClient() — works in both web and RN
│       ├── types.ts                # Auto-generated Supabase TypeScript types
│       └── queries/                # Per-module query files
│           ├── auth.ts
│           ├── students.ts
│           ├── attendance.ts
│           ├── fees.ts
│           ├── assignments.ts
│           ├── exams.ts
│           ├── messages.ts
│           └── ...
│
├── turbo.json
└── package.json
```

**Critical Rule:** Never write business logic inside Next.js route files or components. All logic lives in `packages/`. Components only handle rendering and call hooks from packages.

---

## SECTION 3: TECHNOLOGY STACK

### Web (Build Now)

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR, file-based routing, Server Actions |
| Styling | Tailwind CSS + shadcn/ui | Utility-first, accessible component library |
| State (client) | Zustand | Works identically in React Native |
| Server state | TanStack Query v5 | Works identically in React Native |
| Forms | React Hook Form + Zod | Zod schemas shared with mobile |
| Database | Supabase (PostgreSQL + RLS) | Auth + DB + Storage + Realtime in one |
| Authentication | Supabase Auth | JWT-based, role stored in users table |
| File Storage | Supabase Storage | Private buckets with signed URLs |
| Real-time | Supabase Realtime | Chat and live notifications |
| Payment | Razorpay | India-first, supports UPI/cards/netbanking |
| PDF Generation | @react-pdf/renderer | Report cards, receipts, ID cards |
| Charts | Recharts | Lightweight, SSR-compatible |
| Push Notifications | Firebase Cloud Messaging | Web + mobile push |
| SMS | MSG91 | India-focused, reliable, affordable |
| Email | Resend | Transactional emails |
| AI | Anthropic Claude API | Sonnet for analysis, Haiku for chatbot |
| Deployment | Vercel | Next.js native, edge functions |

### Mobile (Future — Architect For)

| Layer | Choice |
|---|---|
| Framework | React Native + Expo SDK 51+ |
| Styling | NativeWind v4 (Tailwind syntax) |
| Navigation | Expo Router v3 |
| State / Server State | Same Zustand + TanStack Query from packages/shared |
| Auth + DB | Same Supabase client from packages/supabase |
| Push Notifications | Expo Notifications + Firebase |

---

## SECTION 4: USER HIERARCHY

```
Super Admin (Platform Level — manages SaaS)
      │
      │  [Admin creates school + generates Principal credentials]
      │
      └── Principal (School Level — one per school)
                │
                │  [Principal creates Teacher accounts + generates credentials]
                │  [Principal manages student admissions]
                │
                └── Teacher (Classroom Level — multiple per school)
                          │
                          │  [Teacher creates Parent accounts + generates credentials]
                          │  [Teacher links Parent to specific Student(s)]
                          │
                          └── Parent (View/Action Level — created per student)
                                    │
                                    └── [Views child's data only]

Student = Data entity only. No login. Created by Principal during admissions.
```

### Hierarchy Rules (Hard Rules)
1. Only **Admin** can create schools and principals
2. Only **Principal** can create teachers and manage student admissions
3. Only **Teacher** can create parent accounts and link them to students
4. Admin can **pause** any school instantly — all users of that school lose access immediately
5. Principal can **deactivate** any teacher in their school
6. Teacher can **deactivate** any parent account they created
7. **No role can access data above their level** — enforced by RLS
8. Admin sees **aggregated, anonymized** stats across schools — NOT individual student data

---

## SECTION 5: AUTHENTICATION FLOW

### App Entry — School-Scoped Login (for Principal, Teacher, Parent)

**Step 1: School Selection Screen**
- Full-page UI showing a searchable list of all schools where `is_active = true`
- Each school card shows: Logo, School Name, City, State
- Search filters as user types (debounced — 300ms)
- If school is paused: NOT shown in list (filtered server-side)
- Scroll or paginate if many schools
- Store selected `school_id` and `school_code` in session

**Step 2: Role Selection Screen**
- After school selected, show 3 large clickable cards:
  - 🏫 Principal
  - 👨‍🏫 Teacher
  - 👨‍👩‍👧 Parent
- Back button to re-select school

**Step 3: Credentials Screen**
- Principal & Teacher: Username field + Password field
- Parent: Mobile number (10-digit) + PIN (6-digit) OR OTP button
- "Forgot Password / PIN" → OTP to registered mobile
- On submit: Validate `school_id` + `role` + credentials
- If `is_first_login = true`: Redirect to **Force Password Change** screen before dashboard
- Invalid credentials: Show error — do NOT reveal whether username or password was wrong (security)
- After 5 failed attempts: Lock account for 15 minutes, notify admin/principal

**Force Password Change Screen (First Login)**
- Current temp password
- New password (with strength indicator)
- Confirm new password
- On save: `is_first_login` set to `false`, redirect to dashboard

**Admin Login**
- Separate URL: `/admin/login`
- Email + Password (no school selection needed)
- Optional: 2FA via TOTP (Google Authenticator)
- Admin session stored separately, never mixed with school sessions

### Credential Generation Rules

**Principal credentials (generated by Admin):**
- Username: `principal@{school_code}` → e.g., `principal@svsps`
- Temp Password: 8-character alphanumeric random (upper + lower + digits)
- Shown on screen in a modal immediately after creation
- Admin can download credentials as a printable PDF card
- SMS sent to principal's registered phone number
- Email sent to principal's registered email

**Teacher credentials (generated by Principal):**
- Username: `{firstname}.{employee_id}@{school_code}` → e.g., `ravi.t001@svsps`
- Temp Password: 8-character alphanumeric random
- Shown on screen in a modal
- Principal can download/print credentials card
- SMS + Email sent to teacher

**Parent credentials (generated by Teacher):**
- Username: Parent's 10-digit mobile number
- Temp PIN: 6-digit numeric (easy for non-tech users)
- Shown on screen in a printable card format
- Teacher can WhatsApp the credentials (manual share button opens WhatsApp with pre-filled message)
- Optional: SMS sent to parent's number

### School Pause Behavior
- Admin sets `schools.is_active = false`
- RLS policy blocks ALL queries for that `school_id`
- Any active session for that school is invalidated on next API call
- Users see full-screen message: **"Your school's access has been temporarily suspended. Please contact your school management."**
- School does NOT appear in the school selection list for new logins
- Admin dashboard shows paused school with reason and timestamp
- Admin can resume at any time (`is_active = true`)

---

## SECTION 6: DATABASE SCHEMA

Use Supabase (PostgreSQL). All tables include `created_at TIMESTAMPTZ DEFAULT NOW()`. All tables have `school_id` for tenant isolation except `schools` and `users` (users have school_id as FK).

```sql
-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE schools (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  code                  TEXT UNIQUE NOT NULL,  -- 4-8 chars, e.g. "svsps"
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
  razorpay_key_id       TEXT,  -- school's own Razorpay account
  razorpay_key_secret   TEXT,  -- stored encrypted
  sms_enabled           BOOLEAN DEFAULT true,
  ai_enabled            BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  created_by            UUID  -- admin user id
);

CREATE TABLE users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id       UUID REFERENCES schools(id),  -- NULL for admin
  role            TEXT NOT NULL
                    CHECK (role IN ('admin','principal','teacher','parent')),
  username        TEXT UNIQUE,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  photo_url       TEXT,
  is_active       BOOLEAN DEFAULT true,
  is_first_login  BOOLEAN DEFAULT true,
  created_by      UUID REFERENCES users(id),
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE principal_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  school_id       UUID REFERENCES schools(id),
  employee_id     TEXT,
  qualification   TEXT,
  joining_date    DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE teacher_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  school_id       UUID REFERENCES schools(id),
  employee_id     TEXT,
  qualification   TEXT,
  specialization  TEXT,
  joining_date    DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE parent_profiles (
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

CREATE TABLE academic_years (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID REFERENCES schools(id),
  name        TEXT NOT NULL,  -- "2024-2025"
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_current  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, name)
);

CREATE TABLE classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  name             TEXT NOT NULL,  -- "Class 1", "KG2", "Grade 11"
  numeric_order    INTEGER,         -- for sorting in lists
  academic_year_id UUID REFERENCES academic_years(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, name, academic_year_id)
);

CREATE TABLE sections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID REFERENCES schools(id),
  class_id          UUID REFERENCES classes(id),
  name              TEXT NOT NULL,  -- "A", "B", "C"
  class_teacher_id  UUID REFERENCES users(id),
  max_students      INTEGER DEFAULT 50,
  academic_year_id  UUID REFERENCES academic_years(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, name, academic_year_id)
);

CREATE TABLE subjects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  class_id         UUID REFERENCES classes(id),
  name             TEXT NOT NULL,   -- "Mathematics"
  code             TEXT,            -- "MATH8"
  teacher_id       UUID REFERENCES users(id),
  academic_year_id UUID REFERENCES academic_years(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Which teacher teaches which subject in which section
CREATE TABLE teacher_section_assignments (
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

CREATE TABLE students (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  admission_number TEXT,  -- UNIQUE per school (enforce at app level)
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

-- Links parent users to their children
CREATE TABLE student_parent_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID REFERENCES students(id) ON DELETE CASCADE,
  parent_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  relationship        TEXT NOT NULL  -- "father","mother","guardian"
                        CHECK (relationship IN ('father','mother','guardian','other')),
  is_primary_contact  BOOLEAN DEFAULT false,
  created_by          UUID REFERENCES users(id),  -- teacher who linked them
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, parent_id)
);

-- ============================================================
-- TIMETABLE
-- ============================================================

CREATE TABLE timetable (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  section_id       UUID REFERENCES sections(id),
  subject_id       UUID REFERENCES subjects(id),
  teacher_id       UUID REFERENCES users(id),
  day_of_week      INTEGER NOT NULL  -- 1=Monday ... 6=Saturday
                     CHECK (day_of_week BETWEEN 1 AND 6),
  period_number    INTEGER NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  room             TEXT,
  academic_year_id UUID REFERENCES academic_years(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
  -- UNIQUE(section_id, day_of_week, period_number, academic_year_id)
  -- UNIQUE(teacher_id, day_of_week, period_number, academic_year_id) -- conflict prevention
);

-- ============================================================
-- ATTENDANCE
-- ============================================================

CREATE TABLE attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID REFERENCES schools(id),
  student_id UUID REFERENCES students(id),
  section_id UUID REFERENCES sections(id),
  date       DATE NOT NULL,
  status     TEXT NOT NULL
               CHECK (status IN ('present','absent','late','excused')),
  marked_by  UUID REFERENCES users(id),  -- teacher id
  marked_at  TIMESTAMPTZ DEFAULT NOW(),
  remarks    TEXT,
  UNIQUE(student_id, date)
);

-- School working days / holidays
CREATE TABLE holidays (
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

CREATE TABLE assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID REFERENCES schools(id),
  teacher_id   UUID REFERENCES users(id),
  subject_id   UUID REFERENCES subjects(id),
  section_id   UUID REFERENCES sections(id),
  title        TEXT NOT NULL,
  description  TEXT,
  deadline     TIMESTAMPTZ NOT NULL,
  max_marks    INTEGER,
  attachments  JSONB DEFAULT '[]',  -- [{name, url, type, size}]
  is_published BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE assignment_submissions (
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

CREATE TABLE exams (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  name             TEXT NOT NULL,   -- "Unit Test 1", "Mid Term", "Final Exam"
  exam_type        TEXT CHECK (exam_type IN ('unit_test','mid_term','final','practical','internal')),
  class_id         UUID REFERENCES classes(id),
  section_id       UUID REFERENCES sections(id),  -- NULL = all sections of that class
  subject_id       UUID REFERENCES subjects(id),
  exam_date        DATE NOT NULL,
  start_time       TIME,
  duration_minutes INTEGER,
  total_marks      INTEGER NOT NULL,
  passing_marks    INTEGER,
  academic_year_id UUID REFERENCES academic_years(id),
  is_published     BOOLEAN DEFAULT false,  -- Principal publishes exam schedule
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE marks (
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

CREATE TABLE report_cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID REFERENCES students(id),
  school_id        UUID REFERENCES schools(id),
  academic_year_id UUID REFERENCES academic_years(id),
  exam_group       TEXT,  -- "mid_term", "final", "annual"
  generated_at     TIMESTAMPTZ DEFAULT NOW(),
  generated_by     UUID REFERENCES users(id),
  ai_summary       TEXT,
  download_url     TEXT,
  is_published     BOOLEAN DEFAULT false  -- set true by Principal
);

-- ============================================================
-- FEE MANAGEMENT
-- ============================================================

CREATE TABLE fee_structures (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID REFERENCES schools(id),
  class_id           UUID REFERENCES classes(id),  -- NULL = applies to all classes
  fee_type           TEXT NOT NULL
                       CHECK (fee_type IN ('tuition','transport','hostel','examination','activity','library','uniform','miscellaneous')),
  name               TEXT NOT NULL,  -- "Term 1 Tuition", "Annual Examination Fee"
  amount             NUMERIC NOT NULL,
  due_date           DATE,
  academic_year_id   UUID REFERENCES academic_years(id),
  is_recurring       BOOLEAN DEFAULT false,
  recurring_interval TEXT CHECK (recurring_interval IN ('monthly','quarterly','annual')),
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fees (
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

CREATE TABLE fee_payments (
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
  receipt_number       TEXT UNIQUE,  -- auto-increment per school
  collected_by         UUID REFERENCES users(id),  -- NULL if parent paid online
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COMMUNICATION
-- ============================================================

CREATE TABLE messages (
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

CREATE TABLE announcements (
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

CREATE TABLE meeting_requests (
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

CREATE TABLE lesson_plans (
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

CREATE TABLE resources (
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

CREATE TABLE student_remarks (
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

CREATE TABLE leave_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  requester_id     UUID REFERENCES users(id),  -- teacher
  leave_type       TEXT CHECK (leave_type IN ('sick','casual','earned','emergency','maternity','paternity','other')),
  from_date        DATE NOT NULL,
  to_date          DATE NOT NULL,
  reason           TEXT NOT NULL,
  attachment_url   TEXT,
  status           TEXT DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by      UUID REFERENCES users(id),  -- principal
  approval_remarks TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DOCUMENTS & EVENTS
-- ============================================================

CREATE TABLE document_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID REFERENCES schools(id),
  student_id       UUID REFERENCES students(id),
  requested_by     UUID REFERENCES users(id),  -- parent
  document_type    TEXT CHECK (document_type IN ('bonafide','transfer_certificate','character_certificate','migration_certificate','provisional_certificate')),
  reason           TEXT,
  status           TEXT DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','ready','delivered','rejected')),
  processed_by     UUID REFERENCES users(id),  -- principal
  processed_at     TIMESTAMPTZ,
  download_url     TEXT,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE events (
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

CREATE TABLE notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID REFERENCES schools(id),
  user_id        UUID REFERENCES users(id),
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  type           TEXT,  -- 'attendance','fee','assignment','exam','general','announcement'
  reference_id   UUID,
  reference_type TEXT,
  is_read        BOOLEAN DEFAULT false,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll (
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
```

---

## SECTION 7: ROW LEVEL SECURITY (RLS) POLICIES

Enable RLS on ALL tables. Here are the key policies:

```sql
-- === SCHOOLS ===
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active schools visible for login screen"
ON schools FOR SELECT USING (is_active = true);

CREATE POLICY "Admin can manage all schools"
ON schools FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

-- === USERS ===
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see users from same school"
ON users FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

-- === STUDENTS ===
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students visible to own school roles with correct scope"
ON students FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    -- Principal sees all school students
    (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
    OR
    -- Teacher sees only their sections' students
    section_id IN (
      SELECT section_id FROM teacher_section_assignments
      WHERE teacher_id = auth.uid()
    )
    OR
    -- Parent sees only their linked children
    id IN (
      SELECT student_id FROM student_parent_links
      WHERE parent_id = auth.uid()
    )
  )
);

-- === ATTENDANCE ===
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attendance access by role"
ON attendance FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
    OR marked_by = auth.uid()  -- teacher who marked
    OR section_id IN (
      SELECT section_id FROM teacher_section_assignments WHERE teacher_id = auth.uid()
    )
    OR student_id IN (
      SELECT student_id FROM student_parent_links WHERE parent_id = auth.uid()
    )
  )
);

-- === FEES ===
ALTER TABLE fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fees visible to principal and linked parent"
ON fees FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('principal','admin')
    OR student_id IN (
      SELECT student_id FROM student_parent_links WHERE parent_id = auth.uid()
    )
  )
);

-- === MARKS ===
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marks visible - parents see only published, own child"
ON marks FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('principal','teacher')
    OR (
      exam_id IN (SELECT id FROM exams WHERE is_published = true)
      AND student_id IN (
        SELECT student_id FROM student_parent_links WHERE parent_id = auth.uid()
      )
    )
  )
);

-- === MESSAGES ===
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see only their own messages"
ON messages FOR SELECT USING (
  sender_id = auth.uid() OR receiver_id = auth.uid()
);

-- Apply similar RLS on ALL other tables
```

---

## SECTION 8: ADMIN MODULE (SUPER ADMIN)

**URL:** `/admin`
**Login:** `/admin/login` — Email + Password (no school selection)
**Scope:** Platform-wide. Cannot see individual student/academic data.

### 8.1 Admin Dashboard
- Total schools registered (total / active / paused)
- Total students across all schools (aggregated count only)
- Total teachers across all schools
- New schools registered this month
- Subscription expiry alerts (schools expiring in 30 / 15 / 7 days — highlighted)
- Platform health status (Supabase status, storage usage)

### 8.2 School Management

**Create School:**
- School Name (required)
- School Code (required — 4-8 alphanumeric chars, auto-suggest from name, must be unique)
- Address: Street, City, State, Pincode
- Phone, Email
- School Type: Nursery-Primary / Secondary / Senior Secondary / K-12
- Upload Logo (→ Supabase Storage)
- Subscription Plan: Basic / Standard / Premium
- Subscription Start Date + End Date
- **On Save:** School record created. Immediately usable by Principal once Principal account is made.

**School List View:**
- Table: Name | Code | City | Plan | Students Count | Status | Expiry | Actions
- Filters: City, State, Plan, Status (Active/Paused/Expiring)
- Search by name or code
- Actions per row: View | Edit | Pause/Resume | Manage Principal | Delete (soft)

**Pause School:**
- Button "Pause Access" → modal asks for reason (required)
- Sets `is_active = false`
- All school users immediately locked out on next request
- School removed from login school picker
- Principal gets SMS: "Your school's ERP access has been suspended by the platform administrator."

**Resume School:**
- Button "Resume Access" → confirmation modal
- Sets `is_active = true`
- School reappears in login picker

**Delete School:**
- Soft delete only (add `deleted_at` timestamp)
- All data retained for 90 days
- Requires typed confirmation ("DELETE {school_name}")
- Cannot delete if subscription is active — must expire or be terminated first

### 8.3 Principal Management

**Create Principal (linked to a school):**
- Select School (required)
- Full Name (required)
- Phone Number (required)
- Email (required)
- Employee ID (optional)
- Qualification
- Photo upload
- **On Save:**
  - `users` record created: `role = 'principal'`, `school_id = selected school`, `is_first_login = true`
  - `principal_profiles` record created
  - Credentials generated: username = `principal@{school_code}`, password = random 8-char
  - Modal shows credentials — Admin copies or downloads as PDF
  - SMS sent to phone with credentials
  - Email sent to email with credentials

**Principal List:**
- Table: Name | School | Phone | Status | Last Login | Actions
- Actions: View | Edit | Deactivate | Reset Password

### 8.4 Global Analytics
- Monthly new school registrations (bar chart)
- Revenue trend (subscription fees by month — if billing tracked)
- School-wise student count ranking
- Platform-wide attendance rate (aggregated, no student names)
- Subscription plan distribution (pie chart)

### 8.5 System Configuration
- Platform name and branding
- Default SMS templates (editable)
- Global feature flags: AI features (on/off per plan)
- Maintenance mode: When ON, all non-admin users see maintenance page

---

## SECTION 9: PRINCIPAL MODULE

**URL:** `/principal`
**Scope:** Own school only
**Created by:** Admin
**Creates:** Teachers, manages students, all school operations

### 9.1 Principal Dashboard
- Total Students (current academic year, active only)
- Total Teachers (active)
- Total Parents linked
- Today's school-wide attendance %
- Today's absent count (with link to list)
- Fee collected this month vs target
- Total overdue fees (count + amount)
- Upcoming exams (next 7 days)
- Pending approvals widget: Leave requests | Document requests | Meeting requests (counts with links)
- Recent announcements
- Quick actions: [+ Add Teacher] [+ New Student] [📢 Announcement] [📊 Reports]

### 9.2 Teacher Management

**Add Teacher:**
- Full Name (required)
- Phone (required)
- Email (optional)
- Employee ID (auto-increment or manual — unique within school)
- Qualification
- Joining Date
- Specialization / Subjects they can teach (multi-select from school's subject list)
- Photo upload
- **On Save:**
  - User created: `role = 'teacher'`, `school_id`, `is_first_login = true`
  - Teacher profile created
  - Credentials: username = `{firstname}.{employee_id}@{school_code}`, password = random 8-char
  - Credential card shown on screen + downloadable PDF
  - SMS + Email sent to teacher

**Teacher List:**
- Table: Name | Emp ID | Assigned Sections | Subjects | Status | Last Login | Actions
- Actions: View Profile | Edit | Assign Sections | Deactivate | Reset Password

**Assign Teacher to Sections:**
- Select Teacher → show available sections
- For each section, assign subjects they will teach in that section
- Validate: One teacher per subject per section
- Save creates `teacher_section_assignments` records

**Teacher Performance View (per teacher):**
- Attendance marked on time: % of working days (calculation: attendance marked on same date vs next day)
- Assignments created this month
- Assignments graded vs pending
- Lesson plans submitted
- Parent communications count
- Student average score in their subjects

### 9.3 Student Admissions & Management

**Admit New Student:**
- Full Name (required)
- Date of Birth (required)
- Admission Number (auto-generated per school: `{school_code}-{year}-{sequence}`, editable)
- Gender (required)
- Blood Group
- Class (dropdown from active classes)
- Section (filtered by class)
- Roll Number (auto-suggested = max existing + 1 in that section, editable)
- Address
- Photo upload (→ Supabase Storage)
- Emergency Contact Name + Phone
- Admission Date (default: today)
- Parent details are NOT mandatory at admission time — teacher will add later
- Academic Year = current (auto-set)

**Student List:**
- Table: Name | Admission No. | Class | Section | Roll No. | Status | Actions
- Filters: Class, Section, Academic Year, Status (active/inactive)
- Search by name or admission number
- Export as Excel

**Student Profile Page:**
- All personal details
- Parent links (who is linked)
- Attendance summary
- Academic performance summary
- Fee status summary
- Remarks history
- Edit student details
- Transfer to another section / class
- Deactivate (alumni / left school)

**Bulk Student Promotion (Year-end):**
- Select academic year to promote FROM
- Select class(es)
- System maps each class to next class (e.g., Class 5 → Class 6)
- Preview the promotion list
- Confirm → creates new student records for next academic year, retains history

### 9.4 Academic Structure Management

**Academic Years:**
- Create: Name (e.g., "2025-2026"), Start Date, End Date
- Only one can be marked "current" — switching current year prompts confirmation
- All new records (students, exams, fees) default to current year

**Classes:**
- Create class with name and numeric order (for sorting)
- Edit / deactivate classes
- Classes are tied to academic years

**Sections:**
- Create sections per class (A, B, C...)
- Set class teacher per section (select from teachers list)
- Set max student capacity
- View student count per section

**Subjects:**
- Create subjects for each class
- Set subject code
- Assign primary subject teacher
- Subject used in: timetable, assignments, exams, resources, marks

### 9.5 Timetable Management

**Configure Time Slots:**
- Set school start time and end time
- Set period duration (e.g., 45 minutes)
- Number of periods per day (auto-calculated)
- Configure break/lunch periods (they don't get a subject)
- These settings apply school-wide

**Create Timetable per Section:**
- Select Section → select week (timetable is weekly, repeating)
- Grid view: Days (Mon-Sat) across columns, Periods as rows
- For each cell: Select Subject → teacher auto-fills from subject assignment → can override
- **Conflict Detection (CRITICAL):**
  - Before saving any cell: query if `teacher_id` already has an assignment at `day + period` in any other section
  - If conflict found: Block save, show error: "⚠️ [Teacher Name] is already scheduled for [Subject] in [Section Name] at this time."
  - Only allow save after resolving conflict
- Break/Lunch periods auto-filled, not editable
- Save timetable → immediately visible to teacher and parents of that section

**Export Timetable:**
- Download section timetable as formatted PDF (includes school logo, class, section, academic year)

### 9.6 Exam Management

**Create Exam Schedule:**
- Exam Name (e.g., "Unit Test 1 — Mathematics")
- Exam Type: Unit Test / Mid Term / Final / Practical / Internal
- Select Class + Section (can select all sections for that class)
- Select Subject
- Exam Date + Start Time
- Duration (minutes)
- Total Marks
- Passing Marks
- Academic Year
- Save as Draft (teacher can see but not parents) or Publish (parents see it)

**Manage Exams:**
- List: Name | Class | Subject | Date | Status | Marks Entered %
- Edit exam details (before exam date)
- Publish/Unpublish exam schedule
- View marks entry progress (how many students have marks entered)
- Publish results (after marks are entered and verified)
- Lock/unlock marks for editing

### 9.7 Fee Structure Management

**Create Fee Structure:**
- Select Class (or "All Classes")
- Fee Type: Tuition / Transport / Hostel / Examination / Activity / Library / Uniform / Miscellaneous
- Fee Name / Description
- Amount
- Due Date
- Recurring: Yes/No → if Yes, frequency: Monthly / Quarterly / Annual
- Academic Year
- **On Save:** System auto-generates `fees` records for every student in the selected class(es) for current academic year

**Configure Late Fee:**
- Grace period (days after due date, no late fee)
- Late fee type: Fixed amount OR % per week
- Late fee amount/rate
- A scheduled Supabase Edge Function checks daily and auto-applies late fees to overdue records

**Fee Discounts:**
- Create discount: Name, Type (fixed/percentage), Amount/Rate
- Apply to individual student: Select student → select discount → reason required
- Scholarship: Same as discount but flagged separately

**View Fee Collection:**
- Summary: Collected this month / this year / pending
- Class-wise collection status table
- Defaulter list (overdue > 30 days) with student names and amounts
- Export as Excel

### 9.8 Approval Management

**Teacher Leave Requests:**
- Table: Teacher Name | Leave Type | From–To | Days | Reason | Status
- Actions: Approve (with optional remarks) | Reject (remarks required)
- Approved → teacher notified via push + SMS
- Rejected → teacher notified with reason

**Document Requests:**
- Table: Student Name | Parent | Document Type | Reason | Date Requested
- Actions: Approve + Generate + Upload → set status "ready" → parent notified
- Reject with reason → parent notified
- Generated documents (Bonafide, TC) are PDFs created using @react-pdf/renderer with school letterhead

**Meeting Requests:**
- Table: Parent Name | Teacher | Student | Proposed Dates | Status
- Actions: Confirm (select date/time from proposed options) | Reject
- Confirmed → parent notified via push + SMS

### 9.9 Attendance Analytics (School-Wide)

- School-wide attendance % today (large metric card)
- Class-wise attendance breakdown table + bar chart
- Attendance trend chart (last 30 days, line chart)
- Chronically absent students: List of students absent > 20% of total working days
  - Shows: Name, Class, Section, Absence %, Days Absent, Parent contact
  - Can send alert to parent from this list
- Working day count: Total working days this year (accounting for holidays)
- Monthly attendance report: PDF / Excel export

### 9.10 Academic Monitoring

- Class-wise average marks per exam (heatmap/table)
- Subject-wise average across school
- Top 10 and bottom 10 students (by cumulative average)
- Teacher-wise student performance comparison (anonymized per teacher)
- Pass/fail ratio per subject per exam

### 9.11 HR Management

**Employee Records:**
- All staff listed: teachers + any non-teaching staff added
- Profile with personal + employment details
- Document storage (certificates, IDs — Supabase Storage)

**Leave Balance Configuration:**
- Set annual leave quotas per type per school: e.g., 12 Casual, 10 Sick, 15 Earned
- Tracks used days per teacher per academic year

**Monthly Payroll:**
- For each teacher: Enter salary components (Basic, HRA, TA, DA, Other Allowances, Deductions)
- Net salary auto-calculated
- Save + generate salary slip PDF (download or email to teacher)
- Mark as Paid + enter payment date

### 9.12 School Settings (Principal Level)

- School branding: Update logo, name, contact info
- Notification settings: Enable/disable SMS, Email per event type for the school
- Razorpay configuration: Enter school's Razorpay Key ID + Secret
- SMS gateway: Enter school-level MSG91 sender ID / API key
- Academic year management
- Holiday calendar management (add/remove holidays)
- School timing configuration (start time, end time, working days Mon-Sat or Mon-Fri)
- Feature toggles: Enable AI features (if plan supports), enable WhatsApp

### 9.13 Reports & Exports

- Monthly attendance report (school-wide) → PDF / Excel
- Fee collection report → PDF / Excel
- Academic performance report (per exam, per class) → PDF
- Teacher activity report → PDF
- Annual school report → PDF
- All reports include school logo, name, academic year, generation timestamp

---

## SECTION 10: TEACHER MODULE

**URL:** `/teacher`
**Scope:** Assigned sections and their students only
**Created by:** Principal
**Creates:** Parent accounts, linked to students

### 10.1 Teacher Dashboard

- Today's schedule: List of classes today (time | subject | section | room) from timetable
- Pending attendance widget: Sections where attendance not yet marked today (red alert if any)
- Assignments pending grading (count + list)
- Upcoming exams (next 7 days in teacher's subjects)
- Pending leave request status badge
- Students absent 3+ consecutive days (alert list with parent contact)
- New messages (unread count with sender names)
- Quick actions: [Mark Attendance] [+ Assignment] [Message Parent] [+ Lesson Plan]

### 10.2 Parent Management (TEACHER CREATES PARENTS)

**Add Parent:**
- Select Student (search from teacher's assigned sections' students)
- Parent Full Name (required)
- Relationship: Father / Mother / Guardian / Other
- Phone Number (required — becomes login username)
- Email (optional)
- Occupation (optional)
- Mark as Primary Contact: Yes/No
- Photo (optional)
- **On Save:**
  - User created: `role = 'parent'`, `school_id`, `is_first_login = true`
  - Parent profile created
  - `student_parent_links` record created
  - Credentials: username = phone number, PIN = 6-digit random
  - Credential card shown on screen — printable format
  - Optional: Click "Send via WhatsApp" → opens WhatsApp web/app with pre-filled message containing credentials
  - SMS automatically sent to phone number

**Add Second Parent / Guardian:**
- Same student → add another parent with different relationship
- Same student can have max 2 primary contacts + unlimited guardians

**Parent List:**
- Grouped by student
- Table: Parent Name | Relationship | Phone | Status | Last Login | Actions
- Actions: View | Edit | Reset PIN | Deactivate
- Reset PIN: Generates new 6-digit PIN → shown on screen + optional SMS

### 10.3 Attendance Management

**Mark Attendance:**
- Select Section (from assigned sections)
- Date defaults to today (can only select today OR past dates up to 7 days back without special permission)
- Alert if attendance already marked for this section + date (with option to enter edit mode)
- Student list for that section in roll number order
- Each student has toggle: [P] Present | [A] Absent | [L] Late | [E] Excused
- "Mark All Present" button (useful for quick marking, then adjust exceptions)
- Submit → `attendance` records created for each student
- Students marked absent or late → their parents receive push notification + SMS
- Cannot mark attendance for a section not assigned to this teacher

**Edit Attendance:**
- Can edit past 7 days freely
- Edit beyond 7 days → locked; shows message "Request Principal to unlock"
- Edit requires reason (stored in remarks field)

**Attendance Report (Teacher View):**
- Section monthly attendance calendar view
- Student-wise attendance % for the month
- Students below 75% attendance — highlighted
- Export section monthly attendance report as Excel

**Student Attendance History:**
- View individual student's full attendance history
- Filter by month / term

### 10.4 Assignment Management

**Create Assignment:**
- Title (required)
- Subject (dropdown — teacher's assigned subjects)
- Section (dropdown — teacher's assigned sections, filtered by selected subject)
- Description / Instructions (rich text basic — bold, italic, bullet points)
- Deadline (date + time picker — must be future date)
- Maximum Marks (optional)
- Attach files: multiple files allowed, max 5 per assignment, max 10MB each, types: PDF/DOCX/JPG/PNG
  - Files uploaded to Supabase Storage
- Save as Draft (not visible to parents) OR Publish (visible immediately + parents notified)

**Assignment List:**
- Table: Title | Subject | Section | Deadline | Submitted/Total | Status | Actions
- Filters: Subject, Section, Status
- Actions: Edit | Extend Deadline | Gradesubmissions | Delete
- Overdue assignments highlighted

**Grade Submissions:**
- List of all students in section with submission status
- For each student:
  - Status: Submitted / Late / Not Submitted
  - View submitted files (open in viewer/new tab)
  - Enter marks (0 to max_marks — validated)
  - Enter remarks
  - Save grade
- Bulk actions: Mark all unsubmitted as "Not Submitted"
- After grading: Parent can see grade in assignment section

### 10.5 Marks Entry

**Exams are scheduled by Principal. Teacher enters marks.**

**Enter Marks:**
- Exam list shows only exams for teacher's subjects that are published and upcoming/past
- Select exam → student list for relevant section appears
- For each student:
  - Marks field (numeric, validated 0 to total_marks)
  - Absent checkbox (marks field disabled if absent)
  - Remarks (optional)
- Save as Draft (not visible to parents) OR Submit Final
- Once submitted: Locked for editing (Principal must unlock)
- Progress saved automatically every 30 seconds

### 10.6 Student Management (Classroom Level)

**Student List (Teacher's Sections):**
- All students in teacher's assigned sections
- Search by name or roll number
- View full student profile

**Student Profile (Teacher View):**
- Personal info
- Attendance history + % (current year)
- Marks across exams in teacher's subjects
- Assignment completion rate
- Remarks by all teachers (visible to this teacher)
- Parent contact info with click-to-message

**Add Remarks:**
- Remark Type: Behavior Positive / Behavior Concern / Academic / Achievement
- Remark text
- Is visible to parent: Yes / No toggle
- Date (default: today)

### 10.7 Lesson Planning

**Create Lesson Plan:**
- Week (date picker — auto-selects week's Monday)
- Subject + Section
- Topics covered this week (text area)
- Learning objectives
- Teaching resources / methods used
- Homework assigned
- Status: Planned / Completed
- Submit for Principal review (optional toggle)

**Syllabus Tracking:**
- Upload syllabus document per subject (PDF)
- Mark topics as covered
- See % syllabus completion
- Principal can view completion status

### 10.8 Communication

**Parent Chat:**
- Select student → see linked parents
- Select parent → open 1:1 chat window
- Real-time messaging (Supabase Realtime subscription)
- Text messages + file attachments (images, PDF — max 5MB)
- Read receipts (double tick when read)
- Message history paginated (infinite scroll)
- Unread message badge on teacher's sidebar

**Send Announcement to Section:**
- Title, content
- Select section(s)
- Urgency: Normal / Urgent
- Attach file (optional)
- Send → push notification to all parents of that section

**Schedule Meeting:**
- Select parent
- Propose date + time
- Reason
- Message sent to parent — they can confirm or counter-propose from their app

### 10.9 Resource Sharing

**Upload Resource:**
- Title, description
- Subject + Section
- Type: Notes / Video / Worksheet / Presentation / External Link
- Upload file OR paste external URL
- Publish toggle
- Published resources visible to parents in their resources section

### 10.10 Leave Management

**Apply Leave:**
- Leave Type: Sick / Casual / Earned / Emergency / Maternity / Paternity / Other
- From Date, To Date (total days calculated automatically)
- Reason (text area)
- Attach document (medical certificate for sick leave — uploaded to Supabase Storage)
- Submit → Principal receives notification

**Leave Status Tracking:**
- View all leave requests with status
- Cancel pending requests (before Principal acts)
- Leave balance per type (remaining days)

### 10.11 Timetable View

- Teacher's own weekly timetable (which class, which subject, which room, what time)
- Exam schedule for teacher's subjects (upcoming exams)

---

## SECTION 11: PARENT MODULE

**URL:** `/parent`
**Scope:** Own child(ren) data only
**Created by:** Teacher
**Login:** Phone number + PIN (or OTP)

### 11.1 Parent Dashboard

- **Child Selector** (top bar): If parent has multiple children in same school, toggle between them
- For selected child:
  - Today's attendance: Large badge — PRESENT ✅ / ABSENT ❌ / LATE 🕐 (real-time)
  - Attendance this month: Progress ring (e.g., 22/25 days = 88%)
  - Fee dues widget: Total pending amount + nearest due date + "Pay Now" button
  - Upcoming assignments: Count with nearest deadline
  - Upcoming exams: Count with nearest date
  - Latest announcement (1 card)
  - Unread messages badge from teacher
  - Last exam performance: Subject-wise mini chart
  - Recent remarks from teacher
- Notifications bell (top-right) showing count

### 11.2 Attendance Section

**Monthly Calendar View:**
- Calendar with color-coded dates:
  - Green: Present
  - Red: Absent
  - Yellow: Late
  - Blue: Excused
  - Grey: Holiday / Non-working day
  - White: Future date

**Attendance Statistics:**
- This month: % present (present / total working days in month so far)
- This term: % present
- This year: % present
- Total days absent (count with list)
- Total late arrivals (count)

**Absence Details:**
- List of each absent date with teacher's remarks if any

**Notifications received (automatic — no action needed):**
- When child marked absent: Push + SMS within 5 minutes of teacher marking
- When child marked late: Push notification
- Weekly summary every Monday morning: "Your child attended X out of Y working days this week"

**Leave Application:**
- Parent can submit leave request for child
- Date range + reason
- Teacher receives notification → marks attendance as "excused" for those dates
- Status tracked (Pending / Approved)

### 11.3 Academics Section

**Exam Schedule:**
- List of upcoming + past exams
- Subject, date, time, duration, total marks
- Venue/room (if provided)

**Marks & Results:**
- Select exam from list (only published results visible)
- Subject-wise table: Subject | Marks Obtained | Total Marks | % | Grade | Teacher Remarks
- Overall percentage and grade for that exam
- Pass/Fail status

**Performance Trends:**
- Line chart: Subject-wise marks across exams (x-axis = exam, y-axis = marks %)
- Overall trend line
- Class average comparison (shown as a reference line — no individual student names)

**Report Cards:**
- List of published report cards (grouped by term/exam group)
- View formatted report card (school letterhead, photo, marks table, attendance, remarks, AI summary)
- Download as PDF

**AI Performance Summary (on report card):**
- 2-3 paragraph AI-generated summary
- Identifies strengths, improvement areas, attendance note
- Encouraging, constructive language
- Example: "Priya has demonstrated exceptional aptitude in Mathematics and Science, consistently scoring above 85%. English requires focused attention, particularly in essay writing and grammar. Maintaining the current attendance of 94% will further support academic growth."

**AI Parent Assistant:**
- "Ask AI" chat button on academics page
- Parent types question in natural language (English or Hinglish):
  - "Why did my child score low in Science?"
  - "Which subject needs the most focus?"
  - "How does attendance affect grades?"
  - "What should my child study this week?"
- AI receives child's marks, attendance, remarks, assignment data as context
- Answers conversationally, accurately, based on real data
- Guardrail: AI only answers academic-related questions. Off-topic questions redirected.
- Powered by Anthropic Claude API (Haiku model for cost efficiency)

**Assignments:**
- List: Title | Subject | Deadline | Status (Submitted/Not Submitted/Graded)
- Marks received after grading
- Teacher feedback / remarks
- Download assignment question PDF

### 11.4 Fee Management

**Fee Overview:**
- Total pending dues (highlighted if any overdue)
- List of all pending fees:
  - Fee type + name
  - Amount
  - Due date (color-coded: red if overdue, orange if due within 7 days, normal if future)
  - Late fee added (if any)
  - Total payable
  - "Pay Now" button per fee OR select multiple and "Pay Selected"

**Online Payment (Razorpay):**
1. Parent selects fee(s) → clicks "Pay Now"
2. Payment summary shown (fee name, amount, late fee, total)
3. "Proceed to Pay" button
4. Razorpay checkout opens in overlay (supports: UPI, Credit/Debit Card, Netbanking, Wallets)
5. On payment success:
   - Razorpay webhook confirms payment server-side
   - `fee_payments` record created, `fees.status` updated to "paid"
   - PDF receipt auto-generated and stored
   - Parent sees "Payment Successful" screen with receipt preview
   - Push notification + Email confirmation sent
6. On payment failure:
   - Error message with reason
   - Option to retry

**Payment History:**
- All past payments in reverse chronological order
- Table: Date | Fee Type | Amount | Mode | Receipt No. | Actions
- "Download Receipt" button opens/downloads PDF receipt

**Fee Structure (Info Only):**
- View annual fee structure for child's class
- All fee types and amounts for the year

**Smart Reminders (fully automated — no parent action needed):**
- 7 days before due date: Push notification + SMS — "Fee of ₹X is due on [date]"
- 3 days before: Push + SMS + Email
- On due date: Push + SMS + Email — "Fee is due today"
- 1 day after: Push + SMS — "Your fee is overdue. Pay now to avoid late charges."
- Daily until paid (max 7 days) then weekly: Push notification
- Late fee applied notification: "₹X late fee has been added to your pending fee"

### 11.5 Communication

**Teacher Chat:**
- List of teachers linked to child's sections (class teacher + subject teachers)
- Open chat with any teacher
- Real-time messaging (Supabase Realtime)
- Text + photo/document attachment (max 5MB)
- Read receipts

**Announcements:**
- School-wide announcements (created by Principal)
- Section announcements (created by class teacher)
- Urgent announcements shown with red banner at top
- Mark as read

**Request Meeting:**
- Select teacher
- Enter reason for meeting
- Propose up to 2 date/time options
- Submit → teacher notified
- Track: Pending / Confirmed (shows confirmed time) / Rejected (shows reason) / Completed

**Submit Feedback:**
- General school feedback form
- Rating (1-5 stars) + text
- Anonymous option
- Feedback goes to Principal dashboard

### 11.6 Timetable

- Child's weekly class timetable view (read-only)
- Exam timetable (published exams for child's class)
- Color-coded by subject

### 11.7 Documents

**Student ID Card:**
- Auto-generated PDF with: School logo, student photo, name, class, section, admission number, school address, academic year, QR code
- "Download ID Card" button

**Request Document:**
- Select document type: Bonafide Certificate / Transfer Certificate / Character Certificate / Migration Certificate / Provisional Certificate
- Enter reason (required)
- Submit → Principal notified
- Track status: Pending → Processing → Ready → Delivered
- When status = "Ready": Download button appears, push + SMS notification sent

**Download Progress Reports:**
- Published report cards as PDF downloads

### 11.8 School Calendar

- Monthly calendar view (navigate months)
- Event types color-coded:
  - Red: Exam
  - Green: Holiday
  - Blue: School Event (sports day, cultural fest)
  - Purple: PTM (Parent-Teacher Meeting)
  - Orange: Other events
- Tap event → see details
- "Add to Google Calendar" option (generates .ics export)

### 11.9 Profile & Settings

- View/edit: Full name, email (phone cannot be changed — it's the username)
- Change PIN (enter current PIN → enter new PIN → confirm new PIN)
- Notification preferences:
  - Toggle per event type: Attendance alerts, Fee reminders, Exam notifications, Announcements
  - Toggle per channel: Push, SMS, Email (SMS toggles may be school-managed)
- Children linked: Shows all linked children with class and section info

---

## SECTION 12: NOTIFICATION SYSTEM

### Channels
1. **In-App** (notification bell, notification center) — all users, always enabled
2. **Push Notifications** via Firebase Cloud Messaging — requires FCM setup, works on web + future mobile
3. **SMS** via MSG91 — critical events only, India-focused
4. **Email** via Resend — receipts, credentials, formal communications
5. **WhatsApp** — Phase 2 only (WhatsApp Business API has cost and verification requirements)

### Notification Events

| Event | In-App | Push | SMS | Email | Who Receives |
|---|---|---|---|---|---|
| Child marked absent | ✅ | ✅ | ✅ | ❌ | Parent |
| Child marked late | ✅ | ✅ | ❌ | ❌ | Parent |
| New assignment posted | ✅ | ✅ | ❌ | ❌ | Parent |
| Assignment deadline tomorrow | ✅ | ✅ | ❌ | ❌ | Parent |
| Exam schedule published | ✅ | ✅ | ✅ | ❌ | Parent |
| Exam result published | ✅ | ✅ | ✅ | ✅ | Parent |
| Fee due in 7 days | ✅ | ✅ | ✅ | ❌ | Parent |
| Fee due in 3 days | ✅ | ✅ | ✅ | ✅ | Parent |
| Fee overdue | ✅ | ✅ | ✅ | ✅ | Parent |
| Fee payment successful | ✅ | ✅ | ❌ | ✅ | Parent |
| Document request ready | ✅ | ✅ | ✅ | ❌ | Parent |
| New message from teacher | ✅ | ✅ | ❌ | ❌ | Parent |
| Meeting confirmed/rejected | ✅ | ✅ | ✅ | ❌ | Parent |
| New announcement | ✅ | ✅ | ❌ | ❌ | Parent |
| Leave approved/rejected | ✅ | ✅ | ✅ | ❌ | Teacher |
| Principal message | ✅ | ✅ | ❌ | ❌ | Teacher |
| New meeting request | ✅ | ✅ | ❌ | ❌ | Teacher |
| New leave request | ✅ | ✅ | ❌ | ❌ | Principal |
| New document request | ✅ | ✅ | ❌ | ❌ | Principal |
| New student admitted | ✅ | ❌ | ❌ | ❌ | Teacher (class teacher) |
| School access paused | ❌ | ❌ | ✅ | ✅ | Principal |
| Credentials issued | ❌ | ❌ | ✅ | ✅ | New user |

### Notification Implementation
- In-app: Write to `notifications` table → Supabase Realtime subscription on client pushes to bell
- Push: Firebase Admin SDK called from Supabase Edge Functions
- SMS: MSG91 HTTP API called from Supabase Edge Functions
- Email: Resend API called from Supabase Edge Functions
- All notification dispatching goes through a single Edge Function: `dispatch-notification`
  - Takes: `{user_id, event_type, data}` → looks up user channels → sends to relevant channels
- Parent notification preferences respected (if SMS disabled in preferences, skip SMS)

---

## SECTION 13: AI FEATURES

**Provider:** Anthropic Claude API
**Models:** `claude-haiku-4-5` for chatbot (fast + cheap), `claude-sonnet-4-6` for report analysis
**Authentication:** API key stored in Supabase Vault / environment variable (never exposed to client)
**All AI calls go through Supabase Edge Functions** — never from client directly

### 13.1 AI Report Card Summary
**Trigger:** When Principal publishes a report card

**Edge Function receives:**
```json
{
  "student_name": "Priya Sharma",
  "class": "Class 8 A",
  "academic_year": "2024-2025",
  "exam_name": "Mid Term Examination",
  "subjects": [
    {"subject": "Mathematics", "marks": 87, "max_marks": 100, "grade": "A", "remarks": "Excellent problem solving"},
    {"subject": "Science", "marks": 79, "max_marks": 100, "grade": "B+", "remarks": "Good understanding of concepts"},
    {"subject": "English", "marks": 61, "max_marks": 100, "grade": "C+", "remarks": "Writing skills need improvement"},
    {"subject": "Social Studies", "marks": 71, "max_marks": 100, "grade": "B", "remarks": "Satisfactory"}
  ],
  "attendance_percentage": 91,
  "total_percentage": 74.5,
  "previous_exam_percentage": 70.2,
  "assignment_completion_rate": 85
}
```

**System prompt for Claude:**
> "You are a school report card summary generator. Write a 2-3 paragraph performance summary for a student. Be encouraging, constructive, and specific. Mention: overall performance, strongest subjects, subjects needing improvement, attendance, and any notable improvement from previous exam. Write in 3rd person. Keep it suitable for parents to read. Do NOT use bullet points."

**Output stored in** `report_cards.ai_summary` and displayed on the report card PDF and parent app.

### 13.2 AI Parent Assistant Chatbot
**Location:** Parent module → Academics section → "Ask AI" button

**Implementation:**
- Client sends question to Next.js API route `/api/ai/parent-assistant`
- API route fetches student data from Supabase (server-side)
- Calls Anthropic API with student data in system prompt + parent question as user message
- Returns AI response to client
- Stateless: No conversation history (each question is independent)

**System prompt injected with student data:**
```
You are a helpful academic assistant for parents. You have access to the following data about the student {name}, Class {class}:

Attendance: {attendance_percentage}% ({present_days} out of {total_days} days)
Recent exam results: {subject_marks_json}
Assignment completion: {completion_rate}%
Teacher remarks: {recent_remarks}

Answer the parent's question based only on this data. Be helpful, empathetic, and constructive. If the question is not related to academics or this student's data, politely say you can only help with academic questions. Keep responses under 150 words.
```

**Guardrails:**
- If question is off-topic (e.g., "write me a poem"), respond: "I can only help with questions about your child's academic performance, attendance, and assignments."
- Never reveal other students' data

### 13.3 AI Academic Insights (Principal Dashboard)
**Trigger:** Principal visits Analytics dashboard (generated max once per 24 hours, cached)

**Generates:**
- School-wide risk alert: "17 students across 4 sections show both declining marks and attendance below 75%. Immediate intervention recommended."
- Subject concern: "Class 9's average in Physics has dropped 12% since Unit Test 1. Review teaching approach or allocate extra support."
- Positive note: "Class 6A has shown 15% improvement in Mathematics since the new teacher was assigned."
- Attendance pattern: "Monday absences are 40% higher than other days school-wide. Consider if scheduling changes could help."

### 13.4 AI Announcement Drafting (Optional Helper)
- Teacher/Principal types rough notes: "sports day postponed rain facility unavailable new date next friday"
- Clicks "Polish with AI"
- AI rewrites as professional announcement:
  > "Dear Parents, We regret to inform you that the Annual Sports Day, originally scheduled for [original date], has been postponed due to unforeseen weather conditions and unavailability of the facility. The event has been rescheduled to [new date]. We look forward to your continued support and participation. — School Management"
- User can edit before sending

---

## SECTION 14: FEE MANAGEMENT — RAZORPAY INTEGRATION

### Architecture
Each school uses its own Razorpay account (school enters their Key ID + Secret in settings). This ensures money goes directly to the school's bank account.

### Payment Flow (Detailed)

**Backend (Supabase Edge Function: `create-razorpay-order`):**
1. Receives: `{fee_ids[], student_id, school_id}`
2. Fetches school's Razorpay credentials from `schools` table
3. Calculates total amount: sum of selected fees + any applicable late fees
4. Creates Razorpay order via Razorpay API: `POST https://api.razorpay.com/v1/orders`
5. Returns: `{order_id, amount, currency, key_id}` to client

**Client (Parent App):**
1. Loads Razorpay checkout script
2. Opens Razorpay checkout with `{order_id, amount, key_id}`
3. Parent completes payment (UPI / Card / Netbanking / Wallet)
4. On success: Razorpay returns `{payment_id, order_id, signature}` to client
5. Client sends these to backend for verification

**Backend (Supabase Edge Function: `verify-payment`):**
1. Receives `{payment_id, order_id, signature, fee_ids[], student_id}`
2. Verifies Razorpay signature using HMAC-SHA256: `razorpay_order_id|razorpay_payment_id` with secret key
3. If valid:
   - Create `fee_payments` record(s)
   - Update `fees.status = 'paid'`
   - Generate receipt number: `{SCHOOL_CODE}-{YEAR}-{SEQUENCE}`
   - Trigger PDF receipt generation (async)
   - Send confirmation notification to parent
4. If invalid: Return error — payment NOT recorded

**Razorpay Webhook (for reliability):**
- Supabase Edge Function URL registered as Razorpay webhook
- Handles: `payment.captured`, `payment.failed`
- Idempotent: If payment already recorded (from verify step), skip silently
- Handles edge cases: Network failure between payment and verification

### Receipt PDF Format (@react-pdf/renderer)
```
[SCHOOL LOGO]               [SCHOOL NAME]
                            Fee Payment Receipt

Receipt No: SVSPS-2024-0042    Date: 14-Jun-2025
─────────────────────────────────────────────────
Student: Priya Sharma         Class: 8A
Admission No: SVSPS-2021-012  Academic Year: 2024-25
─────────────────────────────────────────────────
Description                              Amount
─────────────────────────────────────────────────
Term 1 Tuition Fee                       ₹8,000
Late Fee                                   ₹200
─────────────────────────────────────────────────
Total Paid                               ₹8,200
─────────────────────────────────────────────────
Payment Mode: UPI
Transaction ID: pay_XXXXXXXXXX
─────────────────────────────────────────────────
[QR CODE]           Authorized Signatory: ________
This is a computer-generated receipt. No signature required.
```

---

## SECTION 15: FILE STORAGE ARCHITECTURE (SUPABASE STORAGE)

### Bucket Structure
```
school-erp/                           (private bucket — signed URLs required)
├── logos/
│   └── {school_id}.png
├── schools/
│   └── {school_id}/
│       ├── students/
│       │   └── {student_id}/
│       │       ├── photo.jpg
│       │       └── documents/
│       ├── assignments/
│       │   └── {assignment_id}/
│       │       └── {filename}
│       ├── submissions/
│       │   └── {submission_id}/
│       ├── resources/
│       │   └── {resource_id}/
│       ├── report_cards/
│       │   └── {report_card_id}.pdf
│       ├── receipts/
│       │   └── {receipt_number}.pdf
│       ├── documents/
│       │   └── {document_request_id}.pdf
│       ├── leave_attachments/
│       └── payroll/
│           └── {payroll_id}_slip.pdf
└── user_photos/
    └── {user_id}.jpg
```

### Access Rules
- All buckets: PRIVATE (no public access)
- Signed URLs: Generated server-side, expire in 1 hour for sensitive docs (IDs, reports), 24 hours for resources
- Max file sizes: Profile photos 2MB | Documents/Assignments 10MB | Videos 50MB
- Allowed file types enforced at upload: Images (jpg, png, webp), Documents (pdf, docx), Videos (mp4, mov) — validate MIME type on server

---

## SECTION 16: REAL-TIME CHAT (SUPABASE REALTIME)

### Setup
- Enable Supabase Realtime on `messages` and `notifications` tables
- Each user subscribes to their own channels on login

### Chat Channel Pattern
```javascript
// Teacher subscribing to messages where they are sender or receiver
const channel = supabase
  .channel(`messages:user:${user.id}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `receiver_id=eq.${user.id}`
  }, (payload) => {
    // Handle new incoming message
  })
  .subscribe()
```

### Chat Rules
- Parent ↔ Teacher: YES (only teachers of child's sections)
- Parent ↔ Principal: NO (parent requests meeting via form)
- Teacher ↔ Principal: YES
- Teacher ↔ Teacher: NO (use announcements)
- Parent ↔ Parent: NO (never)

### Message Features
- Text (max 2000 chars)
- File attachment (1 file per message — image or PDF)
- Read receipts: `is_read = true` + `read_at` timestamp set when receiver opens chat
- Typing indicator: Presence channel (ephemeral — no DB storage)
- Unread count: Count of messages where `receiver_id = current_user AND is_read = false`
- Message list: Paginated (50 messages per page), new messages append in real-time

---

## SECTION 17: NON-FUNCTIONAL REQUIREMENTS

### Performance
- Initial page load (dashboard): < 3 seconds on 4G
- API response (95th percentile): < 500ms
- Student list loading (1000+ students): Use pagination (50 per page) + server-side search
- Fee calculation: Computed in database, not frontend
- Attendance marking: Batch insert (all students at once) — single DB transaction
- Use TanStack Query for caching: All list views cache for 60 seconds, refresh on focus
- Supabase database indexes required:
  ```sql
  CREATE INDEX idx_attendance_student_date ON attendance(student_id, date);
  CREATE INDEX idx_attendance_section_date ON attendance(section_id, date);
  CREATE INDEX idx_fees_student_status ON fees(student_id, status);
  CREATE INDEX idx_marks_exam ON marks(exam_id);
  CREATE INDEX idx_messages_receiver ON messages(receiver_id, is_read);
  CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
  CREATE INDEX idx_students_school_section ON students(school_id, section_id);
  CREATE INDEX idx_users_school_role ON users(school_id, role);
  ```

### Security
- Supabase RLS on ALL tables (not optional — enforced server-side)
- HTTPS only (Vercel enforces this automatically)
- Passwords: Managed by Supabase Auth (bcrypt)
- Razorpay signatures verified server-side before recording payment
- API routes: Validate `Authorization: Bearer {token}` header
- Rate limiting: Implement on auth endpoints (max 10 attempts per IP per 15 minutes)
- Input sanitization: Zod schemas validate all form inputs on both client and server
- File upload: Validate MIME type server-side (not just extension)
- Signed URLs expire after 1 hour — regenerate on demand
- Admin API routes: Additional check `role = 'admin'` beyond RLS

### Data Integrity
- Soft deletes everywhere (add `deleted_at` timestamp — never hard delete student/payment data)
- Audit log for critical actions: credential generation, school pause, role changes, payment records
- Atomic transactions for fee payment: Order creation + payment recording in one Edge Function

### Accessibility
- WCAG 2.1 AA compliance
- All forms keyboard navigable (Tab order, Enter to submit)
- All images have alt text
- Color contrast: Minimum 4.5:1 ratio for text
- Touch targets: Minimum 44×44px (important for mobile browser use before app launch)
- Font size: Minimum 14px for body text, 16px recommended for parent-facing screens

---

## SECTION 18: UI/UX DESIGN SPECIFICATIONS

### Design System

**Color Palette (defaults — customizable per school's branding color in settings):**
- Primary: Deep Blue `#1E40AF`
- Secondary: Teal `#0F766E`
- Success: Green `#16A34A`
- Warning: Amber `#D97706`
- Danger: Red `#DC2626`
- Background: `#F8FAFC` (Slate-50)
- Card background: `#FFFFFF`
- Border: `#E2E8F0`

**Typography:**
- Font: Inter (load from Google Fonts)
- Heading: 700 weight
- Body: 400 weight
- Monospace (IDs, codes): JetBrains Mono

**Component Library:** shadcn/ui (Radix UI primitives + Tailwind)

### Navigation Structure

**Admin Portal:**
- Left sidebar (collapsible): Schools | Principals | Analytics | System Config
- Top bar: Notifications bell | Profile dropdown

**Principal Portal:**
- Left sidebar: Dashboard | Students | Teachers | Academics (Classes / Timetable / Exams) | Fees | HR | Reports | Announcements | Settings
- On mobile browser: Top hamburger menu

**Teacher Portal:**
- Left sidebar: Dashboard | Attendance | Assignments | Marks | Students | Parents | Lesson Plans | Resources | Messages | Leave
- On mobile browser: Bottom tab bar (5 tabs + More)

**Parent Portal:**
- Left sidebar (desktop): Dashboard | Attendance | Academics | Fees | Messages | Documents | Calendar
- On mobile browser / future mobile app: **Bottom tab bar** (5 tabs): Home | Academics | Fees | Messages | More

### Page Templates

**List Page:** Search bar + filter row + table/card list + pagination
**Detail Page:** Breadcrumb + header card + tabbed sections
**Form Page:** Step indicator (if multi-step) + labeled fields + validation messages inline + submit/cancel
**Dashboard:** Stats row (4 metric cards) + charts row + recent activity list + quick actions

---

## SECTION 19: MOBILE READINESS RULES

These rules MUST be followed during web development so React Native migration is minimal:

**Rule 1: No business logic in React components**
- Components only render and call hooks
- All data logic in `packages/shared/hooks/` or `packages/supabase/queries/`

**Rule 2: No Next.js-specific imports in shared packages**
- `packages/shared/*` and `packages/supabase/*` must NEVER import from `next/` or `next-auth/`
- These packages use only: React, Zod, Supabase, Zustand, TanStack Query

**Rule 3: Touch-first interaction design**
- No hover-only interactions (use onClick)
- All click targets ≥ 44×44px
- Swipe gestures: Plan for them (React Native uses swipe naturally)
- Date pickers: Use native date inputs (easy to swap for RN date pickers)

**Rule 4: Zustand stores are mobile-ready**
- All client state in Zustand stores (not React Context except theme)
- Stores live in `packages/shared/stores/` — identical import on mobile

**Rule 5: TanStack Query hooks are mobile-ready**
- All server state fetching via `useQuery` / `useMutation` hooks
- Cache configuration identical on mobile

**Rule 6: Avoid Web-only APIs in shared code**
- No `window`, `document`, `localStorage` in `packages/shared/*`
- Use Supabase client for persistence (works in RN)
- For web-only features (clipboard, download), wrap in platform-specific utility files

**React Native — What Changes vs What Stays:**
```
STAYS THE SAME:                         CHANGES:
────────────────────────────────────    ────────────────────────────────────
Supabase client + all queries           <div> → <View>
Zustand stores                          <p>, <span> → <Text>
TanStack Query hooks                    <img> → <Image>
Zod validation schemas                  <input> → <TextInput>
TypeScript types                        Tailwind CSS → NativeWind
Business logic utils                    shadcn/ui → Custom RN components
Constants and enums                     Next.js Router → Expo Router
Authentication flow logic               localStorage → AsyncStorage
Fee calculation logic                   Browser fetch → Same (RN supports it)
```

---

## SECTION 20: SUPABASE EDGE FUNCTIONS LIST

All server-side logic beyond simple CRUD goes in Supabase Edge Functions (Deno/TypeScript):

| Function Name | Trigger | Purpose |
|---|---|---|
| `generate-credentials` | Called by app | Generate secure credentials, create user in Supabase Auth + users table, send SMS/email |
| `create-razorpay-order` | HTTP POST | Create Razorpay order for fee payment |
| `verify-payment` | HTTP POST | Verify Razorpay signature + record payment + update fee status |
| `razorpay-webhook` | Razorpay webhook | Handle payment events from Razorpay (fallback reliability) |
| `generate-fee-records` | DB trigger on fee_structures | Auto-create fee records for all students when fee structure is saved |
| `apply-late-fees` | Scheduled (daily) | Check overdue fees, apply late fee charges per configuration |
| `send-fee-reminders` | Scheduled (daily) | Send reminders 7, 3, 0 days before due date and daily after overdue |
| `dispatch-notification` | Called by app | Route notification to correct channels (in-app, push, SMS, email) |
| `generate-attendance-stats` | Scheduled (nightly) | Pre-calculate attendance % and cache in materialized view |
| `ai-report-summary` | Called when Principal publishes report card | Call Anthropic API with student data, store AI summary in report_cards table |
| `generate-pdf-receipt` | Called after payment verified | Generate fee receipt PDF using @react-pdf/renderer, upload to Supabase Storage |
| `generate-id-card` | Called on demand | Generate student ID card PDF, store in Supabase Storage |
| `generate-report-card-pdf` | Called when Principal publishes | Generate formatted report card PDF with AI summary |
| `check-school-subscription` | Scheduled (daily) | Check expiring subscriptions, notify admin, auto-pause if expired |

---

## SECTION 21: ENVIRONMENT VARIABLES

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # Server-side only — NEVER expose to client

# Firebase (Push Notifications)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
FIREBASE_ADMIN_SDK_JSON=            # Service account JSON for server-side push

# SMS
MSG91_AUTH_KEY=
MSG91_SENDER_ID=
MSG91_TEMPLATE_IDS=                 # JSON object mapping event types to template IDs

# Email
RESEND_API_KEY=

# AI
ANTHROPIC_API_KEY=

# App Config
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_APP_NAME="School ERP"

# Note: Razorpay keys are per-school and stored encrypted in the schools table
# They are fetched server-side only — never in client environment variables
```

---

## SECTION 22: DEPLOYMENT

### Web
- **Frontend:** Vercel (connect GitHub repo, auto-deploy on push to main)
- **Database:** Supabase (Pro plan for production — required for daily backups + no pausing)
- **Domain:** Configure custom domain in Vercel + Supabase allowed origins
- **Environment:** Set all env vars in Vercel project settings

### Supabase Configuration Checklist
- [ ] Enable RLS on ALL tables
- [ ] Create all database indexes
- [ ] Enable Supabase Realtime on: `messages`, `notifications`, `attendance`
- [ ] Set up Supabase Storage buckets with correct policies
- [ ] Deploy all Edge Functions
- [ ] Set up Supabase Vault for sensitive secrets (Razorpay school keys)
- [ ] Enable daily automated backups
- [ ] Configure allowed domains for CORS

### CI/CD
- GitHub Actions: Run tests + lint on pull requests
- Vercel: Auto-deploy on merge to main
- Supabase CLI: Migrations versioned in `supabase/migrations/` folder

---

## SECTION 23: IMPLEMENTATION PHASES

### Phase 1 — Foundation (Weeks 1-4)
- [ ] Monorepo setup with Turborepo
- [ ] Supabase project + complete schema migration
- [ ] All RLS policies
- [ ] Authentication: School selection + role selection + login UI for all roles
- [ ] Forced password change on first login
- [ ] Admin: Create school, create principal, view schools list, pause/resume
- [ ] Credential generation + SMS dispatch
- [ ] Basic placeholder dashboards for all 4 roles
- [ ] School pause enforcement (middleware check)

### Phase 2 — Academic Structure + Attendance (Weeks 5-8)
- [ ] Principal: Academic year, classes, sections, subjects
- [ ] Principal: Timetable with conflict detection
- [ ] Principal: Student admissions
- [ ] Principal: Add teacher, assign to sections
- [ ] Teacher: Parent account creation + student-parent linking
- [ ] Teacher: Attendance marking (daily)
- [ ] Parent: View attendance + calendar view
- [ ] Notification: Absent alert to parent (push + SMS)
- [ ] Leave management (teacher apply + principal approve)

### Phase 3 — Academics + Assignments (Weeks 9-11)
- [ ] Teacher: Create/manage/grade assignments
- [ ] Parent: View assignments + submission status
- [ ] Principal: Create exam schedule
- [ ] Teacher: Enter marks
- [ ] Principal: Publish results
- [ ] Parent: View marks + performance trends
- [ ] Report card generation (PDF)
- [ ] Principal: Publish report cards
- [ ] Parent: View and download report cards

### Phase 4 — Fees + Communication (Weeks 12-14)
- [ ] Principal: Fee structure creation → auto-generate student fee records
- [ ] Principal: Discounts, late fee configuration
- [ ] Parent: View fees + Razorpay online payment
- [ ] PDF receipt generation
- [ ] Automated fee reminders (scheduled Edge Functions)
- [ ] Real-time parent-teacher chat (Supabase Realtime)
- [ ] Announcements system
- [ ] Meeting request system
- [ ] Document requests (Bonafide, TC)

### Phase 5 — Analytics, AI + Polish (Weeks 15-17)
- [ ] Principal analytics dashboard (full charts)
- [ ] AI report card summary (Anthropic API integration)
- [ ] AI parent assistant chatbot
- [ ] AI academic insights for principal
- [ ] HR module (payroll, salary slips)
- [ ] All PDF exports (reports, attendance, ID cards)
- [ ] Resource sharing (teacher uploads notes/videos)
- [ ] School calendar + events
- [ ] Performance optimization + loading states
- [ ] Error handling + empty states for all screens
- [ ] Full end-to-end testing

### Phase 6 — Mobile App (Future)
- [ ] React Native + Expo project setup in `apps/mobile/`
- [ ] Install NativeWind
- [ ] Build mobile-specific UI components (using shared logic from packages)
- [ ] All 4 role portals on mobile
- [ ] Expo push notifications setup
- [ ] App Store + Play Store submission

---

## SECTION 24: IMPORTANT IMPLEMENTATION NOTES

1. **School Code is critical:** It appears in all usernames. Once set, it should NOT be changeable (would break all existing logins). Warn Admin when creating.

2. **Academic Year scoping:** Every list query (students, exams, fees, timetable) MUST include `academic_year_id = current_year_id` filter. Stale data from previous years should never show in active views unless specifically in "historical" sections.

3. **Attendance calculation denominator:** Attendance % = (present + late) / total_working_days × 100. Working days = total school days MINUS holidays in the `holidays` table. This calculation must exclude Sundays and holidays.

4. **Receipt number generation:** Must be sequential and non-repeating per school. Use a Supabase sequence per school or a counter table to avoid race conditions.

5. **Razorpay keys per school:** Never log or expose these. Store encrypted in DB using Supabase Vault or pgcrypto. Only decrypt in Edge Functions server-side.

6. **Parent can have children in multiple sections:** The parent portal shows a child switcher. All queries must use `student_id` from the currently selected child.

7. **Teacher can belong to multiple sections:** A teacher might teach English in Class 8A and 8B. Their section list and student list must aggregate across all assigned sections.

8. **Timetable conflict is non-negotiable:** A teacher physically cannot be in two places at once. The system must enforce this. Check before save, not just display warning.

9. **AI features are gracefully optional:** If Anthropic API fails or is not configured, the report card still works — just without the AI summary. Never block core functionality on AI availability.

10. **SMS is for Indian phone numbers:** Use +91 country code prefix. MSG91 templates must be pre-approved by DLT (Distributed Ledger Technology) as per TRAI regulations in India. Plan for DLT registration early.
```

---

*End of School ERP Management System — Master Development Prompt*
*Version 2.0 | All logical issues corrected | Web-first + React Native ready | Supabase + Next.js*
