-- Zevern — Private workspace + Money (budget tracker)
--
-- Base currency is RSD. Every amount is stored in the currency it was entered in,
-- together with the rate used at entry time; amount_rsd is derived from those two,
-- so history never shifts when the rate is updated later.

-- 1) Tasks belong to a workspace: 'work' (Freelance) or 'personal' (Private).
alter table public.tasks
  add column if not exists workspace text not null default 'work'
    check (workspace in ('work', 'personal'));

create index if not exists tasks_user_workspace_idx on public.tasks (user_id, workspace);

-- 2) Manual FX rates (how many RSD one unit is worth) live on the profile.
alter table public.profiles
  add column if not exists rate_eur numeric(12, 4) not null default 117.2,
  add column if not exists rate_usd numeric(12, 4) not null default 101.0,
  add column if not exists rates_updated_on date;

-- 3) Accounts (wallets): cash, bank, card, savings.
create table if not exists public.money_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null,
  kind            text not null default 'bank' check (kind in ('cash', 'bank', 'card', 'savings', 'other')),
  currency        text not null default 'RSD' check (currency in ('RSD', 'EUR', 'USD')),
  opening_balance numeric(14, 2) not null default 0,
  color           text,
  archived        boolean not null default false,
  sort            integer not null default 0,
  created_at      timestamptz not null default now()
);

-- 4) Categories, split into expense and income.
create table if not exists public.money_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  kind       text not null default 'expense' check (kind in ('expense', 'income')),
  icon       text,
  color      text,
  archived   boolean not null default false,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

-- 5) Savings goals — what are we putting money aside for.
create table if not exists public.money_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  target_rsd  numeric(14, 2) not null default 0,
  target_date date,
  color       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 6) Recurring items. Fixed ones post themselves; variable ones (struja, voda)
--    wait for an amount and show up as "needs amount" on the overview.
create table if not exists public.money_recurring (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  kind         text not null default 'expense' check (kind in ('expense', 'income')),
  account_id   uuid references public.money_accounts (id) on delete set null,
  category_id  uuid references public.money_categories (id) on delete set null,
  amount       numeric(14, 2) not null default 0,
  currency     text not null default 'RSD' check (currency in ('RSD', 'EUR', 'USD')),
  variable     boolean not null default false,
  every        text not null default 'month' check (every in ('week', 'month', 'year')),
  next_on      date not null default current_date,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- 7) Monthly limit per category.
create table if not exists public.money_budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.money_categories (id) on delete cascade,
  amount_rsd  numeric(14, 2) not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, category_id)
);

-- 8) The ledger.
create table if not exists public.money_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null default 'expense' check (kind in ('expense', 'income', 'transfer', 'saving')),
  account_id    uuid references public.money_accounts (id) on delete set null,
  to_account_id uuid references public.money_accounts (id) on delete set null,
  category_id   uuid references public.money_categories (id) on delete set null,
  goal_id       uuid references public.money_goals (id) on delete set null,
  recurring_id  uuid references public.money_recurring (id) on delete set null,
  amount        numeric(14, 2) not null check (amount >= 0),
  currency      text not null default 'RSD' check (currency in ('RSD', 'EUR', 'USD')),
  rate          numeric(12, 4) not null default 1 check (rate > 0),
  amount_rsd    numeric(14, 2) generated always as (round(amount * rate, 2)) stored,
  note          text,
  occurred_on   date not null default current_date,
  created_at    timestamptz not null default now()
);

create index if not exists money_tx_user_date_idx on public.money_transactions (user_id, occurred_on desc);
create index if not exists money_tx_category_idx on public.money_transactions (category_id);
create index if not exists money_tx_account_idx on public.money_transactions (account_id);
create index if not exists money_tx_goal_idx on public.money_transactions (goal_id);
create index if not exists money_recurring_next_idx on public.money_recurring (user_id, next_on);

-- 9) RLS: every row is scoped to its owner, same rule on all six tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'money_accounts', 'money_categories', 'money_goals',
    'money_recurring', 'money_budgets', 'money_transactions'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "Selectable by owner" on public.%I', t);
    execute format('drop policy if exists "Insertable by owner" on public.%I', t);
    execute format('drop policy if exists "Updatable by owner" on public.%I', t);
    execute format('drop policy if exists "Deletable by owner" on public.%I', t);

    execute format('create policy "Selectable by owner" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "Insertable by owner" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "Updatable by owner" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "Deletable by owner" on public.%I for delete using (auth.uid() = user_id)', t);

    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
  end loop;
end $$;
