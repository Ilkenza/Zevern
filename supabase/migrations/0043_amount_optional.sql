-- An entry can be logged before its price is known.
--
-- You come back from the shop knowing exactly what you bought and not what it cost —
-- the receipt is in a pocket, the card statement is two days out, the pekara did not
-- give you one at all. Until now the only way to log that was to invent a figure, and
-- an invented figure is worse than no figure: it is indistinguishable from a real one
-- a month later, and every budget, balance and forecast quietly believes it.
--
-- So `amount` becomes nullable, and null means one specific thing: *this happened, and
-- what it cost is not known yet*. Nothing counts it. `amount_rsd` is generated from
-- `amount`, so it goes null with it, and every sum in the app already reads that column
-- as `Number(x) || 0` — a priceless entry adds nothing to a total rather than breaking
-- one. The entry still shows in the list, still carries its date, name and category,
-- and the screens offer it back as something to finish.
alter table public.money_transactions
  alter column amount drop not null;

-- The rest of the kinds always arrive with a figure and must keep doing so.
--
-- Money arriving, money moving between accounts, money set aside for a goal or taken
-- back out of one — you cannot be unsure what any of those were: the bank told you, the
-- ATM told you, and the goal arithmetic (`reserved`, `free`) has no way to represent an
-- unknown claim. Only a plain expense may be priceless, and only if it says what it was:
-- an entry with neither a figure nor a name is not a record of anything.
alter table public.money_transactions
  drop constraint if exists money_transactions_amount_known;

alter table public.money_transactions
  add constraint money_transactions_amount_known
  check (amount is not null or (kind = 'expense' and title is not null));

-- The screens ask "what is still missing a price" on every load of the private
-- workspace, and the answer is nearly always a handful of rows out of thousands. A
-- partial index is the whole table's worth of that question in a few pages.
create index if not exists money_tx_priceless_idx
  on public.money_transactions (user_id, occurred_on desc)
  where amount is null;
