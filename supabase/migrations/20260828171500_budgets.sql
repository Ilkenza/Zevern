-- Zevern — budgets become things you make, instead of a limit hanging off a category.
--
-- What was here was one number per category, monthly, forever. It answers exactly one
-- question — "am I over on Groceries this month" — and it cannot be asked anything
-- else. A holiday you are saving three months for, a week of a friend visiting, "keep
-- eating out under 8.000 a fortnight", "put 40.000 aside this month": none of them is a
-- category with a monthly ceiling, and none of them could be written down.
--
-- So a budget becomes an object with a name, its own money, its own clock and its own
-- idea of what counts. Four questions, and every combination of them is a real budget
-- somebody keeps:
--
--   what it measures   expense (what goes out) or savings (what is left over)
--   what it counts     everything matching its filters, or only what you put in it
--   how long           a day, a week, a month, a year — any multiple — or fixed dates
--   over what          which categories, and optionally which accounts
--
-- The old table is left exactly where it is. Every limit in it is copied forward at the
-- bottom of this file, and nothing reads it afterwards — but a migration that drops the
-- only copy of somebody's numbers on the same day it rewrites the screen they live on
-- is a migration with no way back. It can be dropped in a later one, once this has been
-- used for a while.

-- 1) The budget itself.
create table if not exists public.money_budget_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),

  -- What the number means. An expense budget is a ceiling and is in trouble when it is
  -- exceeded; a savings budget is a floor and is in trouble when it is not reached. One
  -- word, and it inverts every judgement the screen makes.
  kind         text not null default 'expense' check (kind in ('expense', 'savings')),

  -- Where its entries come from. 'all' sweeps up everything matching the filters below,
  -- which is what you want for something standing and repeating. 'added' counts only
  -- entries you deliberately put in it — the only honest way to do a holiday, where the
  -- flight, the hotel and the dinners are spread over five categories and four months
  -- and no filter would ever gather exactly those and nothing else.
  membership   text not null default 'all' check (membership in ('all', 'added')),

  -- Dinars, like every other figure in this app. What it is typed and read in is a
  -- display question, settled once in Setup.
  amount_rsd   numeric(14, 2) not null default 0 check (amount_rsd >= 0),

  -- The clock. `period_count` is the multiplier, so "every 2 weeks" and "every 6
  -- months" cost one column rather than a table of their own, and `starts_on` is the
  -- anchor every window is measured from — which is what lets a fortnight land on the
  -- right fortnight and a monthly budget run 15th to 14th if that is when you are paid.
  period       text not null default 'month' check (period in ('custom', 'day', 'week', 'month', 'year')),
  period_count integer not null default 1 check (period_count between 1 and 60),
  starts_on    date not null default current_date,

  -- Only a custom budget has an end: it is one window and then it is over. Everything
  -- else repeats forever, and `ends_on` staying null is what says so.
  ends_on      date,

  color        text,
  archived     boolean not null default false,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),

  constraint money_budget_plans_custom_needs_end
    check (period <> 'custom' or ends_on is not null),
  constraint money_budget_plans_end_after_start
    check (ends_on is null or ends_on >= starts_on),
  -- A repeating budget has no end date; letting one carry a stale `ends_on` would give
  -- the period arithmetic two answers to the same question.
  constraint money_budget_plans_repeat_has_no_end
    check (period = 'custom' or ends_on is null)
);

comment on table public.money_budget_plans is
  'A named budget: its money, its clock, and whether it counts everything matching its filters or only what was added to it.';
comment on column public.money_budget_plans.membership is
  '''all'' sweeps up matching entries; ''added'' counts only entries carrying this budget''s id.';
comment on column public.money_budget_plans.starts_on is
  'The anchor every period is measured from — not merely the first day, which is why a monthly budget can run 15th to 14th.';

create index if not exists money_budget_plans_user_idx
  on public.money_budget_plans (user_id, archived, sort);

-- 2) What an 'all' budget looks at.
--
-- Two link tables rather than two arrays, because these are foreign keys and should
-- behave like it: delete a category and it leaves the budgets that named it, instead of
-- leaving an id behind that resolves to nothing.
--
-- Empty means "no restriction on this axis", and that is the useful default rather than
-- an oversight: a budget with no accounts named watches all of them, which is what
-- almost everybody means, and naming one is how you say "cash only".
create table if not exists public.money_budget_categories (
  budget_id   uuid not null references public.money_budget_plans (id) on delete cascade,
  category_id uuid not null references public.money_categories (id) on delete cascade,
  primary key (budget_id, category_id)
);

create table if not exists public.money_budget_accounts (
  budget_id  uuid not null references public.money_budget_plans (id) on delete cascade,
  account_id uuid not null references public.money_accounts (id) on delete cascade,
  primary key (budget_id, account_id)
);

create index if not exists money_budget_categories_category_idx
  on public.money_budget_categories (category_id);
create index if not exists money_budget_accounts_account_idx
  on public.money_budget_accounts (account_id);

-- 3) An entry can be put in a budget by hand.
--
-- `on delete set null`, not cascade: deleting a holiday budget should forget the
-- holiday, not erase the flight you paid for.
alter table public.money_transactions
  add column if not exists budget_id uuid references public.money_budget_plans (id) on delete set null;

create index if not exists money_transactions_budget_idx
  on public.money_transactions (budget_id) where budget_id is not null;

comment on column public.money_transactions.budget_id is
  'Set when this entry was deliberately added to an ''added only'' budget.';

-- 4) RLS.
--
-- The plan carries `user_id` and is guarded the same way as every other table here. The
-- two link tables carry no `user_id` at all and are guarded through their parent
-- instead. That is deliberate: a copied `user_id` on a child row is a second answer to
-- a question that already has one, and the day the two disagree is the day a row is
-- visible to the wrong person. Reaching through the foreign key cannot drift, because
-- there is only ever one copy of the fact.
do $$
begin
  execute 'alter table public.money_budget_plans enable row level security';
  execute 'drop policy if exists "Selectable by owner" on public.money_budget_plans';
  execute 'drop policy if exists "Insertable by owner" on public.money_budget_plans';
  execute 'drop policy if exists "Updatable by owner" on public.money_budget_plans';
  execute 'drop policy if exists "Deletable by owner" on public.money_budget_plans';
  execute 'create policy "Selectable by owner" on public.money_budget_plans for select using (auth.uid() = user_id)';
  execute 'create policy "Insertable by owner" on public.money_budget_plans for insert with check (auth.uid() = user_id)';
  execute 'create policy "Updatable by owner" on public.money_budget_plans for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  execute 'create policy "Deletable by owner" on public.money_budget_plans for delete using (auth.uid() = user_id)';
end $$;

do $$
declare
  t text;
  owns text;
begin
  foreach t in array array['money_budget_categories', 'money_budget_accounts'] loop
    execute format('alter table public.%I enable row level security', t);

    owns := 'exists (select 1 from public.money_budget_plans p'
         || ' where p.id = budget_id and p.user_id = auth.uid())';

    execute format('drop policy if exists "Selectable by owner" on public.%I', t);
    execute format('drop policy if exists "Insertable by owner" on public.%I', t);
    execute format('drop policy if exists "Updatable by owner" on public.%I', t);
    execute format('drop policy if exists "Deletable by owner" on public.%I', t);

    execute format('create policy "Selectable by owner" on public.%I for select using (%s)', t, owns);
    execute format('create policy "Insertable by owner" on public.%I for insert with check (%s)', t, owns);
    execute format('create policy "Updatable by owner" on public.%I for update using (%s) with check (%s)', t, owns, owns);
    execute format('create policy "Deletable by owner" on public.%I for delete using (%s)', t, owns);
  end loop;
end $$;

-- The link tables say which category a budget watches, and RLS on them checks the
-- budget. Nothing there checks the *category*, so without this a crafted insert could
-- point one of your budgets at somebody else's category id — and while it would show
-- you nothing (their entries are invisible to you anyway), it would confirm that the id
-- exists. These close that: the row has to belong to you on both ends.
-- `security invoker` on purpose: run as the caller, the two lookups below are filtered
-- by the same RLS as everything else, and somebody else's budget or category simply is
-- not there to be found. A definer function would have had to re-implement that check
-- by hand, and would have been one more thing answering questions for anyone who could
-- call it.
create or replace function public.money_budget_link_is_owned()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  owner uuid;
begin
  select user_id into owner from public.money_budget_plans where id = new.budget_id;
  if owner is null or owner <> auth.uid() then
    raise exception 'budget does not belong to the caller' using errcode = '42501';
  end if;

  if tg_table_name = 'money_budget_categories' then
    perform 1 from public.money_categories where id = new.category_id and user_id = owner;
  else
    perform 1 from public.money_accounts where id = new.account_id and user_id = owner;
  end if;

  if not found then
    raise exception 'that row is not on your profile' using errcode = '42501';
  end if;

  return new;
end $$;

revoke all on function public.money_budget_link_is_owned() from public, anon, authenticated;

drop trigger if exists money_budget_categories_owned on public.money_budget_categories;
create trigger money_budget_categories_owned
  before insert or update on public.money_budget_categories
  for each row execute function public.money_budget_link_is_owned();

drop trigger if exists money_budget_accounts_owned on public.money_budget_accounts;
create trigger money_budget_accounts_owned
  before insert or update on public.money_budget_accounts
  for each row execute function public.money_budget_link_is_owned();

-- 5) Carry the old limits forward.
--
-- Each category limit becomes the simplest budget that means the same thing: a monthly
-- expense budget over that one category, named after it, anchored to the first of this
-- month. Runs once — a second run finds the names already there and does nothing, so
-- re-applying this file cannot double anybody's budgets.
do $$
declare
  row record;
  new_id uuid;
begin
  for row in
    select b.user_id, b.amount_rsd, c.id as category_id, c.name, c.color
    from public.money_budgets b
    join public.money_categories c on c.id = b.category_id
    where b.amount_rsd > 0
  loop
    if exists (
      select 1 from public.money_budget_plans p
      where p.user_id = row.user_id and p.name = row.name
    ) then
      continue;
    end if;

    insert into public.money_budget_plans
      (user_id, name, kind, membership, amount_rsd, period, period_count, starts_on, color)
    values
      (row.user_id, row.name, 'expense', 'all', row.amount_rsd, 'month', 1,
       date_trunc('month', current_date)::date, row.color)
    returning id into new_id;

    insert into public.money_budget_categories (budget_id, category_id)
    values (new_id, row.category_id)
    on conflict do nothing;
  end loop;
end $$;
