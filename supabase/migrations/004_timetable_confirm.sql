-- Migration 004: Add is_confirmed to timetable for draft/confirm flow
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT false;
