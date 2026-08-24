-- Zevern — colours the owner picked, kept.
--
-- The palette in the app is fixed and deliberately muted. Anyone who reaches for the
-- wheel has a reason, and having to find the same hex again next time is the kind of
-- small friction that makes an app feel borrowed rather than theirs.

alter table public.profiles
  add column if not exists custom_colors text[] not null default '{}';

comment on column public.profiles.custom_colors is
  'Hex colours this owner saved from the wheel, newest first. Capped in the action, not here.';
