-- ── Password Reset Requests Table ────────────────────────────────────────────
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  user_identifier text NOT NULL,  -- phone for parents, email for teachers
  role text NOT NULL CHECK (role IN ('parent', 'teacher')),
  class_name text,                -- populated for parent requests
  section_name text,              -- populated for parent requests
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_prr_school_status ON password_reset_requests(school_id, status);
CREATE INDEX IF NOT EXISTS idx_prr_user_id ON password_reset_requests(user_id);

-- RLS
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Principals of the same school can do everything
CREATE POLICY "principal_all" ON password_reset_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'principal'
        AND u.school_id = password_reset_requests.school_id
    )
  );

-- Teachers of the same school can SELECT and INSERT
CREATE POLICY "teacher_select_insert" ON password_reset_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'teacher'
        AND u.school_id = password_reset_requests.school_id
    )
  );

-- Teachers can resolve (UPDATE) requests for parents in their sections
CREATE POLICY "teacher_update" ON password_reset_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'teacher'
        AND u.school_id = password_reset_requests.school_id
    )
  );

-- Anyone (unauthenticated) can INSERT a new request (login page)
CREATE POLICY "public_insert" ON password_reset_requests
  FOR INSERT WITH CHECK (true);
