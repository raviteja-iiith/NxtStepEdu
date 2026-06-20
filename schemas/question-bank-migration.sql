-- ============================================================
-- Question Bank Migration — Run in Supabase SQL Editor
-- AP State Board Curriculum — Classes 6–10
-- PRINCIPAL ACCESS ONLY
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS question_bank (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name      text NOT NULL,
  subject_name    text NOT NULL,
  chapter_number  int  NOT NULL,
  chapter_name    text NOT NULL,
  question_text   text NOT NULL,
  question_type   text NOT NULL CHECK (question_type IN ('mcq', 'short', 'long')),
  difficulty      text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  option_a        text,
  option_b        text,
  option_c        text,
  option_d        text,
  correct_answer  text NOT NULL,
  explanation     text,
  created_at      timestamptz DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE question_bank ENABLE ROW LEVEL SECURITY;

-- 3. Drop any existing policies
DROP POLICY IF EXISTS "principal_read_questions"   ON question_bank;
DROP POLICY IF EXISTS "principal_write_questions"  ON question_bank;
DROP POLICY IF EXISTS "teacher_blocked"            ON question_bank;

-- 4. Only principals can SELECT — teachers are blocked at DB level
CREATE POLICY "principal_read_questions"
ON question_bank FOR SELECT
USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
);

-- 5. Only principals can INSERT / UPDATE / DELETE
CREATE POLICY "principal_write_questions"
ON question_bank FOR ALL
USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
)
WITH CHECK (
  (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
);

-- 6. Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_qb_class       ON question_bank (class_name);
CREATE INDEX IF NOT EXISTS idx_qb_subject     ON question_bank (subject_name);
CREATE INDEX IF NOT EXISTS idx_qb_chapter     ON question_bank (chapter_number);
CREATE INDEX IF NOT EXISTS idx_qb_difficulty  ON question_bank (difficulty);
CREATE INDEX IF NOT EXISTS idx_qb_class_subj  ON question_bank (class_name, subject_name);
