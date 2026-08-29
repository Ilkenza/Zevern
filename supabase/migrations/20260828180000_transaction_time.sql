-- An entry can carry the time of day it happened.
--
-- `occurred_on` is a date and nothing else, which is right for almost everything the app
-- asks: which month, which budget window, how many days into it. But it cannot order
-- three coffees bought on the same afternoon, and it cannot answer "when do I actually
-- spend" — the question a spending tracker gets asked the moment it has a year of data.
--
-- A plain `time` beside the date rather than a `timestamptz` in place of it. Every date
-- in Zevern is deliberately a wall clock with no zone: it reads back the same wherever
-- it is opened, and `next.config.ts` pins the server's clock precisely so "today" cannot
-- disagree with itself. Folding the date into a timestamp would put a zone into all of
-- it, and would touch every month range, every budget window, the forecast and the
-- calendar feed to buy a field almost nobody fills in.
--
-- Nullable because it has to be optional. Quick add is two taps and stays two taps, and
-- an entry typed from memory three days later has a date and honestly has no time.
alter table public.money_transactions
  add column if not exists occurred_at time;

comment on column public.money_transactions.occurred_at is
  'Wall-clock time of day, no zone — optional. Orders entries within a day; null sorts last.';

-- The list reads newest first and now has a second key to read it by. Entries with no
-- time sort after the ones that have it on the same day, which is the honest order: a
-- known 18:40 is later in the day than "sometime that Tuesday".
create index if not exists money_tx_user_day_time_idx
  on public.money_transactions (user_id, occurred_on desc, occurred_at desc nulls last);
