-- Zevern — the things you buy, remembered.
--
-- Filing an expense means typing what it was, and for the things somebody buys weekly
-- that is the same string forever: `rozi sok`, `plavi sok`, `nivea men silver protect
-- stick`. Typed fresh every time it is slow, and it is spelled differently every third
-- time — which quietly ruins the one thing the ledger's search is for.
--
-- So a thing bought is a row: a name, and the price if it is known. Picking one fills the
-- entry in; typing a name nobody has used before makes one. Nothing here is a product
-- catalogue in the shop sense — there is no stock, no supplier, no code. It is a list of
-- words this person has already used, with the last price beside each.
--
-- `price` is nullable on purpose and stays a *default*, not a fact. Prices move, and an
-- entry saved at a different figure must never rewrite the row it was filled from: the
-- ledger is what happened, this is only what to suggest next time.
create table if not exists public.money_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  price        numeric(14, 2) check (price is null or price >= 0),
  currency     text not null default 'RSD' check (currency in ('RSD', 'EUR', 'USD')),
  -- Where it usually gets filed. Picking the thing can then fill the category too, and
  -- `on delete set null` because deleting a category must not delete the shopping list.
  category_id  uuid references public.money_categories (id) on delete set null,
  uses         integer not null default 0 check (uses >= 0),
  last_used_on date,
  created_at   timestamptz not null default now()
);

comment on table public.money_items is
  'Things bought, remembered so an expense can be filled from a list instead of retyped. Not a stock catalogue.';
comment on column public.money_items.price is
  'What it cost last time, as a suggestion. Null means the price is not known; an entry saved at another figure never rewrites this.';
comment on column public.money_items.uses is
  'How many entries have been filled from it. Orders the picker, so the weekly things stay at the top.';

-- One row per name per person, case- and space-insensitively. Two rows called `Rozi sok`
-- and `rozi sok ` is exactly the mess this table exists to prevent, and a unique index is
-- the only place that can be guaranteed. Leading with `user_id` also makes it the index
-- every read of this table uses.
create unique index if not exists money_items_user_name_idx
  on public.money_items (user_id, lower(btrim(name)));

-- The foreign key gets its own index: an unindexed FK turns deleting a category into a
-- sequential scan of this table, and every other FK in this schema already has one.
create index if not exists money_items_category_idx
  on public.money_items (category_id);

do $$
begin
  execute 'alter table public.money_items enable row level security';

  execute 'drop policy if exists "Selectable by owner" on public.money_items';
  execute 'drop policy if exists "Insertable by owner" on public.money_items';
  execute 'drop policy if exists "Updatable by owner" on public.money_items';
  execute 'drop policy if exists "Deletable by owner" on public.money_items';

  -- `(select auth.uid())` rather than a bare call: Postgres hoists the subquery into an
  -- InitPlan and evaluates it once per statement instead of once per row. The same form
  -- every other policy in this schema now uses.
  execute 'create policy "Selectable by owner" on public.money_items for select using ((select auth.uid()) = user_id)';
  execute 'create policy "Insertable by owner" on public.money_items for insert with check ((select auth.uid()) = user_id)';
  execute 'create policy "Updatable by owner" on public.money_items for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)';
  execute 'create policy "Deletable by owner" on public.money_items for delete using ((select auth.uid()) = user_id)';
end
$$;
