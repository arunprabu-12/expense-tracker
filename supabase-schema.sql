-- Run this in Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  monthly_allowance numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  type text not null check (type in ('income', 'expense')),
  category text not null,
  description text,
  date date not null,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_user_date_idx on public.transactions(user_id, date);

alter table public.users enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "Users can view own profile" on public.users;
create policy "Users can view own profile"
on public.users
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can upsert own profile" on public.users;
create policy "Users can upsert own profile"
on public.users
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
on public.users
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can view own transactions" on public.transactions;
create policy "Users can view own transactions"
on public.transactions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own transactions" on public.transactions;
create policy "Users can insert own transactions"
on public.transactions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own transactions" on public.transactions;
create policy "Users can update own transactions"
on public.transactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own transactions" on public.transactions;
create policy "Users can delete own transactions"
on public.transactions
for delete
to authenticated
using (auth.uid() = user_id);

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

-- New tables for Parent-Student Wallet System
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text,
  role text not null default 'student', -- 'parent' or 'student'
  parent_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  balance numeric not null default 0,
  created_at timestamptz not null default now(),
  constraint one_wallet_per_student unique (student_id)
);

-- Add phone_number and min_balance to profiles
alter table public.profiles
  add column if not exists phone_number text;
alter table public.profiles
  add column if not exists min_balance numeric not null default 500;

-- Ensure transactions have student_id and credit/debit types.
alter table public.transactions
  add column if not exists student_id uuid references public.profiles(id),
  add column if not exists created_at timestamptz default now();

-- Allow both legacy and new type values during migration; prefer credit/debit for new writes.
alter table public.transactions
  alter column type drop constraint if exists transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check check (type in ('income', 'expense', 'credit', 'debit'));

create index if not exists transactions_student_id_idx on public.transactions(student_id);
create index if not exists transactions_student_created_idx on public.transactions(student_id, created_at);

-- Row level security & policies for new tables
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;

drop policy if exists "Profiles: select own" on public.profiles;
create policy "Profiles: select own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Profiles: insert own" on public.profiles;
create policy "Profiles: insert own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Profiles: update own" on public.profiles;
create policy "Profiles: update own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Wallets: Students can select their own wallet. Parents can select wallets of linked students.
drop policy if exists "Wallets: select" on public.wallets;
create policy "Wallets: select"
on public.wallets
for select
to authenticated
using (
  auth.uid() = student_id
  or exists (select 1 from public.profiles p where p.id = student_id and p.parent_id = auth.uid())
);

drop policy if exists "Wallets: insert" on public.wallets;
create policy "Wallets: insert"
on public.wallets
for insert
to authenticated
with check (auth.uid() = student_id);

drop policy if exists "Wallets: update" on public.wallets;
create policy "Wallets: update"
on public.wallets
for update
to authenticated
using (
  auth.uid() = student_id
  or exists (select 1 from public.profiles p where p.id = student_id and p.parent_id = auth.uid())
)
with check (
  auth.uid() = student_id
  or exists (select 1 from public.profiles p where p.id = student_id and p.parent_id = auth.uid())
);

-- Transactions: allow students to insert their own debits, and parents to insert credits for their linked students.
drop policy if exists "Transactions: select own" on public.transactions;
create policy "Transactions: select own"
on public.transactions
for select
to authenticated
using (
  auth.uid() = student_id
  or exists (select 1 from public.profiles p where p.id = student_id and p.parent_id = auth.uid())
);

drop policy if exists "Transactions: insert"
on public.transactions;
create policy "Transactions: insert"
on public.transactions
for insert
to authenticated
with check (
  (
    -- students inserting their own debit transactions
    auth.uid() = student_id and type in ('debit','expense')
  )
  or (
    -- parents adding credits to linked students
    exists (select 1 from public.profiles p where p.id = student_id and p.parent_id = auth.uid()) and type in ('credit','income')
  )
);

drop policy if exists "Transactions: update own" on public.transactions;
create policy "Transactions: update own"
on public.transactions
for update
to authenticated
using (
  auth.uid() = student_id
)
with check (
  auth.uid() = student_id
);

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
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wallets'
  ) then
    alter publication supabase_realtime add table public.wallets;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- ML features table to store aggregated spending features per student
create table if not exists public.ml_spending_features (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  daily_spent numeric,
  weekly_spent numeric,
  monthly_spent numeric,
  transaction_count integer,
  predicted_next_7_days numeric,
  low_balance_risk boolean default false,
  created_at timestamptz not null default now()
);

create index if not exists ml_spending_features_student_idx on public.ml_spending_features(student_id, created_at desc);

-- Allow authenticated to insert ML features (used by server-side jobs)
alter table public.ml_spending_features enable row level security;
drop policy if exists "ML: insert" on public.ml_spending_features;
create policy "ML: insert"
on public.ml_spending_features
for insert
to authenticated
with check (true);

drop policy if exists "ML: select" on public.ml_spending_features;
create policy "ML: select"
on public.ml_spending_features
for select
to authenticated
using (auth.uid() = student_id or exists (select 1 from public.profiles p where p.id = student_id and p.parent_id = auth.uid()));
