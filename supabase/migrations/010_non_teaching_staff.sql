-- ============================================================
-- Migration 010: Non-Teaching Staff Support
-- Run in Supabase SQL Editor
-- Adds: staff_members, staff_salary_structures, staff_payroll
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Non-teaching staff registry (no auth.users dependency)
--    Drivers, cleaners, security guards, peons, etc.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id),
  full_name     TEXT NOT NULL,
  designation   TEXT NOT NULL,  -- 'Driver', 'Cleaner', 'Security Guard', etc.
  department    TEXT,            -- 'Transport', 'Housekeeping', etc.
  phone         TEXT,
  email         TEXT,
  joining_date  DATE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_members_select" ON staff_members;
DROP POLICY IF EXISTS "staff_members_insert" ON staff_members;
DROP POLICY IF EXISTS "staff_members_update" ON staff_members;
DROP POLICY IF EXISTS "staff_members_delete" ON staff_members;

CREATE POLICY "staff_members_select" ON staff_members FOR SELECT USING (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);
CREATE POLICY "staff_members_insert" ON staff_members FOR INSERT WITH CHECK (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);
CREATE POLICY "staff_members_update" ON staff_members FOR UPDATE USING (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);
CREATE POLICY "staff_members_delete" ON staff_members FOR DELETE USING (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);

-- ────────────────────────────────────────────────────────────
-- 2. Salary structures for non-teaching staff
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_salary_structures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id),
  staff_member_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  basic           NUMERIC NOT NULL DEFAULT 0,
  hra             NUMERIC NOT NULL DEFAULT 0,
  ta              NUMERIC NOT NULL DEFAULT 0,
  da              NUMERIC NOT NULL DEFAULT 0,
  other_allowance NUMERIC NOT NULL DEFAULT 0,
  deductions      NUMERIC NOT NULL DEFAULT 0,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, staff_member_id)
);

ALTER TABLE staff_salary_structures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_sal_str_select" ON staff_salary_structures;
DROP POLICY IF EXISTS "staff_sal_str_insert" ON staff_salary_structures;
DROP POLICY IF EXISTS "staff_sal_str_update" ON staff_salary_structures;
DROP POLICY IF EXISTS "staff_sal_str_delete" ON staff_salary_structures;

CREATE POLICY "staff_sal_str_select" ON staff_salary_structures FOR SELECT USING (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);
CREATE POLICY "staff_sal_str_insert" ON staff_salary_structures FOR INSERT WITH CHECK (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);
CREATE POLICY "staff_sal_str_update" ON staff_salary_structures FOR UPDATE USING (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);
CREATE POLICY "staff_sal_str_delete" ON staff_salary_structures FOR DELETE USING (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);

-- ────────────────────────────────────────────────────────────
-- 3. Monthly payroll for non-teaching staff
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_payroll (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id),
  staff_member_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  month           INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year            INTEGER NOT NULL,
  basic           NUMERIC NOT NULL DEFAULT 0,
  hra             NUMERIC NOT NULL DEFAULT 0,
  ta              NUMERIC NOT NULL DEFAULT 0,
  da              NUMERIC NOT NULL DEFAULT 0,
  other_allowance NUMERIC NOT NULL DEFAULT 0,
  deductions      NUMERIC NOT NULL DEFAULT 0,
  net_salary      NUMERIC GENERATED ALWAYS AS
                    (basic + hra + ta + da + other_allowance - deductions) STORED,
  payment_status  TEXT NOT NULL DEFAULT 'pending'
                    CHECK (payment_status IN ('pending', 'approved', 'paid')),
  payment_date    DATE,
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  remarks         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_member_id, month, year)
);

ALTER TABLE staff_payroll ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_payroll_select" ON staff_payroll;
DROP POLICY IF EXISTS "staff_payroll_insert" ON staff_payroll;
DROP POLICY IF EXISTS "staff_payroll_update" ON staff_payroll;

CREATE POLICY "staff_payroll_select" ON staff_payroll FOR SELECT USING (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);
CREATE POLICY "staff_payroll_insert" ON staff_payroll FOR INSERT WITH CHECK (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);
CREATE POLICY "staff_payroll_update" ON staff_payroll FOR UPDATE USING (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);

-- ────────────────────────────────────────────────────────────
-- 4. Fix existing payroll table: widen payment_status to
--    include 'approved' state for the teaching staff workflow
-- ────────────────────────────────────────────────────────────
ALTER TABLE payroll DROP CONSTRAINT IF EXISTS payroll_payment_status_check;
ALTER TABLE payroll ADD CONSTRAINT payroll_payment_status_check
  CHECK (payment_status IN ('pending', 'approved', 'paid'));

-- Add missing columns if migration 009 was NOT yet run
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS remarks     TEXT;

SELECT 'Migration 010 applied: staff_members, staff_salary_structures, staff_payroll created.' AS result;
