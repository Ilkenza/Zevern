-- Zevern — what is actually in the house.
--
-- The problem this is for, in his words: bananas bought three weeks ago, forgotten,
-- rotten in four days, thrown out. The ledger recorded the purchase perfectly and had
-- nothing at all to say about the part that mattered, which is that the money bought
-- nothing.
--
-- What is deliberately NOT here: any figure in dinars. It was offered and turned down —
-- "nemoj raditi koliko je para baceno" — and the reason to write that down is that the
-- costing is the tempting part to add back later. Most of his item lines carry no price
-- at all (the price is on the receipt, not per article), so any waste figure would be the
-- app apportioning a total across a shopping bag and printing an estimate as if it were
-- a fact. The list answers "what do I still have", and stops there.

-- ---------------------------------------------------------------- the things you buy
--
-- Two questions, asked once per thing, in Setup:
--
--   kind        — food, drink, or neither. This is also the switch: only food and drink
--                 are followed into the house. Everything else stays what it has always
--                 been, a word on a shopping list, and the list of what is in the house
--                 does not fill up with phone bills and socks.
--   keeps_days  — how long it lasts, when that is a thing worth knowing. Null for a tin
--                 of fish, 5 for bananas. Optional on purpose: a rok on everything would
--                 be a form to fill in before the feature does anything for you.
alter table public.money_items
  add column if not exists kind text not null default 'other',
  add column if not exists keeps_days integer;

alter table public.money_items
  drop constraint if exists money_items_kind_check,
  drop constraint if exists money_items_keeps_days_check;

alter table public.money_items
  add constraint money_items_kind_check check (kind in ('food', 'drink', 'other')),
  add constraint money_items_keeps_days_check
    check (keeps_days is null or (keeps_days > 0 and keeps_days <= 3650));

comment on column public.money_items.kind is
  'food, drink or other. Food and drink are followed into money_stock when bought; other is not.';
comment on column public.money_items.keeps_days is
  'How many days it keeps, when that is worth knowing. Null means it does not go off.';

-- ------------------------------------------------------------------------ the lot
--
-- One row per purchase of a tracked thing: ten bananas bought on Tuesday. Not one row
-- per banana, and not one running total per item either — the lot is what carries a
-- date, and the date is what carries the rok.
--
-- `qty` is what was bought and never moves. What is left is worked out from the moves
-- below, the same way a debt's balance is worked out from its payments rather than kept
-- on the row: a stored counter is one more thing that can drift from the events it
-- claims to describe, and the events are the thing a person edits.
create table if not exists public.money_stock (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id        uuid not null references public.money_items (id) on delete cascade,
  -- Which shop trip it came from. `set null` because forgetting an entry must not delete
  -- the food: it is still in the fridge whatever the ledger says.
  transaction_id uuid references public.money_transactions (id) on delete set null,
  qty            numeric(12, 3) not null check (qty > 0),
  bought_on      date not null default current_date,
  -- Worked out from `keeps_days` at the moment of buying, then left alone. Changing how
  -- long bananas keep should not silently move the date on the bunch already in the
  -- bowl; and a lot bought before a rok was ever set simply has none.
  expires_on     date,
  created_at     timestamptz not null default now()
);

comment on table public.money_stock is
  'One purchase of one tracked thing — what is in the house until it is eaten or binned. No money on this row: see the migration header.';
comment on column public.money_stock.qty is
  'How many were bought, in whatever a "one" of this thing is. Never changes; what is left comes from money_stock_moves.';

-- Read one way only: everything of this person''s that is not finished, soonest rok first.
create index if not exists money_stock_user_expiry_idx
  on public.money_stock (user_id, expires_on, bought_on);
create index if not exists money_stock_item_idx on public.money_stock (item_id);
create index if not exists money_stock_transaction_idx on public.money_stock (transaction_id);

-- ----------------------------------------------------------------- what happened to it
--
-- Eaten or binned, a few at a time. Two of the ten bananas went; eight are still there.
--
-- A row rather than a decremented counter, so a wrong number is undone by deleting the
-- row that was wrong — the same undo the debts' history has — instead of by typing a
-- correction that has to be got right in the other direction.
create table if not exists public.money_stock_moves (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stock_id   uuid not null references public.money_stock (id) on delete cascade,
  kind       text not null check (kind in ('eaten', 'binned')),
  qty        numeric(12, 3) not null check (qty > 0),
  on_date    date not null default current_date,
  created_at timestamptz not null default now()
);

comment on table public.money_stock_moves is
  'Eaten or binned, in pieces. What is left of a lot is its qty minus these.';

create index if not exists money_stock_moves_stock_idx
  on public.money_stock_moves (stock_id, on_date desc);
create index if not exists money_stock_moves_user_idx
  on public.money_stock_moves (user_id, on_date desc);

do $$
declare
  t text;
begin
  foreach t in array array['money_stock', 'money_stock_moves'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Selectable by owner" on public.%I', t);
    execute format('drop policy if exists "Insertable by owner" on public.%I', t);
    execute format('drop policy if exists "Updatable by owner" on public.%I', t);
    execute format('drop policy if exists "Deletable by owner" on public.%I', t);
    -- `(select auth.uid())` so Postgres evaluates it once per statement, not once per
    -- row — the form every other policy in this schema uses.
    execute format('create policy "Selectable by owner" on public.%I for select using ((select auth.uid()) = user_id)', t);
    execute format('create policy "Insertable by owner" on public.%I for insert with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "Updatable by owner" on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "Deletable by owner" on public.%I for delete using ((select auth.uid()) = user_id)', t);
  end loop;
end
$$;

-- A move can only ever belong to a lot of the same person's.
--
-- RLS stops one person reading another's rows; on its own it does not stop a crafted
-- insert from *pointing* at them — a move row carrying the attacker's `user_id` and the
-- victim's `stock_id` passes both `with check` clauses, and then subtracts bananas from
-- somebody else's bowl. Every read here filters by `user_id` as well, but a rule the
-- application has to remember is a rule that gets forgotten once. The composite key
-- makes the bad row impossible to write in the first place.
alter table public.money_stock
  drop constraint if exists money_stock_id_user_key;
alter table public.money_stock
  add constraint money_stock_id_user_key unique (id, user_id);

alter table public.money_stock_moves
  drop constraint if exists money_stock_moves_stock_id_fkey,
  drop constraint if exists money_stock_moves_stock_fkey;
alter table public.money_stock_moves
  add constraint money_stock_moves_stock_fkey
    foreign key (stock_id, user_id) references public.money_stock (id, user_id) on delete cascade;
