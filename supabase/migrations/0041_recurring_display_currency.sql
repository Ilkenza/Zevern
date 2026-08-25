-- Show one rule in a currency of its own.
--
-- Everything in the private workspace is read in the currency on the profile, which is
-- right for totals and wrong for the handful of rules a person thinks about in another
-- one — a subscription billed in dollars is remembered as "$27 a month", not as
-- whatever that came to in euros this week. Null means "whatever the profile says",
-- which is what every existing rule keeps.
alter table public.money_recurring
  add column if not exists display_currency text
    check (display_currency is null or display_currency in ('RSD', 'EUR', 'USD'));
