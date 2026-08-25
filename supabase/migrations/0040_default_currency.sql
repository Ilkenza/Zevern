-- The currency every new form starts on.
--
-- Every amount field opened on RSD because that was hard-coded as the fallback, so
-- someone who earns in euros re-picked EUR on every entry, every rule and every goal.
-- One setting, read once at the top of the app, and every form starts where you live.
alter table public.profiles
  add column if not exists default_currency text not null default 'RSD'
    check (default_currency in ('RSD', 'EUR', 'USD'));
