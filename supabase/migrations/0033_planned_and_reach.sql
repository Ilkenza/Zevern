-- Zevern — the three things the timeline could not see, and a way to be told.
--
-- The forecast only ever knew about recurring rules. That left it wrong in two
-- systematic directions at once: it could not see the dentist, the tax payment or the
-- invoice you know is landing, and it subtracted nothing at all for groceries, fuel
-- and eating out — usually the largest slice of a month. A line that claims to tell
-- you what you can spend, while ignoring most of what you spend, is worse than no
-- line. And none of it reached anyone who did not open the app.

-- 1) One-off things you already know about.
--
-- Deliberately its own table rather than a recurring rule with `every = 'once'`:
-- a rule is a standing arrangement that repeats and can be paused, while this is a
-- single dated fact that is either still coming or already dealt with. Squeezing the
-- second into the first is how `active`, `next_on` and `installments_done` stop
-- meaning one thing each.
create table if not exists public.money_planned (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) <= 200),
  kind        text not null default 'expense' check (kind in ('expense', 'income')),
  amount      numeric(14, 2) not null default 0 check (amount >= 0),
  currency    text not null default 'RSD' check (currency in ('RSD', 'EUR', 'USD')),
  account_id  uuid references public.money_accounts (id) on delete set null,
  category_id uuid references public.money_categories (id) on delete set null,
  due_on      date not null default current_date,
  note        text check (note is null or char_length(note) <= 2000),
  -- Set when the thing actually happened and was written into the ledger, so it stops
  -- being a prediction. The entry it became is kept, so the two never double-count.
  settled_at    date,
  transaction_id uuid references public.money_transactions (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists money_planned_user_due_idx
  on public.money_planned (user_id, due_on) where settled_at is null;

alter table public.money_planned enable row level security;

drop policy if exists "Planned selectable by owner" on public.money_planned;
drop policy if exists "Planned insertable by owner" on public.money_planned;
drop policy if exists "Planned updatable by owner" on public.money_planned;
drop policy if exists "Planned deletable by owner" on public.money_planned;

create policy "Planned selectable by owner"
  on public.money_planned for select using (auth.uid() = user_id);
create policy "Planned insertable by owner"
  on public.money_planned for insert with check (auth.uid() = user_id);
create policy "Planned updatable by owner"
  on public.money_planned for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Planned deletable by owner"
  on public.money_planned for delete using (auth.uid() = user_id);

-- 2) How the everyday spending line is worked out.
--
-- Two honest answers and an off switch, because which one is right depends on whether
-- the budgets are aspirational or descriptive — and only the owner knows that.
alter table public.profiles
  add column if not exists spending_basis text not null default 'history'
    check (spending_basis in ('off', 'budgets', 'history'));

comment on column public.profiles.spending_basis is
  'How the forecast projects everyday spending: off, from category budgets, or from the median of recent months.';

-- 3) A private calendar address.
--
-- The app has no mail and no push, and adding either means a third-party account and a
-- key. A subscribable calendar needs neither: the phone already has a calendar that
-- already knows how to remind, so the feed goes there and the reminders come for free.
-- The token is the credential — this is a capability URL, the same shape Google and
-- Apple use for their own private feeds — so it is long, random, revocable, and never
-- shown anywhere it could be linked from.
alter table public.profiles
  add column if not exists calendar_token text unique;

comment on column public.profiles.calendar_token is
  'Secret path segment of the private .ics feed. Anyone holding it can read the upcoming list, so regenerating it revokes the old address.';
