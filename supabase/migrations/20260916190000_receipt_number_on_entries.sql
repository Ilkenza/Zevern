-- The fiscal receipt an entry came from, when it came from one.
--
-- Text, and nothing more: the point of scanning a receipt in this app is that the paper
-- becomes words in the entry, so nothing is stored that the entry could not already hold.
-- This is the one figure the printed lines do not carry — the number that tells two
-- receipts apart — and it is here so that scanning the same slip twice can be answered
-- with "you entered this on the 12th".
--
-- Deliberately NOT unique. One shop trip is often two entries here — the week's food and
-- the food that goes to work are different categories out of the same bag — and a
-- constraint would refuse the second one. The app warns and lets the person decide.
alter table public.money_transactions
  add column if not exists receipt_no text;

create index if not exists money_transactions_receipt_no_idx
  on public.money_transactions (user_id, receipt_no)
  where receipt_no is not null;
