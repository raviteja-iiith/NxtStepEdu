-- ═══════════════════════════════════════════════════════════
-- Notifications System Migration
-- ═══════════════════════════════════════════════════════════

-- Drop existing broken table (if it exists without the correct schema)
DROP TABLE IF EXISTS notifications CASCADE;

CREATE TABLE notifications (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       UUID,
  recipient_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  -- Types: fee_reminder | absent_alert | exam_scheduled | marks_published | message | announcement
  title           TEXT NOT NULL,
  body            TEXT,
  link            TEXT,  -- optional in-app route to navigate to
  is_read         BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Fast lookup: fetch unread notifications for a user quickly
CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON notifications(recipient_id, is_read, created_at DESC);

-- RLS: each user sees only their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications" ON notifications
  FOR SELECT USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (recipient_id = auth.uid());

-- Users can delete their own notifications
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications" ON notifications
  FOR DELETE USING (recipient_id = auth.uid());

-- Anyone with service_role (backend triggers) can insert
DROP POLICY IF EXISTS "Service can insert notifications" ON notifications;
CREATE POLICY "Service can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);
