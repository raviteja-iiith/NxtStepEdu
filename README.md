<div align="center">

# 🎓 NxtStepEdu — School ERP Platform

**A full-stack, cloud-native School ERP system built for K-12 institutions in India.**  
Manage students, teachers, parents, timetables, fees, attendance, and academics — all in one place.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-EF4444?logo=turborepo)](https://turbo.build/)
[![Capacitor](https://img.shields.io/badge/Capacitor-Android-119EFF?logo=capacitor)](https://capacitorjs.com/)

</div>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Portals & Roles](#portals--roles)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the App](#running-the-app)
- [Bulk Import System](#bulk-import-system)
- [Automated Timetable Engine](#automated-timetable-engine)
- [Mobile App (Android)](#mobile-app-android)
- [Contributing](#contributing)

---

## Overview

NxtStepEdu is a comprehensive, role-based School ERP built for Indian K-12 schools. It replaces physical registers, WhatsApp groups, and spreadsheets with a unified digital platform. The system features three dedicated portals — **Principal**, **Teacher**, and **Parent** — each with role-specific functionality and access control enforced at the database level via Supabase Row-Level Security (RLS).

---

## Key Features

### 🏫 Principal Portal
| Module | Description |
|---|---|
| **Dashboard** | Live stats — total students, teachers, attendance rate, fee collection |
| **Student Management** | Admit students one-by-one or bulk import via Excel template |
| **Teacher Management** | Manage teacher profiles and assign class teachers |
| **Classes & Sections** | Create academic years, classes, and sections |
| **Subject Management** | Define subjects with per-section teacher assignments |
| **Timetable Generator** | Automated, conflict-free timetable generation with priority subject support |
| **Attendance Reports** | Section-wise, day-wise attendance overview |
| **Fee Management** | Define fee structures, record payments, track pending dues |
| **Exam & Marks** | Create exams and view consolidated results |
| **Announcements** | Broadcast school-wide announcements to parents and teachers |
| **Leave Approvals** | Approve or reject teacher leave requests |
| **Question Bank** | Create and manage exam question banks |
| **HR Management** | Staff records and management |
| **Reports** | Academic and financial report generation |
| **Parent Management** | View, link, and bulk import parent accounts |

### 👩‍🏫 Teacher Portal
| Module | Description |
|---|---|
| **Dashboard** | Today's timetable, attendance summary, pending tasks |
| **Attendance** | Mark student attendance period-by-period |
| **Marks** | Enter exam marks per student per subject |
| **Lesson Plans** | Document and track weekly lesson plans |
| **Assignments** | Create and manage student assignments |
| **Resources** | Upload and share teaching materials |
| **Leave Management** | Apply for leave with reason and date range |
| **Messages** | Direct messaging with parents |
| **Student Profiles** | View student academic profiles |

### 👨‍👩‍👧 Parent Portal
| Module | Description |
|---|---|
| **Dashboard** | Child's attendance, recent marks, fee status at a glance |
| **Attendance** | Full attendance history with percentage |
| **Academics** | Subject-wise marks and academic performance |
| **Fees** | Fee balance, payment history, due dates |
| **Calendar** | School events and holiday calendar |
| **Documents** | Download circulars and school documents |
| **Messages** | Message teachers directly |
| **Multi-Child Support** | Switch between multiple children with one tap |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **UI Library** | [React 19](https://react.dev/) |
| **Database** | [PostgreSQL](https://www.postgresql.org/) via [Supabase](https://supabase.com/) |
| **Auth** | Supabase Auth (email/password, role-based) |
| **State Management** | React hooks + [Zustand](https://zustand-demo.pmnd.rs/) |
| **Data Fetching** | [TanStack Query v5](https://tanstack.com/query/latest) |
| **Charts** | [Recharts](https://recharts.org/) |
| **Forms** | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |
| **Excel I/O** | [SheetJS (xlsx)](https://sheetjs.com/) |
| **PDF Generation** | [pdf-lib](https://pdf-lib.js.org/) |
| **Monorepo** | [Turborepo](https://turbo.build/) |
| **Mobile** | [Capacitor](https://capacitorjs.com/) (Android) |
| **Styling** | Inline CSS (custom design system) |

---

## Project Structure

```
NxtStepEdu/
├── apps/
│   └── web/                        # Main Next.js web application
│       ├── src/
│       │   └── app/
│       │       ├── principal/      # Principal portal pages
│       │       │   ├── dashboard/
│       │       │   ├── students/
│       │       │   ├── teachers/
│       │       │   ├── classes/
│       │       │   ├── subjects/
│       │       │   ├── timetable/  # Automated timetable engine
│       │       │   ├── attendance/
│       │       │   ├── fees/
│       │       │   ├── marks/
│       │       │   ├── exams/
│       │       │   ├── announcements/
│       │       │   ├── parents/
│       │       │   ├── hr/
│       │       │   ├── reports/
│       │       │   └── question-bank/
│       │       ├── teacher/        # Teacher portal pages
│       │       │   ├── dashboard/
│       │       │   ├── attendance/
│       │       │   ├── marks/
│       │       │   ├── lesson-plans/
│       │       │   ├── assignments/
│       │       │   ├── resources/
│       │       │   ├── leave/
│       │       │   └── messages/
│       │       ├── parent/         # Parent portal pages
│       │       │   ├── dashboard/
│       │       │   ├── attendance/
│       │       │   ├── academics/
│       │       │   ├── fees/
│       │       │   ├── calendar/
│       │       │   ├── documents/
│       │       │   └── messages/
│       │       ├── api/            # Next.js API routes
│       │       └── login/
│       └── public/
│           └── Student_Import_Template.xlsx
├── packages/                       # Shared packages (future)
├── supabase/
│   └── migrations/                 # Database migration files
├── Student_Import_Template.xlsx    # Excel template for bulk student import
└── turbo.json
```

---

## Portals & Roles

The system enforces role-based access at two levels:

1. **Application Level** — Next.js middleware redirects users to their correct portal based on their role stored in the `users` table.
2. **Database Level** — Supabase Row-Level Security (RLS) policies ensure users can only read/write data belonging to their own school and role.

| Role | Login | Portal URL |
|---|---|---|
| `principal` | Email + Password | `/principal/dashboard` |
| `teacher` | Email + Password | `/teacher/dashboard` |
| `parent` | Phone Number + PIN | `/parent/dashboard` |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [npm](https://www.npmjs.com/) v10+
- A [Supabase](https://supabase.com/) project (free tier works)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/raviteja-iiith/NxtStepEdu.git
cd NxtStepEdu

# 2. Install all dependencies (installs for all apps in the monorepo)
npm install
```

---

## Environment Variables

Create a file at `apps/web/.env.local` with the following:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# App Config
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="School ERP"

# Database (for migrations/scripts)
DATABASE_URL=your_postgres_connection_string
```

> **⚠️ Important:** Never commit `.env.local` to version control. It is already listed in `.gitignore`.

You can find these values in your Supabase project under:  
`Project Settings → API`

---

## Database Setup

The database schema and RLS policies are defined in the SQL files in the root directory. Run them in Supabase's SQL editor in this order:

1. Run `supabase/migrations/` files in chronological order.
2. Apply `fix-rls-policies.sql` to set up Row-Level Security.
3. Apply `notifications-migration.sql` for the notification system.
4. Apply `question-bank-migration.sql` for the question bank.
5. Apply `supplemental-migrations.sql` for any additional schema changes.

```bash
# Or use the Supabase CLI if you have it set up
supabase db push
```

---

## Running the App

```bash
# Start the development server (runs all apps in the monorepo)
npm run dev

# Or run only the web app
npm run dev:web
```

The app will be available at **http://localhost:3000**

---

## Bulk Import System

NxtStepEdu supports Excel-based bulk import for both students and parents using a master template.

### Download the Template
From the app: **Principal → Students → Bulk Import → Download .xlsx**

Or use the file `Student_Import_Template.xlsx` in the project root.

### Template Sheets

| Sheet | Purpose |
|---|---|
| **Sheet 1 — Students** | Core student info (name, DOB, gender, class, section, admission no, PEN) |
| **Sheet 2 — Student Fees** | Fee records per student |
| **Sheet 3 — Parents** | Parent accounts (name, phone, relationship) |
| **Sheet 4 — Parent-Student Links** | Links parents to students via Admission No + Phone |
| **Sheet 5 — Instructions** | Detailed fill guide |

### Important Rules
- Phone numbers in Sheet 3 must be **exactly 10 digits** — this becomes the parent's login ID.
- Date of Birth must be in **YYYY-MM-DD** format or a proper Excel date cell.
- Do **not** fill the Admission Date column — it auto-fills with today's date.
- Class Name and Section Name must exactly match what exists in the system.

---

## Automated Timetable Engine

The timetable generator (`apps/web/src/app/principal/timetable/page.tsx`) uses a **constraint-satisfying backtracking algorithm** to automatically create a conflict-free weekly timetable.

### How it works:
1. **Class Teacher** is always locked to Period 1 across all days.
2. **Priority (⭐ Starred) subjects** are assigned to dedicated early period columns using backtracking search to minimize teacher conflicts.
3. **Regular subjects** are packed into the remaining period columns based on their configured Periods/Week.
4. **Cross-section conflict detection** prevents the same teacher from being scheduled in two different classes at the same time.
5. The generated schedule shows real-time **error and warning banners** explaining any conflicts or adjustments made.

### Configuration Options
- Periods per day (4–12)
- Days per week (5–6)
- School start time
- Period duration (minutes)
- Break position (after which period)
- Per-subject Periods/Week
- Priority (starred) subject flagging

---

## Mobile App (Android)

The web app is wrapped as a native Android app using [Capacitor](https://capacitorjs.com/).

```bash
# Build the web app first
cd apps/web
npm run build

# Sync to Android
npx cap sync android

# Open in Android Studio
npx cap open android
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a Pull Request

---

<div align="center">
  <p>Built with ❤️ for Indian K-12 Schools</p>
  <p><strong>NxtStepEdu</strong> — Digitizing School Operations, One Click at a Time</p>
</div>
