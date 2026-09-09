-- A debt said in the currency it was agreed in.
--
-- `total_rsd` was the only figure a debt had, so every debt was a dinar debt. In Belgrade
-- that is wrong for exactly the debts that matter most: a bank credit is written in euros
-- and repaid in dinars at the day's rate, and 5.000 borrowed from a friend abroad is five
-- thousand of whatever he handed over.
--
-- Same three columns a goal carries, for the same reason and read the same way:
--   total_amount — what was agreed, in its own currency
--   currency     — which currency that is
--   rate         — the rate it was converted at, kept so the conversion can be explained
--   total_rsd    — what that came to in dinars, which is what the ledger measures against
--
-- Converted once, at the rate of the day it was written down, rather than followed. A
-- debt whose dinar total moved with the exchange rate would make every instalment plan
-- and every "left to pay" on the screen change under the reader for reasons that have
-- nothing to do with anything they did.
alter table public.money_loans
  add column if not exists total_amount numeric,
  add column if not exists currency text not null default 'RSD',
  add column if not exists rate numeric not null default 1;

-- Every debt that already exists was typed in dinars, so it says so.
update public.money_loans set total_amount = total_rsd where total_amount is null;

alter table public.money_loans
  drop constraint if exists money_loans_currency_check,
  drop constraint if exists money_loans_rate_check,
  drop constraint if exists money_loans_total_amount_check;

alter table public.money_loans
  add constraint money_loans_currency_check check (currency = any (array['RSD','EUR','USD'])),
  add constraint money_loans_rate_check check (rate > 0),
  add constraint money_loans_total_amount_check check (total_amount is null or total_amount >= 0);
