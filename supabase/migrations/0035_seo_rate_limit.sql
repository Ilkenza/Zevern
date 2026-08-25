-- Zevern — a budget for the one action that makes the server talk to the internet.
--
-- `runCheck` fetches a URL the caller chose, from the server, and analyses what comes
-- back. The SSRF guard in the app decides *where* that request may go; nothing decided
-- *how often*. So a signed-in account was an unmetered outbound request primitive:
-- point it at a stranger's site in a loop and the traffic arrives from Zevern's IP,
-- with Zevern's name on the user agent, and the bill for it lands here.
--
-- The extension already has this shape of limit (`ext_usage`, 0028). This is the same
-- idea for a session-holding caller, with one addition: a minimum gap between checks.
-- The daily cap bounds the damage; the gap is what stops a loop being useful at all,
-- because the interesting abuse is a fast scan, not a slow one.
--
-- It lives in the database rather than in the action for the reason every other limit
-- here does: a server action is a callable endpoint, an in-process counter resets on
-- every deploy and does not exist at all across instances, and Postgres can hold a row
-- lock while it decides. Two requests arriving together get one answer between them.

create table if not exists public.seo_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- The day the count belongs to. When it is not today, the count is stale and reads
  -- as zero — which is the whole of the reset logic, and it needs no scheduled job.
  day     date not null default current_date,
  checks  integer not null default 0,
  last_at timestamptz not null default now()
);

alter table public.seo_usage enable row level security;

-- Readable by its owner so the screen can say how many are left. Never written from
-- the client: only the SECURITY DEFINER function below touches the count, so the
-- number cannot be edited by the account it limits.
drop policy if exists "Seo usage selectable by owner" on public.seo_usage;
create policy "Seo usage selectable by owner"
  on public.seo_usage for select using (auth.uid() = user_id);

/**
 * Claim one check, or refuse. Returns how many are left after this one.
 */
create or replace function public.claim_seo_check()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rec public.seo_usage%rowtype;
  used integer;
  daily_cap constant integer := 60;
  -- Long enough that a loop is pointless, short enough that nobody checking their
  -- own pages one after another ever meets it.
  min_gap constant interval := '6 seconds';
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  insert into public.seo_usage (user_id) values (uid)
  on conflict (user_id) do nothing;

  -- The lock is the point: without it two requests both read the same count, both
  -- find room under the cap, and both write it back.
  select * into rec from public.seo_usage where user_id = uid for update;

  used := case when rec.day = current_date then rec.checks else 0 end;

  if used >= daily_cap then
    raise exception 'daily limit reached';
  end if;

  -- `used > 0` so the row created a moment ago by the insert above does not refuse
  -- the very first check for being too soon after itself.
  if used > 0 and now() - rec.last_at < min_gap then
    raise exception 'too fast';
  end if;

  update public.seo_usage
     set day = current_date,
         checks = used + 1,
         last_at = now()
   where user_id = uid;

  return daily_cap - (used + 1);
end;
$$;

-- Anonymous callers have nothing to claim — auth.uid() is null for them and the
-- function refuses — but there is no reason for the grant to exist at all.
revoke execute on function public.claim_seo_check() from public, anon;
grant execute on function public.claim_seo_check() to authenticated;
