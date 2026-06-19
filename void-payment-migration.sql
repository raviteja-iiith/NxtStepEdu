-- ─────────────────────────────────────────────────────────────
-- VOID PAYMENT MIGRATION  (v2 — simplified, no FK constraint)
-- Run this in Supabase SQL Editor → New Query
-- ─────────────────────────────────────────────────────────────

ALTER TABLE fee_payments
  ADD COLUMN IF NOT EXISTS is_voided     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS voided_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ;

-- Index for fast filtering of active (non-voided) payments
CREATE INDEX IF NOT EXISTS idx_fee_payments_not_voided
  ON fee_payments (fee_id) WHERE is_voided = FALSE;
