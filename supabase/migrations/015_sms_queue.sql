-- ============================================================
-- SMS Queue table for Android Gateway approach
-- The Android APK polls this table and sends SMS via device SIM
-- ============================================================

CREATE TABLE IF NOT EXISTS sms_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID        REFERENCES schools(id) ON DELETE CASCADE,
  phone_number  TEXT        NOT NULL,
  message       TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  student_name  TEXT,
  parent_id     UUID,
  sms_type      TEXT        DEFAULT 'attendance_absent',
  attempts      INT         DEFAULT 0,
  sent_at       TIMESTAMPTZ,
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for APK to efficiently poll pending messages per school
CREATE INDEX IF NOT EXISTS idx_sms_queue_pending ON sms_queue(school_id, status, created_at);

-- RLS
ALTER TABLE sms_queue ENABLE ROW LEVEL SECURITY;

-- Principal/teacher in the school can insert
CREATE POLICY "School staff can insert sms_queue"
ON sms_queue FOR INSERT WITH CHECK (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- Anyone in the school can read their queue (for APK to poll via anon key)
CREATE POLICY "School staff can read sms_queue"
ON sms_queue FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
);

-- Service role can do everything (for the Android APK using anon key + school token)
CREATE POLICY "Service role full access sms_queue"
ON sms_queue FOR ALL USING (true) WITH CHECK (true);

-- Add gateway_token to sms_credentials (APK uses this to authenticate)
ALTER TABLE sms_credentials ADD COLUMN IF NOT EXISTS gateway_token TEXT DEFAULT gen_random_uuid()::text;
ALTER TABLE sms_credentials ADD COLUMN IF NOT EXISTS gateway_type TEXT DEFAULT 'android' CHECK (gateway_type IN ('android', 'msg91', 'fast2sms'));
