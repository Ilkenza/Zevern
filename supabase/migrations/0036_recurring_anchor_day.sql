-- Zevern — remember which day of the month a rule is actually anchored to.
--
-- `nextDate` had to guess. Given only `next_on` it decided "is this a month-end rule?"
-- by asking whether the date is the last day of its own month — and in February the
-- 28th always is. So rent due on the 28th walked
--
--   2026-01-28 → 2026-02-28 → 2026-03-31 → 2026-04-30 → 2026-05-31 …
--
-- and because `postRecurring` writes the advanced date back, the rule was permanently
-- re-anchored to month-end after one February. Every forecast date for it was wrong
-- from then on, and the "due now" panel fired three days late, for ever.
--
-- The guess cannot be fixed by better arithmetic: 2026-02-28 genuinely is ambiguous —
-- it is both "the 28th" and "the last day". The only fix is to stop throwing the
-- answer away, so the day the rule was set up on is stored alongside it.

alter table public.money_recurring
  add column if not exists anchor_day smallint;

-- The best available answer for rules that already exist: the day `next_on` is on.
-- For a rule that has never crossed a February this is exactly right. For one that has
-- already drifted it reproduces today's behaviour rather than inventing a past.
update public.money_recurring
   set anchor_day = extract(day from next_on)::smallint
 where anchor_day is null;

alter table public.money_recurring
  add constraint money_recurring_anchor_day_range
  check (anchor_day is null or anchor_day between 1 and 31);

comment on column public.money_recurring.anchor_day is
  'Day of the month the rule is anchored to (1-31). 31 means the last day of any '
  'month, so it clamps to 30 or 28/29 without losing the anchor. Null on weekly '
  'rules, which have no day of the month.';
