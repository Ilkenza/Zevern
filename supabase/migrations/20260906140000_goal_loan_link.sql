-- A goal that is a debt, said once.
--
-- Paying off a credit and filling a goal are the same errand, and until now the app
-- offered both and joined neither: the same laptop credit got written down as a debt and
-- as a paying-off goal, and the two totals drifted apart by the amount of one typo. This
-- is the join.
--
-- The rule that makes it safe rather than making it worse: **a linked goal has no
-- figures of its own.** `target_rsd`, `target_amount`, `currency` and `rate` are ignored
-- for a goal carrying a `loan_id` — the reader takes the target from `money_loans.total_rsd`
-- and the progress from what the ledger has settled against that debt. The form stops
-- offering the amount field at all, so there is no second number to disagree with the
-- first. Two rows, one figure.
--
-- `on delete set null` rather than cascade: forgetting a debt must not silently take a
-- goal with it. The goal stays, unlinked, and says nothing it cannot support.
alter table public.money_goals
  add column if not exists loan_id uuid references public.money_loans(id) on delete set null;

comment on column public.money_goals.loan_id is
  'The debt this goal is a view of. When set, the target and the progress are read from '
  'money_loans and this row''s own target columns are ignored.';

create index if not exists money_goals_loan_idx
  on public.money_goals (loan_id)
  where loan_id is not null;

-- One goal per debt. Two goals watching one credit would put the same figure on the
-- screen twice, which is the failure this column exists to end.
create unique index if not exists money_goals_loan_unique
  on public.money_goals (user_id, loan_id)
  where loan_id is not null;
