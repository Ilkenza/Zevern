-- The account every form should reach for first.
--
-- Every screen that needed one fell back to `accounts[0]` — whichever row happened to
-- sort first — so the account you actually spend from was only ever the default by
-- accident, and stopped being it the moment another one was added. One flag settles
-- it, and the ordering in `getAccounts` carries it everywhere without a single form
-- learning about it.
alter table public.money_accounts
  add column if not exists is_default boolean not null default false;

-- At most one per person. A partial unique index rather than a trigger: the database
-- refuses a second default outright instead of trusting every writer to clear the old
-- one first.
create unique index if not exists money_accounts_one_default
  on public.money_accounts (user_id)
  where is_default;
