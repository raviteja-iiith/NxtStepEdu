-- Migration 013: Store plain-text login PIN for parent accounts
-- This allows principals to view/export parent credentials anytime.
-- The column is only populated for 'parent' role users.

ALTER TABLE users ADD COLUMN IF NOT EXISTS login_pin TEXT;

-- Only principals should be able to read this column via RLS.
-- The existing RLS on the users table already restricts access;
-- this column is readable through the service_role key (used by our admin API only).

COMMENT ON COLUMN users.login_pin IS 'Plain-text login PIN stored for parent accounts only, accessible to principals for credential recovery/export.';
