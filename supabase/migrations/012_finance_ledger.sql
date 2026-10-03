-- ============================================================
-- Migration 012: Finance Ledger & Founder Equity
-- ============================================================

-- 1. Founder Equity Table
CREATE TABLE IF NOT EXISTS founder_equity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  equity_percentage NUMERIC NOT NULL,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Finance Categories Table (for dynamic expense/income categories)
CREATE TABLE IF NOT EXISTS finance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'withdrawal')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, type)
);

-- 3. Finance Transactions Table (The main ledger)
CREATE TABLE IF NOT EXISTS finance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'withdrawal')),
  category_id UUID REFERENCES finance_categories(id),
  category_name TEXT, -- Denormalized for flexibility or if category is deleted
  party_name TEXT NOT NULL, -- Who the money is from/to
  party_school_id UUID REFERENCES schools(id), -- If it's a school paying us
  party_user_id UUID REFERENCES users(id), -- If it's an employee or founder
  amount NUMERIC NOT NULL,
  from_account TEXT NOT NULL,
  to_account TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Finance Tables (Only Admins can access)
ALTER TABLE founder_equity ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;

-- Policies (drop first so this script is safe to re-run)
DROP POLICY IF EXISTS "admin_all_founder_equity"      ON founder_equity;
DROP POLICY IF EXISTS "admin_all_finance_categories"  ON finance_categories;
DROP POLICY IF EXISTS "admin_all_finance_transactions" ON finance_transactions;

CREATE POLICY "admin_all_founder_equity"
  ON founder_equity FOR ALL
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "admin_all_finance_categories"
  ON finance_categories FOR ALL
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "admin_all_finance_transactions"
  ON finance_transactions FOR ALL
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- Insert Initial Founders
INSERT INTO founder_equity (name, role, equity_percentage) VALUES
('Ravi', 'CEO & CTO', 33.3),
('Sridhar', 'COO & Finance', 33.3),
('Ajay', 'CMO & Business Dev', 33.4)
ON CONFLICT (name) DO NOTHING;

-- Insert Default Categories
INSERT INTO finance_categories (name, type) VALUES
('Subscription', 'income'),
('Setup Fee', 'income'),
('Employee Salaries', 'expense'),
('Server & Infra', 'expense'),
('Marketing', 'expense'),
('Legal & Compliance', 'expense'),
('Office & Admin', 'expense'),
('Misc / Other', 'expense'),
('Founder Draw', 'withdrawal')
ON CONFLICT (name, type) DO NOTHING;
