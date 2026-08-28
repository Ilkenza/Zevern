-- Which accounts earn a place in the compact Overview balance readout.
--
-- A rank rather than a boolean lets the database enforce the actual product rule:
-- there are two places, no more. Null means the account stays available everywhere
-- else but is not repeated on Overview.
alter table public.money_accounts
  add column if not exists overview_rank smallint;

alter table public.money_accounts
  drop constraint if exists money_accounts_overview_rank_range;

alter table public.money_accounts
  add constraint money_accounts_overview_rank_range
  check (overview_rank is null or overview_rank between 1 and 2);

create unique index if not exists money_accounts_one_per_overview_slot
  on public.money_accounts (user_id, overview_rank)
  where overview_rank is not null;

-- Preserve the current experience: the default account first, then the next account.
-- Anyone can hide either one in Setup afterwards.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by is_default desc, sort, created_at, id
    ) as position
  from public.money_accounts
  where not archived
)
update public.money_accounts as account
set overview_rank = ranked.position
from ranked
where account.id = ranked.id
  and ranked.position <= 2
  and account.overview_rank is null;
