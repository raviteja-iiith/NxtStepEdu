-- ============================================================
-- Marks RLS Patch — Run this in Supabase Dashboard → SQL Editor
-- ============================================================
-- Problem: The existing "Teacher can manage marks" policy uses USING clause
-- which only applies to UPDATE/DELETE/SELECT. For INSERT, we need WITH CHECK.
-- This adds a dedicated INSERT policy so teachers can enter new marks.

-- Drop the old all-in-one policy that has the INSERT gap
DROP POLICY IF EXISTS "Teacher can manage marks" ON marks;

-- Recreate: Teacher can INSERT new marks (for exams in their subjects)
CREATE POLICY "Teacher can insert marks"
ON marks FOR INSERT WITH CHECK (
  entered_by = auth.uid()
  AND (SELECT role FROM users WHERE id = auth.uid()) = 'teacher'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- Teacher can UPDATE and DELETE only marks they entered
CREATE POLICY "Teacher can update own marks"
ON marks FOR UPDATE USING (
  entered_by = auth.uid()
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
);

CREATE POLICY "Teacher can delete own marks"
ON marks FOR DELETE USING (
  entered_by = auth.uid()
  OR (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
);

-- Principal can do everything on marks
CREATE POLICY "Principal can manage all marks"
ON marks FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- Verify: check existing SELECT policy still stands
-- "Marks visible by role" — already handles SELECT for principal, teacher, parent
-- No changes needed there.
