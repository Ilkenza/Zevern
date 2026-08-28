-- Line items on an entry: what was actually in the bag.
--
-- A shop trip is one movement of money and several things bought, and until now the
-- app could only record the first of those. The name field took "Maxi, weekly shop"
-- and everything inside it had to be typed as one comma-separated line that nothing
-- could ever read back.
--
-- Stored on the row rather than in a table of their own, deliberately. Items belong to
-- exactly one entry, are never read without it, and are never queried on their own — so
-- a table would buy a join on the busiest read in the app and a second set of RLS
-- policies to get right, in exchange for nothing this version needs. The column
-- inherits the entry's own row-level security, which is the strongest reason of all.
--
-- Shape: [{ "name": "Kafa 3 u 1", "qty": 10, "amount": 200 }, ...]
-- `amount` is that line's total in the entry's own currency, not a unit price — it is
-- the figure printed on the receipt beside the line, which is what anybody copying a
-- receipt actually has in front of them.

alter table money_transactions
  add column if not exists items jsonb;

alter table money_transactions
  drop constraint if exists money_transactions_items_is_array;

alter table money_transactions
  add constraint money_transactions_items_is_array
  check (items is null or jsonb_typeof(items) = 'array');

comment on column money_transactions.items is
  'Line items: [{name, qty, amount}]. amount is the line total in the entry currency.';
