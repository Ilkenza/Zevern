-- What a budget allowed, and from when.
--
-- Until now a plan carried one `amount_rsd` and nothing else, which quietly rewrote the
-- past every time it was edited. Raise Groceries from 20.000 to 25.000 today, walk back
-- to July, and July is measured against 25.000 — a month you actually planned at 20.000
-- and overspent now reports as comfortable. Nothing on the screen says the number moved.
-- That is the same class of error as a limit that vanishes when a trip ends: an honest
-- month turning into a dishonest one with no entry to point at.
--
-- So the amount becomes effective-dated. `money_budget_plans.amount_rsd` stays as the
-- current figure — every form, every default and every "usually" line still reads it, and
-- nothing about the shape of the app changes — and this table records what it was over
-- time. A window is judged by the row in force while that window ran.
--
-- "In force" is measured against the END of the window, not the start. Somebody raising
-- a limit on the 28th means "this month is allowed more", not "next month is" — the month
-- they are standing in is the one they are thinking about. Measuring from the start would
-- make every change silently take effect a month late, which is the sort of thing nobody
-- reports as a bug and everybody stops trusting.

create table if not exists public.money_budget_amounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_id uuid not null references public.money_budget_plans(id) on delete cascade,

  -- The first day this amount applies from. One row per change; the newest one at or
  -- before a window's last day is that window's amount.
  starts_on date not null,
  amount_rsd numeric(14, 2) not null check (amount_rsd >= 0),
  created_at timestamptz not null default now(),

  -- Two amounts starting the same day is one edit made twice. The later write wins.
  unique (budget_id, starts_on)
);

comment on table public.money_budget_amounts is
  'What a budget allowed, and from when. A window is judged by the amount in force while it ran.';

create index if not exists money_budget_amounts_budget_idx
  on public.money_budget_amounts (budget_id, starts_on desc);

alter table public.money_budget_amounts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'money_budget_amounts'
  ) then
    execute 'create policy "Selectable by owner" on public.money_budget_amounts for select using (auth.uid() = user_id)';
    execute 'create policy "Insertable by owner" on public.money_budget_amounts for insert with check (auth.uid() = user_id)';
    execute 'create policy "Updatable by owner" on public.money_budget_amounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    execute 'create policy "Deletable by owner" on public.money_budget_amounts for delete using (auth.uid() = user_id)';
  end if;
end $$;

/*
  RLS checks this row's own `user_id`; `budget_id` points into a table that is mostly
  other people's rows. A crafted insert with a truthful `user_id` and a stranger's
  `budget_id` passes every policy above and would then quietly rewrite what their budget
  allowed. Same guard as the links and the boosts, for the same reason.

  SECURITY INVOKER so the lookup runs under the caller's own RLS: a budget they cannot
  see reads as absent rather than as a row to be checked.
*/
create or replace function public.money_budget_amount_is_owned()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  owner uuid;
begin
  if new.user_id <> auth.uid() then
    raise exception 'that row is not yours' using errcode = '42501';
  end if;

  select user_id into owner from public.money_budget_plans where id = new.budget_id;
  if owner is null or owner <> auth.uid() then
    raise exception 'that budget is not yours' using errcode = '42501';
  end if;

  return new;
end $$;

revoke all on function public.money_budget_amount_is_owned() from public, anon, authenticated;

drop trigger if exists money_budget_amounts_owned on public.money_budget_amounts;
create trigger money_budget_amounts_owned
  before insert or update on public.money_budget_amounts
  for each row execute function public.money_budget_amount_is_owned();

-- Every budget that already exists gets one row, saying its current amount has applied
-- since the day it started. That is exactly what the app assumed until now, so no figure
-- on any screen moves; what changes is that the next edit can no longer rewrite the past.
insert into public.money_budget_amounts (user_id, budget_id, starts_on, amount_rsd)
select p.user_id, p.id, p.starts_on, p.amount_rsd
from public.money_budget_plans p
where not exists (
  select 1 from public.money_budget_amounts a where a.budget_id = p.id
);
