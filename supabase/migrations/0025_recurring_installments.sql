-- Zevern — Recurring items that end.
--
-- Two ways to stop, usable together: a number of installments (rata na 4 meseca)
-- and a hard stop date. Whichever is reached first pauses the item; nothing is
-- deleted, so the history of what was already booked stays intact.

alter table public.money_recurring
  add column if not exists installments_total integer
    check (installments_total is null or installments_total > 0),
  add column if not exists installments_done integer not null default 0
    check (installments_done >= 0),
  add column if not exists ends_on date;

comment on column public.money_recurring.installments_total is
  'How many times this books in total. Null = repeats until paused by hand.';
comment on column public.money_recurring.installments_done is
  'How many have been booked so far; the item pauses itself once it reaches installments_total.';
comment on column public.money_recurring.ends_on is
  'Last date this may book on. Once the next due date falls past it, the item pauses itself.';
