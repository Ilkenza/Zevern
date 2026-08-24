-- Zevern — a goal that behaves like real saving.
--
-- Until now a goal only went up. You could put money aside and nothing else: no way
-- to take it back out when the boiler died, no way to say the thing was bought, no
-- order between goals, and no way to have the standing amount go in by itself. Worse,
-- the money "put aside" was still counted as spendable everywhere else in the app, so
-- the goals screen and the forecast disagreed about the same dinars.

-- 1) Money can come back out of a goal.
--
-- A withdrawal is its own kind rather than a negative saving, because `amount` is
-- checked non-negative and because the two are genuinely different events: one is a
-- decision to save, the other a decision to stop. Keeping both means the history of a
-- goal reads as what actually happened.
alter table public.money_transactions drop constraint if exists money_transactions_kind_check;
alter table public.money_transactions add constraint money_transactions_kind_check
  check (kind in ('expense', 'income', 'transfer', 'saving', 'withdraw'));

-- 2) A goal can be finished, and goals can be ordered.
alter table public.money_goals
  add column if not exists completed_at date,
  add column if not exists sort integer not null default 0;

comment on column public.money_goals.completed_at is
  'The day the goal was closed — reached and spent, or abandoned. Archived goals with this set are history, not failures.';
comment on column public.money_goals.sort is
  'Priority order the owner chose. Lower first; ties fall back to created_at.';

create index if not exists money_goals_user_sort_idx
  on public.money_goals (user_id, sort, created_at);

-- 3) A recurring rule can feed a goal.
--
-- The app already knows how to repeat something and already forecasts ninety days.
-- A goal that says "12.000 a month to make it" and then leaves you to do that by hand
-- every month is asking you to be the machine.
alter table public.money_recurring
  add column if not exists goal_id uuid references public.money_goals (id) on delete set null;

create index if not exists money_recurring_goal_idx on public.money_recurring (goal_id);

comment on column public.money_recurring.goal_id is
  'Set when this rule is a standing order into a goal; booking it writes a saving against that goal rather than an expense.';
