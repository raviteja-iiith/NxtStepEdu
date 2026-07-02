-- ============================================================
-- School ERP — SMS Logs
-- Migration 007: sms_logs table
-- Stores audit trail of every bulk SMS result notification sent.
-- Credentials (password) are NEVER stored here — only the username.
-- ============================================================

CREATE TABLE IF NOT EXISTS sms_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID        REFERENCES schools(id),
  sent_at        TIMESTAMPTZ DEFAULT NOW(),
  exam_name      TEXT        NOT NULL,
  exam_date      DATE,
  class_id       UUID        REFERENCES classes(id),
  section_id     UUID        REFERENCES sections(id),
  sms_username   TEXT        NOT NULL,
  student_id     UUID        REFERENCES students(id),
  parent_id      UUID        REFERENCES users(id),
  phone_number   TEXT,
  message        TEXT,
  status         TEXT        NOT NULL
                   CHECK (status IN ('sent','failed','skipped')),
  error_message  TEXT,
  created_by     UUID        REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS sms_logs_school_exam_idx
  ON sms_logs (school_id, exam_name, exam_date, class_id);

CREATE INDEX IF NOT EXISTS sms_logs_school_time_idx
  ON sms_logs (school_id, sent_at DESC);

-- RLS
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Principal can read own school sms_logs"
ON sms_logs FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
);

CREATE POLICY "Service role can insert sms_logs"
ON sms_logs FOR INSERT WITH CHECK (true);
