-- ============================================================
-- School ERP — SMS Credentials & Per-School Attendance SMS Toggle
-- Migration 014: sms_credentials table + attendance_sms_enabled on schools
-- ============================================================

-- Add attendance-specific SMS toggle on schools table
ALTER TABLE schools ADD COLUMN IF NOT EXISTS attendance_sms_enabled BOOLEAN DEFAULT false;

-- Store MSG91 SMS credentials securely per school (encrypted at rest by Supabase)
CREATE TABLE IF NOT EXISTS sms_credentials (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID        UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
  msg91_auth_key  TEXT        NOT NULL,
  msg91_sender_id TEXT        NOT NULL DEFAULT 'SCHOOL',
  msg91_template_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE sms_credentials ENABLE ROW LEVEL SECURITY;

-- Principal can read their school's SMS credentials
CREATE POLICY "Principal can read own school sms_credentials"
ON sms_credentials FOR SELECT USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (SELECT role FROM users WHERE id = auth.uid()) IN ('principal', 'teacher')
);

-- Principal can upsert their school's SMS credentials
CREATE POLICY "Principal can upsert own school sms_credentials"
ON sms_credentials FOR INSERT WITH CHECK (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
);

CREATE POLICY "Principal can update own school sms_credentials"
ON sms_credentials FOR UPDATE USING (
  school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  AND (SELECT role FROM users WHERE id = auth.uid()) = 'principal'
);

-- Service role can do anything
CREATE POLICY "Service role full access sms_credentials"
ON sms_credentials FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_sms_credentials_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_sms_credentials_updated_at ON sms_credentials;
CREATE TRIGGER trg_sms_credentials_updated_at
  BEFORE UPDATE ON sms_credentials
  FOR EACH ROW EXECUTE FUNCTION update_sms_credentials_updated_at();
