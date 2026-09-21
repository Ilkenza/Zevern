-- Zevern — the charge a transfer costs, as its own entry.
--
-- A cash machine that is not your bank's takes a fee. Withdraw 5.000 and the bank is
-- debited 5.250: two different figures for one trip, and the app had room for only one.
-- A `transfer` is symmetric by construction — whatever leaves `account_id` arrives at
-- `to_account_id` — so the only way to record the trip was to pick a number, and picking
-- the bank's put 250 dinars of cash in a pocket that never held it. The owner's account
-- had two of these: 500 dinars of money that does not exist, and 500 dinars of real
-- spending that appeared nowhere in any month.
--
-- The fee is not part of the move. It is money that left and did not arrive, which is
-- exactly what an expense is — so it is written as one, and every screen that already
-- counts spending counts it without being told. The alternative, a `fee` column on the
-- transfer, would have meant teaching the month summary, the budgets, the category
-- breakdown and the forecast about a second kind of outgoing, and each of those is a
-- place it could silently go missing.
--
-- This column is what keeps the two rows one fact: it sits on the FEE, and points at the
-- transfer that caused it. Cascade, because a transfer that is deleted did not happen,
-- and a fee for a trip nobody took is not an expense — it is an orphan that quietly
-- overstates a month for ever.

alter table public.money_transactions
  add column if not exists fee_for_id uuid
    references public.money_transactions (id) on delete cascade;

comment on column public.money_transactions.fee_for_id is
  'Set on a fee expense, pointing at the transfer that incurred it (an ATM charge, a wire fee). Null on every ordinary entry. The pair is written and removed together; see saveTransaction.';

-- Read one way only: given a transfer, find its fee. Partial, because all but a handful
-- of rows are null and an index over those would be most of the table for no question.
create index if not exists money_transactions_fee_for_idx
  on public.money_transactions (fee_for_id)
  where fee_for_id is not null;
