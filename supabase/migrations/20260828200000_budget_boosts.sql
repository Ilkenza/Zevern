-- A trip can raise the monthly limits, for the months it happens in.
--
-- The problem this solves is not that a limit is too small. It is that a month with a
-- holiday in it is not the same kind of month as the eleven around it, and forcing them
-- to share one number means either the ordinary months are too loose or the holiday
-- month is reported as a failure. Groceries at 20.000 is right for a normal August and
-- wrong for the August you spent four days at the sea.
--
-- WHAT WAS REJECTED, AND WHY IT MATTERS HERE
--
-- The obvious shape is "while the trip is running, add 5.000". That shape is broken and
-- the break is silent: the moment the trip ends, the addition disappears, and a month
-- that was inside its limit yesterday is over it today — with no entry added and nothing
-- for anyone to look at. Worse, it rewrites the past: come back to August in November and
-- August is suddenly an overspend, because the boost that was live when you lived it is
-- not live now.
--
-- So a boost is not a state, it is a fact about a window: **does this trip fall in this
-- month at all**. The answer is fixed the moment the dates are typed and never changes
-- again, so no window ever moves from "kept" to "broken" on its own, forwards or back.
--
-- Full amount to each month the trip touches, rather than split across them by day. A
-- day is not the unit anything here is actually spent in — two dinners a month is what
-- eating out looks like in this ledger, so a fifth of a boost buys nothing and a figure
-- like "161 a day" describes no purchase anyone has ever made. The cost is real and worth
-- stating: a trip crossing the 1st grants its amount twice, once to each month. That is a
-- deliberate trade for a number you can predict without arithmetic.

create table if not exists public.money_budget_boosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The budget that grants the extra room: a trip, a holiday, a wedding — something with
  -- fixed dates that happens once.
  source_budget_id uuid not null references public.money_budget_plans(id) on delete cascade,

  -- The recurring limit that receives it.
  target_budget_id uuid not null references public.money_budget_plans(id) on delete cascade,

  amount_rsd numeric(14, 2) not null check (amount_rsd > 0),
  created_at timestamptz not null default now(),

  -- One line per pair. Raising Groceries twice from the same trip is two rows saying one
  -- thing, and the second is always somebody editing rather than adding.
  unique (source_budget_id, target_budget_id),

  -- A budget cannot raise itself.
  constraint money_budget_boost_not_self check (source_budget_id <> target_budget_id)
);

comment on table public.money_budget_boosts is
  'Extra room a one-off budget grants to a recurring one, for every window it falls in.';

create index if not exists money_budget_boosts_source_idx
  on public.money_budget_boosts (source_budget_id);
create index if not exists money_budget_boosts_target_idx
  on public.money_budget_boosts (user_id, target_budget_id);

alter table public.money_budget_boosts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'money_budget_boosts'
  ) then
    execute 'create policy "Selectable by owner" on public.money_budget_boosts for select using (auth.uid() = user_id)';
    execute 'create policy "Insertable by owner" on public.money_budget_boosts for insert with check (auth.uid() = user_id)';
    execute 'create policy "Updatable by owner" on public.money_budget_boosts for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    execute 'create policy "Deletable by owner" on public.money_budget_boosts for delete using (auth.uid() = user_id)';
  end if;
end $$;

/*
  RLS checks the row's own `user_id` and nothing else, which is not enough here.

  The row carries two foreign keys to a table whose contents are mostly other people's.
  A crafted insert with a truthful `user_id` and somebody else's `target_budget_id`
  passes every policy above — and would then quietly raise a stranger's limit, or read
  back their budget's name through the join the screen does. The same hole was closed on
  the category and account links for the same reason; this is that guard, for this table.

  SECURITY INVOKER on purpose. The lookups below must be subject to the caller's own RLS,
  so a budget the caller cannot see reads as absent rather than as a row to be checked.
  DEFINER here would hand the trigger the ability to confirm the existence of rows the
  caller has no business knowing about.
*/
create or replace function public.money_budget_boost_is_owned()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  src public.money_budget_plans;
  tgt public.money_budget_plans;
begin
  if new.user_id <> auth.uid() then
    raise exception 'that row is not yours' using errcode = '42501';
  end if;

  select * into src from public.money_budget_plans where id = new.source_budget_id;
  if src.id is null or src.user_id <> auth.uid() then
    raise exception 'the granting budget is not yours' using errcode = '42501';
  end if;

  select * into tgt from public.money_budget_plans where id = new.target_budget_id;
  if tgt.id is null or tgt.user_id <> auth.uid() then
    raise exception 'the receiving budget is not yours' using errcode = '42501';
  end if;

  /*
    Shape, not just ownership.

    Only a budget with fixed dates can grant: "for the months this falls in" has no
    meaning for a budget that recurs forever, and a monthly budget raising another
    monthly budget would raise it every month, which is simply a bigger limit typed in
    the wrong place.
  */
  if src.period <> 'custom' or src.ends_on is null then
    raise exception 'only a budget with fixed dates can raise another' using errcode = '22023';
  end if;

  -- And only a recurring budget can receive, for the mirror of that reason.
  if tgt.period = 'custom' then
    raise exception 'a budget with fixed dates cannot be raised' using errcode = '22023';
  end if;

  return new;
end $$;

revoke all on function public.money_budget_boost_is_owned() from public, anon, authenticated;

drop trigger if exists money_budget_boosts_owned on public.money_budget_boosts;
create trigger money_budget_boosts_owned
  before insert or update on public.money_budget_boosts
  for each row execute function public.money_budget_boost_is_owned();
