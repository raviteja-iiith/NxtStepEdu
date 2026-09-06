-- ============================================================
-- Lesson Plans & Resources Upgrade Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add completed_at to lesson_plans (safe if column already exists)
ALTER TABLE lesson_plans
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 2. Allow 'in_progress' as a valid status value
-- (If status is a TEXT column, this is a no-op — just documenting valid values)
-- If it is an ENUM, uncomment the line below:
-- ALTER TYPE lesson_plan_status ADD VALUE IF NOT EXISTS 'in_progress';

-- 3. Add view_count to resources
ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

-- 4. RLS: Allow parents to read lesson_plans for their child's section
-- First check if the policy already exists, then create
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lesson_plans'
      AND policyname = 'Parents can read lesson plans for their child section'
  ) THEN
    CREATE POLICY "Parents can read lesson plans for their child section"
      ON lesson_plans FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM student_parent_links spl
          JOIN students s ON s.id = spl.student_id
          WHERE spl.parent_id = auth.uid()
            AND s.section_id = lesson_plans.section_id
        )
      );
  END IF;
END $$;

-- 5. RLS: Allow parents to read published resources for their child's section
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'resources'
      AND policyname = 'Parents can read published resources for their child section'
  ) THEN
    CREATE POLICY "Parents can read published resources for their child section"
      ON resources FOR SELECT
      USING (
        is_published = true
        AND (
          section_id IS NULL  -- school-wide resource
          OR EXISTS (
            SELECT 1 FROM student_parent_links spl
            JOIN students s ON s.id = spl.student_id
            WHERE spl.parent_id = auth.uid()
              AND s.section_id = resources.section_id
          )
        )
      );
  END IF;
END $$;

-- 6. Index for fast weekly lesson plan queries
CREATE INDEX IF NOT EXISTS idx_lesson_plans_section_week
  ON lesson_plans(section_id, week_start_date);

-- 7. Index for published resources per section
CREATE INDEX IF NOT EXISTS idx_resources_section_published
  ON resources(section_id, is_published);

-- Done!
