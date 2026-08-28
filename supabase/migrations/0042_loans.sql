-- Zevern — money that moves without being earned or spent.
--
-- Until now the ledger had one shape for money leaving an account: an expense. That is
-- wrong for two common things. Lending a friend 10.000 is not spending — the money is
-- still yours, it is just in his pocket. Taking a 550.000 credit is not earning — the
-- money is on your account but you owe 600.000 for it.
--
-- Entered as expense and income they poison exactly the figures this app exists for:
-- the month you lend reads as a spending spike, the month you are repaid reads as a
-- windfall, and a credit makes you look like you earned half a million. Every one of
-- those lies also lands in `typical`, the six-month median that budgets are set from.
--
-- So: a loan is a thing with a name and a total, and the movements against it point at
-- it. The instalment stays an ordinary expense on purpose — see the note at the end.

-- 1) The loans themselves.
--
-- `direction` is written from the owner's side, because that is how anyone would say
-- it out loud: I lent it, or I took it. Everything else follows from that one word —
-- which way the money went at the start, and which way settles it.
--
-- `total_rsd` is what will ultimately be settled, not what changed hands. For a friend
-- those are the same 10.000. For a credit they are not: 550.000 lands and 600.000 is
-- repaid, and the 50.000 between them is the interest. Storing the repayment total is
-- what lets the balance run to exactly zero on the last instalment, with the interest
-- accounted for by the simple fact that less arrived than leaves.
create table if not exists public.money_loans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  direction  text not null default 'lent' check (direction in ('lent', 'borrowed')),
  total_rsd  numeric(14, 2) not null default 0 check (total_rsd >= 0),
  opened_on  date not null default current_date,
  settled_on date,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.money_loans is
  'Money owed in either direction. `lent` is owed to the owner, `borrowed` is owed by them.';
comment on column public.money_loans.total_rsd is
  'What will be settled in total — the repayment figure, not the amount that changed hands. A 550.000 credit repaid as 12 x 50.000 is stored as 600.000.';
comment on column public.money_loans.settled_on is
  'Set when the balance reached zero. A settled loan is history, not an outstanding debt.';

create index if not exists money_loans_user_open_idx
  on public.money_loans (user_id, settled_on, opened_on);

-- 2) Two new kinds, named for which way the cash went rather than for the story.
--
-- The story lives on the loan; the transaction only has to say whether money arrived or
-- left. That keeps all four movements unambiguous with two words instead of four:
--
--   lend a friend      -> loan_out     bank credits you   -> loan_in
--   friend repays you  -> loan_in      repay in one lump  -> loan_out
--
-- Neither counts as income or as spending anywhere in the app.
alter table public.money_transactions drop constraint if exists money_transactions_kind_check;
alter table public.money_transactions add constraint money_transactions_kind_check
  check (kind in ('expense', 'income', 'transfer', 'saving', 'withdraw', 'loan_out', 'loan_in'));

-- 3) What a movement belongs to.
--
-- Set on the loan's own movements and on every instalment that pays it down. On
-- delete set null rather than cascade: deleting a loan should forget the debt, not
-- erase entries from the ledger that really happened.
alter table public.money_transactions
  add column if not exists loan_id uuid references public.money_loans (id) on delete set null;

create index if not exists money_transactions_loan_idx
  on public.money_transactions (loan_id);

comment on column public.money_transactions.loan_id is
  'The debt this movement belongs to — the opening amount, a repayment, or an instalment.';

-- 4) A recurring rule can be the instalment plan of a loan.
--
-- The rule already knows how to repeat and already counts instalments; what it could
-- not say is what it is paying off. With this, booking a rate writes an expense that
-- carries the loan forward, and the debt falls by itself.
alter table public.money_recurring
  add column if not exists loan_id uuid references public.money_loans (id) on delete set null;

create index if not exists money_recurring_loan_idx on public.money_recurring (loan_id);

comment on column public.money_recurring.loan_id is
  'Set when this rule is the instalment plan of a loan; each booking pays that loan down.';

-- 5) RLS, same rule as every other money table.
do $$
begin
  execute 'alter table public.money_loans enable row level security';

  execute 'drop policy if exists "Selectable by owner" on public.money_loans';
  execute 'drop policy if exists "Insertable by owner" on public.money_loans';
  execute 'drop policy if exists "Updatable by owner" on public.money_loans';
  execute 'drop policy if exists "Deletable by owner" on public.money_loans';

  execute 'create policy "Selectable by owner" on public.money_loans for select using (auth.uid() = user_id)';
  execute 'create policy "Insertable by owner" on public.money_loans for insert with check (auth.uid() = user_id)';
  execute 'create policy "Updatable by owner" on public.money_loans for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  execute 'create policy "Deletable by owner" on public.money_loans for delete using (auth.uid() = user_id)';
end $$;

-- Why an instalment stays an ordinary `expense` rather than becoming a `loan_out`.
--
-- It is the one movement here that genuinely costs you the month. A rate of 50.000 is
-- 50.000 you cannot spend on anything else, every month, whether you planned for it or
-- not — which is the exact definition of something a budget has to see. Hide it and the
-- app tells you there is 50.000 of room that does not exist, and that is the worst
-- mistake a budget can make.
--
-- The one-off movements are different: lending 10.000 does not change what the month
-- costs, it changes where the 10.000 is sitting. So those stay out of the figures, and
-- the instalment stays in. The `loan_id` is what ties them together either way.
