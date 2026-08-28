-- Saying "the app is wrong, this is what I actually have" without lying about why.
--
-- The ledger's balance is the opening figure plus everything logged since. Reality
-- disagrees the first time something is forgotten — a coffee paid in cash, a card fee,
-- a note handed over and not written down. Until now the only way to close that gap was
-- to invent an expense, and an invented expense is not a repair: it lands in "where it
-- went", eats a category's limit, and joins the month's spending as though it had been
-- spent on something. The figures agree again and every one of them is now wrong.
--
-- A correction is its own kind because it is its own act. It moves the account's
-- balance and it is neither spending nor earning, so every sum in the app that counts
-- one of those already ignores it — they each name the kinds they add, and this is not
-- one of them.
alter table public.money_transactions drop constraint if exists money_transactions_kind_check;
alter table public.money_transactions add constraint money_transactions_kind_check
  check (kind in ('expense', 'income', 'transfer', 'saving', 'withdraw', 'loan_out', 'loan_in', 'correction'));

-- A correction is the only kind that may be negative.
--
-- Every other movement carries its direction in its name: an expense leaves, income
-- arrives, a transfer has two ends. A correction has no story to take a direction from
-- — it is the distance between what the app believes and what is true, and that
-- distance has a sign. Splitting it into `correction_up` and `correction_down` would
-- be two words for one arithmetic, and both would have to be taught to every screen.
alter table public.money_transactions drop constraint if exists money_transactions_amount_check;
alter table public.money_transactions add constraint money_transactions_amount_check
  check (amount is null or amount >= 0 or kind = 'correction');

-- A correction with no figure is not a correction: there is nothing to apply.
alter table public.money_transactions drop constraint if exists money_transactions_amount_known;
alter table public.money_transactions add constraint money_transactions_amount_known
  check (amount is not null or (kind = 'expense' and title is not null));
