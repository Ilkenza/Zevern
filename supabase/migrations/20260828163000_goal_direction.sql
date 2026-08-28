-- A goal is either money being collected or money being paid off. The arithmetic is
-- the same in both directions -- a running figure against a target -- but what counts
-- toward it is not: a saving goal is fed by `saving`/`withdraw` entries that reserve
-- money on the account, and a paying-off goal is fed by `expense`/`income` entries
-- that reserve nothing, because that money has already left.
alter table public.money_goals
  add column if not exists direction text not null default 'income';

alter table public.money_goals
  drop constraint if exists money_goals_direction_check;

alter table public.money_goals
  add constraint money_goals_direction_check
  check (direction in ('income', 'expense'));
