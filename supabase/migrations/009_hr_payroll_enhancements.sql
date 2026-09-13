-- ============================================================
-- Migration 009: HR & Payroll Enhancements
-- Run in Supabase SQL Editor BEFORE using the new HR module
-- This is ADDITIVE only — safe to run on existing data
-- ============================================================

-- 1. Add workflow columns to existing payroll table
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES users(id);
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS remarks        TEXT;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS bonus          NUMERIC DEFAULT 0;

-- Widen payment_status to support 'approved' state
ALTER TABLE payroll DROP CONSTRAINT IF EXISTS payroll_payment_status_check;
ALTER TABLE payroll ADD CONSTRAINT payroll_payment_status_check
  CHECK (payment_status IN ('pending', 'approved', 'paid'));

-- 2. Create salary_structures table
CREATE TABLE IF NOT EXISTS salary_structures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id),
  employee_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  UNIQUE(school_id, employee_id)
);

-- 3. RLS for salary_structures
ALTER TABLE salary_structures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salary_structures_select" ON salary_structures;
DROP POLICY IF EXISTS "salary_structures_insert" ON salary_structures;
DROP POLICY IF EXISTS "salary_structures_update" ON salary_structures;
DROP POLICY IF EXISTS "salary_structures_delete" ON salary_structures;

CREATE POLICY "salary_structures_select" ON salary_structures FOR SELECT USING (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);
CREATE POLICY "salary_structures_insert" ON salary_structures FOR INSERT WITH CHECK (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);
CREATE POLICY "salary_structures_update" ON salary_structures FOR UPDATE USING (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);
CREATE POLICY "salary_structures_delete" ON salary_structures FOR DELETE USING (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);

-- 4. RLS for payroll table
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_select" ON payroll;
DROP POLICY IF EXISTS "payroll_insert" ON payroll;
DROP POLICY IF EXISTS "payroll_update" ON payroll;

CREATE POLICY "payroll_select" ON payroll FOR SELECT USING (
  get_my_role() = 'admin'
  OR (get_my_role() = 'principal' AND school_id = get_my_school_id())
);
CREATE POLICY "payroll_insert" ON payroll FOR INSERT WITH CHECK (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);
CREATE POLICY "payroll_update" ON payroll FOR UPDATE USING (
  get_my_role() IN ('admin', 'principal') AND school_id = get_my_school_id()
);

SELECT 'Migration 009 applied successfully.' AS result;
