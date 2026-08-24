-- Zevern — security hardening.
--
-- Three separate problems, one migration because they all touch how the database
-- decides who is allowed to do what.
--
-- 1. The browser-extension token was a bearer credential stored in plain text, and
--    the RPCs matched the caller's contact string with `ilike`. A caller who knew
--    the token could send "%" and read or overwrite the whole leads table, even
--    though the extension is documented as add-only.
-- 2. delete_user() took no argument and destroyed the account with no server-side
--    confirmation of any kind.
-- 3. Invoice numbers were derived from a row count, so deleting an invoice made the
--    next one reuse a number that had already been issued.

-- ---------------------------------------------------------------- 1) ext token

-- Store the SHA-256 of the token, never the token. The plaintext is shown to the
-- user once, at generation, and is unrecoverable afterwards.
alter table public.profiles
  add column if not exists ext_token_hash text unique;

update public.profiles
   set ext_token_hash = encode(extensions.digest(ext_token, 'sha256'), 'hex')
 where ext_token is not null
   and ext_token_hash is null;

alter table public.profiles drop column if exists ext_token;

-- Every ext_* function now: hashes the incoming token, matches the contact by
-- exact case-insensitive equality instead of a pattern, pins search_path to '',
-- and gives the same generic error whatever went wrong with authentication.

create or replace function public.ext_lead_exists(p_token text, p_contact text, p_name text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.leads l
    join public.profiles pr on pr.id = l.user_id
    where coalesce(p_token, '') <> ''
      and pr.ext_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and (
        (coalesce(p_contact, '') <> '' and lower(l.contact) = lower(p_contact))
        or (coalesce(p_name, '') <> '' and lower(l.name) = lower(p_name))
      )
  );
$$;

create or replace function public.ext_get_lead(p_token text, p_contact text, p_name text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select to_jsonb(x) from (
    select l.name, l.company, l.contact, l.channel, l.service, l.status, l.notes
    from public.leads l
    join public.profiles pr on pr.id = l.user_id
    where coalesce(p_token, '') <> ''
      and pr.ext_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and (
        (coalesce(p_contact, '') <> '' and lower(l.contact) = lower(p_contact))
        or (coalesce(p_name, '') <> '' and lower(l.name) = lower(p_name))
      )
    order by l.created_at desc
    limit 1
  ) x;
$$;

create or replace function public.ext_add_lead(
  p_token text,
  p_name text,
  p_company text,
  p_contact text,
  p_channel text,
  p_service text,
  p_status text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  existing_id uuid;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'unauthorized';
  end if;

  select id into uid
  from public.profiles
  where ext_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if uid is null then
    raise exception 'unauthorized';
  end if;

  if coalesce(p_name, '') = '' then
    raise exception 'name required';
  end if;

  select l.id into existing_id
  from public.leads l
  where l.user_id = uid
    and (
      (coalesce(p_contact, '') <> '' and lower(l.contact) = lower(p_contact))
      or (coalesce(p_name, '') <> '' and lower(l.name) = lower(p_name))
    )
  order by l.created_at desc
  limit 1;

  if existing_id is not null then
    update public.leads set
      name = p_name,
      company = nullif(p_company, ''),
      contact = nullif(p_contact, ''),
      channel = nullif(p_channel, ''),
      service = nullif(p_service, ''),
      status = coalesce(nullif(p_status, ''), 'new'),
      notes = nullif(p_notes, '')
    where id = existing_id
      and user_id = uid;
    return existing_id;
  end if;

  insert into public.leads (user_id, name, company, contact, channel, service, status, notes)
  values (
    uid,
    p_name,
    nullif(p_company, ''),
    nullif(p_contact, ''),
    nullif(p_channel, ''),
    nullif(p_service, ''),
    coalesce(nullif(p_status, ''), 'new'),
    nullif(p_notes, '')
  )
  returning id into existing_id;

  return existing_id;
end;
$$;

grant execute on function public.ext_lead_exists(text, text, text) to anon, authenticated;
grant execute on function public.ext_get_lead(text, text, text) to anon, authenticated;
grant execute on function public.ext_add_lead(text, text, text, text, text, text, text, text)
  to anon, authenticated;

-- ------------------------------------------------------------ 2) delete_user

-- The old signature took nothing and deleted the account on sight. Drop it so it
-- cannot be called at all, and require the caller to retype their own email — a
-- check the browser cannot skip, unlike the checkbox that guarded it before.
drop function if exists public.delete_user();

create or replace function public.delete_user(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  addr text;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select email into addr from auth.users where id = uid;

  if addr is null or lower(trim(p_confirm)) is distinct from lower(addr) then
    raise exception 'confirmation does not match';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_user(text) from anon;
grant execute on function public.delete_user(text) to authenticated;

-- -------------------------------------------------------- 3) invoice numbers

-- Existing duplicates have to go before the constraint can hold. Keep the oldest
-- row's number as issued and suffix the later ones rather than blanking them, so
-- nothing that was already sent to a client silently loses its reference.
with dupes as (
  select id,
         number,
         row_number() over (partition by user_id, number order by created_at) as seq
  from public.invoices
  where number is not null
)
update public.invoices i
   set number = d.number || '-' || d.seq
  from dupes d
 where i.id = d.id
   and d.seq > 1;

create unique index if not exists invoices_user_number_key
  on public.invoices (user_id, number)
  where number is not null;
