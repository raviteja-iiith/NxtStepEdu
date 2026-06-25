-- ============================================================
-- Migration 006: Add pen_number column to students table
-- PEN = Permanent Education Number (Govt. of India issued ID)
-- ============================================================

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS pen_number TEXT;

-- Optional: add an index for fast lookup by PEN number
CREATE INDEX IF NOT EXISTS idx_students_pen_number ON students(pen_number);

-- Comment for documentation
COMMENT ON COLUMN students.pen_number IS 'Permanent Education Number - Government issued student ID';
