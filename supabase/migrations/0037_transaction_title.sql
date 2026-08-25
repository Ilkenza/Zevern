-- Every other thing in the private workspace has a name: a goal, a recurring rule, a
-- task. An entry did not — the list showed the category, so a month of spending read
-- as "Groceries, Groceries, Groceries" and none of it said what was actually bought.
--
-- Nullable on purpose: quick add is two taps and stays that way, so an entry logged
-- from a phone may arrive without one and the list falls back to the category name.
alter table public.money_transactions
  add column if not exists title text;

alter table public.money_transactions
  drop constraint if exists money_transactions_title_len;

alter table public.money_transactions
  add constraint money_transactions_title_len
  check (title is null or char_length(title) <= 80);
