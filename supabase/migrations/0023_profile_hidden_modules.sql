-- Per-user list of app modules hidden from the sidebar (Settings toggles).
alter table public.profiles
  add column if not exists hidden_modules text[] not null default '{}';
