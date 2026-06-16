-- Run this in Supabase SQL Editor
-- Tracks how many times each principal generates questions per week

CREATE TABLE IF NOT EXISTS question_bank_usage (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL,
  used_at  timestamptz DEFAULT now()
);

-- No user RLS — accessed only via service role in the API route
-- Index for fast weekly count queries
CREATE INDEX IF NOT EXISTS idx_qbu_user_date ON question_bank_usage (user_id, used_at);
