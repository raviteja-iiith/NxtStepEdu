-- Make exam_name nullable so attendance SMS can also use sms_logs
ALTER TABLE sms_logs ALTER COLUMN exam_name DROP NOT NULL;
-- Add sms_type column if not exists
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS sms_type TEXT DEFAULT 'marks';
