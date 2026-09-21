-- Zevern — dismissing the money setup run, without dismissing the work one.
--
-- `onboarding_hidden` was one boolean behind three cards: the getting-started checklist,
-- the freelance setup questions, and now the money ones. The first two sit on the work
-- screen and the third on the private one, so a single flag meant that pressing "Not now"
-- on the private page silently retired the setup run on the page the app is actually
-- bought for — a card disappearing on a screen the person was not looking at, in answer
-- to a question they were asked somewhere else.
--
-- A second column rather than a shared one, because the two halves are separately wanted:
-- somebody can be finished thinking about their own money and still be halfway through
-- putting their business name on a quote. The old column keeps its meaning exactly; this
-- one is additive and defaults to false, so no existing account changes state.

alter table public.profiles
  add column if not exists money_onboarding_hidden boolean not null default false;

comment on column public.profiles.money_onboarding_hidden is
  'Set when the owner dismisses the private-side setup questions. Separate from onboarding_hidden, which covers the work side. Completion is derived from the data, not stored.';
