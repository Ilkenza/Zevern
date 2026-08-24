-- Zevern — onboarding progress.
--
-- The steps themselves are never stored: each one is answered by asking whether the
-- thing exists yet (is there a client, is there an invoice). That way the checklist
-- cannot drift out of step with reality, and deleting the last client honestly
-- un-ticks that step again.
--
-- The only thing worth persisting is the owner's decision to stop being shown it.

alter table public.profiles
  add column if not exists onboarding_hidden boolean not null default false;

comment on column public.profiles.onboarding_hidden is
  'Set when the owner dismisses the getting-started checklist. Completion is derived, not stored.';
