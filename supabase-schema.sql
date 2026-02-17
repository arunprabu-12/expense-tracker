-- Rebuild schema for expense-tracker (user_id + date model)
create extension if not exists "pgcrypto";

-- 1) Drop broken tables safely
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 2) Create profiles table linked to Supabase Auth
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  role TEXT DEFAULT 'student',
  parent_id UUID,
  phone_number TEXT,
  min_balance NUMERIC DEFAULT 500,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3) Create wallets table
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  balance NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4) Create transactions table with correct columns
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('income', 'expense')) NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

create index if not exists wallets_user_id_idx on wallets(user_id);
create index if not exists transactions_user_id_idx on transactions(user_id);
create index if not exists transactions_user_date_idx on transactions(user_id, date);

-- 5) Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 6) Create policies for authenticated users
DROP POLICY IF EXISTS "Users can manage own profile" ON profiles;
CREATE POLICY "Users can manage own profile"
ON profiles
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can manage own wallet" ON wallets;
CREATE POLICY "Users can manage own wallet"
ON wallets
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own transactions" ON transactions;
CREATE POLICY "Users can manage own transactions"
ON transactions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 7) Automatically create wallet when profile is created
CREATE OR REPLACE FUNCTION create_wallet()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wallets (user_id, balance)
  VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_wallet_trigger ON profiles;
CREATE TRIGGER create_wallet_trigger
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION create_wallet();

-- Realtime publication (optional but useful for live updates)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end $$;

-- 8) Reload Supabase schema cache
NOTIFY pgrst, 'reload schema';
