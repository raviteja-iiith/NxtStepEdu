-- ============================================================
-- Migration 005: Delete Helper Functions
-- These run as SECURITY DEFINER (bypasses RLS) so the
-- principal can clean up all FK dependencies before deleting
-- a section or class.
-- ============================================================

-- Drop if exists (safe to re-run)
DROP FUNCTION IF EXISTS delete_section_cascade(UUID);
DROP FUNCTION IF EXISTS delete_class_cascade(UUID);
DROP FUNCTION IF EXISTS delete_subject_cascade(UUID);

-- -------------------------------------------------------
-- delete_section_cascade
-- Cleans all FK-referencing tables, then deletes the section
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_section_cascade(p_section_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Null out student section references (soft-deleted students still have FK)
  UPDATE students SET section_id = NULL WHERE section_id = p_section_id;

  -- Delete timetable slots
  DELETE FROM timetable WHERE section_id = p_section_id;

  -- Delete attendance records
  DELETE FROM attendance WHERE section_id = p_section_id;

  -- Delete teacher-section assignments
  DELETE FROM teacher_section_assignments WHERE section_id = p_section_id;

  -- Null out section on school assignments
  UPDATE assignments SET section_id = NULL WHERE section_id = p_section_id;

  -- Null out section on exams
  UPDATE exams SET section_id = NULL WHERE section_id = p_section_id;

  -- Null out section on lesson plans
  UPDATE lesson_plans SET section_id = NULL WHERE section_id = p_section_id;

  -- Null out section on resources
  UPDATE resources SET section_id = NULL WHERE section_id = p_section_id;

  -- Null out section on announcements
  UPDATE announcements SET target_section_id = NULL WHERE target_section_id = p_section_id;

  -- Finally delete the section
  DELETE FROM sections WHERE id = p_section_id;
END;
$$;

-- -------------------------------------------------------
-- delete_class_cascade
-- Cleans all FK-referencing tables, then deletes the class
-- (call AFTER all sections have been removed)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_class_cascade(p_class_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Null out student class references (includes soft-deleted students)
  UPDATE students SET class_id = NULL, section_id = NULL WHERE class_id = p_class_id;

  -- Delete subjects linked to this class
  DELETE FROM subjects WHERE class_id = p_class_id;

  -- Null out class on exams
  UPDATE exams SET class_id = NULL WHERE class_id = p_class_id;

  -- Null out class on announcements
  UPDATE announcements SET target_class_id = NULL WHERE target_class_id = p_class_id;

  -- Delete fee structures for this class
  DELETE FROM fee_structures WHERE class_id = p_class_id;

  -- Finally delete the class
  DELETE FROM classes WHERE id = p_class_id;
END;
$$;

-- -------------------------------------------------------
-- delete_subject_cascade
-- Cleans all FK-referencing tables, then deletes the subject
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_subject_cascade(p_subject_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete timetable slots referencing this subject
  DELETE FROM timetable WHERE subject_id = p_subject_id;

  -- Delete teacher-section assignments for this subject
  DELETE FROM teacher_section_assignments WHERE subject_id = p_subject_id;

  -- Null out subject on exams (preserve exam records, just unlink subject)
  UPDATE exams SET subject_id = NULL WHERE subject_id = p_subject_id;

  -- Null out subject on assignments
  UPDATE assignments SET subject_id = NULL WHERE subject_id = p_subject_id;

  -- Null out subject on lesson plans
  UPDATE lesson_plans SET subject_id = NULL WHERE subject_id = p_subject_id;

  -- Null out subject on resources
  UPDATE resources SET subject_id = NULL WHERE subject_id = p_subject_id;

  -- Finally delete the subject
  DELETE FROM subjects WHERE id = p_subject_id;
END;
$$;

-- Grant execute to authenticated users (principal will call these)
GRANT EXECUTE ON FUNCTION delete_section_cascade(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_class_cascade(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_subject_cascade(UUID) TO authenticated;
