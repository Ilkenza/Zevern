-- Money that came back is not money that was earned.
--
-- A shop cancelled half an order: the monitor was out of stock, the stand was delivered,
-- and the money for the monitor came back to the account. There was no way to say that.
-- The only kind that means "money arrived" is `income`, so that is what it was entered
-- as — and the month then read 10.993 of extra earnings on one side and kept the whole
-- cancelled order in Shopping on the other. A second monitor bought elsewhere landed in
-- Shopping too, so a screen whose one job is to say what a month cost reported two
-- monitors for a person who owns one.
--
-- Filing it as income cannot be right for a simpler reason than the arithmetic: nothing
-- came in. A refund is the undoing of a purchase, so it belongs where the purchase is —
-- in its category, with a minus in front of it. Every figure built on spending then
-- answers correctly without being asked twice: the month's total, the category, the
-- budget the purchase counted against, the strip of past periods, the typical month.
--
-- Hence a kind of its own rather than a negative expense. Amounts in this table are
-- positive by constraint and half the app takes that as read — biggest purchase, per
-- entry averages, the day strip — so a negative row would be a trap set for every
-- future reader of it. `refund` says what it is once, in the column every sum already
-- branches on, and each of those sums decides for itself what to do with it.

alter table public.money_transactions
  drop constraint if exists money_transactions_kind_check;

alter table public.money_transactions
  add constraint money_transactions_kind_check
  check (
    kind = any (
      array[
        'expense', 'income', 'transfer', 'saving', 'withdraw',
        'loan_out', 'loan_in', 'correction', 'refund'
      ]
    )
  );

-- The purchase it undoes, when it is known.
--
-- Optional, because money comes back for things that were never written down as one
-- entry — a bank reversing a charge, a deposit returned — and a refund with nothing to
-- point at is still a refund. When it is there it does three things a title cannot: the
-- form fills itself from the purchase, the ledger can say a purchase was refunded
-- without reading every other row, and the amount can be held to what was actually paid.
--
-- `set null` rather than cascade, which is the opposite of what the fee beside it does:
-- deleting a transfer deletes a charge for a trip that never happened, but deleting a
-- purchase does not un-refund it. The money came back either way, so the row stays and
-- forgets what it was for.
alter table public.money_transactions
  add column if not exists refund_of_id uuid
    references public.money_transactions (id) on delete set null;

comment on column public.money_transactions.refund_of_id is
  'Set on a refund, pointing at the purchase whose money came back. Null on every other kind, and null on a refund that names no purchase; see saveTransaction.';

-- Only a refund may claim to undo something. Without this the column is a second place
-- where an entry could quietly say it is a refund while its kind says it is not, and the
-- sums read the kind.
alter table public.money_transactions
  drop constraint if exists money_transactions_refund_link;

alter table public.money_transactions
  add constraint money_transactions_refund_link
  check (refund_of_id is null or kind = 'refund');

-- Read one way only: given a purchase, find what came back. Partial, because all but a
-- handful of rows are null and an index over those would be most of the table for no
-- question anybody asks.
create index if not exists money_transactions_refund_of_idx
  on public.money_transactions (refund_of_id)
  where refund_of_id is not null;
