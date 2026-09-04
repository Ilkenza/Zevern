--
-- The two tables the app has been reading and the repository never described.
--
-- `money_budget_amounts` and `money_budget_boosts` exist in the live database and are
-- queried by `src/lib/data/money/budget-plans.ts`, but no migration ever created them:
-- they were made by hand against the project. `supabase db reset` therefore produced a
-- database the app could not run against, and nobody found out until the Budgets screen
-- was opened on a fresh copy.
--
-- Written from the live schema, `if not exists` throughout, so it is a no-op against the
-- database that already has them and a faithful rebuild against one that does not.
--

-- A budget's limit as it changes over time. The plan carries today's figure; this is the
-- history behind it, so a period that has closed keeps the limit it was actually judged
-- against rather than the one somebody set afterwards.
create table if not exists public.money_budget_amounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  budget_id   uuid not null references public.money_budget_plans(id) on delete cascade,
  starts_on   date not null,
  amount_rsd  numeric(14,2) not null check (amount_rsd >= 0),
  created_at  timestamptz not null default now(),
  unique (budget_id, starts_on)
);

create index if not exists money_budget_amounts_user_id_idx
  on public.money_budget_amounts (user_id);
create index if not exists money_budget_amounts_budget_idx
  on public.money_budget_amounts (budget_id, starts_on desc);

-- One budget lending its month to another: a trip raising the month it falls in, rather
-- than the everyday limits being edited and then remembered back afterwards.
create table if not exists public.money_budget_boosts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  source_budget_id  uuid not null references public.money_budget_plans(id) on delete cascade,
  target_budget_id  uuid not null references public.money_budget_plans(id) on delete cascade,
  amount_rsd        numeric(14,2) not null check (amount_rsd > 0),
  created_at        timestamptz not null default now(),
  constraint money_budget_boost_not_self check (source_budget_id <> target_budget_id),
  unique (source_budget_id, target_budget_id)
);

create index if not exists money_budget_boosts_source_idx
  on public.money_budget_boosts (source_budget_id);
create index if not exists money_budget_boosts_target_budget_id_idx
  on public.money_budget_boosts (target_budget_id);
create index if not exists money_budget_boosts_target_idx
  on public.money_budget_boosts (user_id, target_budget_id);

-- Both hold one person's money. Nothing reaches either row but its owner.
alter table public.money_budget_amounts enable row level security;
alter table public.money_budget_boosts  enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'money_budget_amounts' and policyname = 'Selectable by owner') then
    create policy "Selectable by owner" on public.money_budget_amounts
      for select using ((select auth.uid()) = user_id);
    create policy "Insertable by owner" on public.money_budget_amounts
      for insert with check ((select auth.uid()) = user_id);
    create policy "Updatable by owner" on public.money_budget_amounts
      for update using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
    create policy "Deletable by owner" on public.money_budget_amounts
      for delete using ((select auth.uid()) = user_id);
  end if;

  if not exists (select 1 from pg_policies
                 where tablename = 'money_budget_boosts' and policyname = 'Selectable by owner') then
    create policy "Selectable by owner" on public.money_budget_boosts
      for select using ((select auth.uid()) = user_id);
    create policy "Insertable by owner" on public.money_budget_boosts
      for insert with check ((select auth.uid()) = user_id);
    create policy "Updatable by owner" on public.money_budget_boosts
      for update using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
    create policy "Deletable by owner" on public.money_budget_boosts
      for delete using ((select auth.uid()) = user_id);
  end if;
end $$;
