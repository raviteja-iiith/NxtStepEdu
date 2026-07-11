-- ============================================================
-- Migration: Add sms_type column to sms_logs
-- Run this once against your Supabase DB
-- ============================================================
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS sms_type TEXT DEFAULT 'exam_result';
