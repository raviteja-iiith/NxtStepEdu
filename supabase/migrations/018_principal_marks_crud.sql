-- ============================================================
-- Migration 018: Give principal full CRUD access on marks table
-- ============================================================
-- Problem: The old "Teacher can manage marks" policy used FOR ALL with
-- only a USING clause, which does NOT apply to INSERT. Principals could
-- read and update marks but could NOT insert new ones.
-- This migration drops the old policies and replaces them with explicit
-- SELECT / INSERT / UPDATE / DELETE policies that include 'principal'.
-- ============================================================

-- Drop all existing marks policies (old naming styles included)
DROP POLICY IF EXISTS "Marks visible by role"           ON marks;
DROP POLICY IF EXISTS "Teacher can manage marks"         ON marks;
DROP POLICY IF EXISTS "Teacher can insert marks"         ON marks;
DROP POLICY IF EXISTS "Teacher can update own marks"     ON marks;
DROP POLICY IF EXISTS "Teacher can delete own marks"     ON marks;
DROP POLICY IF EXISTS "Principal can manage all marks"   ON marks;
DROP POLICY IF EXISTS "marks_select"                     ON marks;
DROP POLICY IF EXISTS "marks_insert"                     ON marks;
DROP POLICY IF EXISTS "marks_update"                     ON marks;
DROP POLICY IF EXISTS "marks_delete"                     ON marks;

-- Ensure RLS is enabled
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;

-- SELECT: principal & teacher see all school marks; parents see published only
CREATE POLICY "marks_select"
ON marks FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'principal', 'teacher')
    OR (
      exam_id IN (SELECT id FROM exams WHERE is_published = true)
      AND student_id IN (
        SELECT student_id FROM student_parent_links WHERE parent_id = auth.uid()
      )
    )
  )
);

-- INSERT: principal + teacher + admin can insert marks for their school
CREATE POLICY "marks_insert"
ON marks FOR INSERT WITH CHECK (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'principal', 'teacher')
  AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- UPDATE: principal/admin can update any mark; teacher only their own
CREATE POLICY "marks_update"
ON marks FOR UPDATE USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'principal')
    OR entered_by = auth.uid()
  )
);

-- DELETE: principal/admin can delete any mark; teacher only their own
CREATE POLICY "marks_delete"
ON marks FOR DELETE USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'principal')
    OR entered_by = auth.uid()
  )
);
