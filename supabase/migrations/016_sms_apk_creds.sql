-- ============================================================
-- SMS Credentials update for Android SMS Gateway (smsgateway.me)
-- Stores username, password, device_id for the APK
-- ============================================================

ALTER TABLE sms_credentials ADD COLUMN IF NOT EXISTS sms_username TEXT DEFAULT '';
ALTER TABLE sms_credentials ADD COLUMN IF NOT EXISTS sms_password TEXT DEFAULT '';
ALTER TABLE sms_credentials ADD COLUMN IF NOT EXISTS device_id   TEXT DEFAULT '';
