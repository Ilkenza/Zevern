-- Zevern — narrow what a leaked extension token can do.
--
-- Two things an adversarial read of 0028 turned up.
--
-- 1. The duplicate match still fell back to the name alone, and `p_name` is required,
--    so that branch always fired. Someone holding the token could guess a name and
--    overwrite that lead's contact, company, status and notes — with every omitted
--    field blanked. "Add-only" it was not.
-- 2. Only writes were counted. The two read functions were an unmetered oracle over
--    the owner's lead list, with nothing recorded to show the token had been used.

alter table public.ext_usage
  add column if not exists reads integer not null default 0;

comment on table public.ext_usage is
  'Per-day extension activity for one account. Written only by the SECURITY DEFINER ext_* functions; the owner may read it to see whether their token is being used.';

-- Reads are metered and capped too. The cap is loose enough that the extension never
-- meets it in a day of ordinary browsing, and tight enough that walking a lead list
-- through the RPC stops long before it finishes.
create or replace function public.ext_note_read(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
  daily_cap constant integer := 1000;
begin
  insert into public.ext_usage (user_id, day, reads)
  values (p_uid, current_date, 1)
  on conflict (user_id, day) do update set reads = public.ext_usage.reads + 1
  returning reads into used;

  if used > daily_cap then
    raise exception 'daily limit reached';
  end if;
end;
$$;

revoke execute on function public.ext_note_read(uuid) from public, anon, authenticated;

-- A contact is the only identifier precise enough to say "this is the same lead".
-- Without one, fall back to the name — but only against a lead that has no contact
-- either, so a named lead with a real contact can never be silently rewritten.
create or replace function public.ext_lead_exists(p_token text, p_contact text, p_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  found boolean;
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

  perform public.ext_note_read(uid);

  select exists(
    select 1
    from public.leads l
    where l.user_id = uid
      and (
        (coalesce(p_contact, '') <> '' and lower(l.contact) = lower(p_contact))
        or (coalesce(p_contact, '') = '' and l.contact is null
            and coalesce(p_name, '') <> '' and lower(l.name) = lower(p_name))
      )
  ) into found;

  return found;
end;
$$;

create or replace function public.ext_get_lead(p_token text, p_contact text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  row_out jsonb;
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

  perform public.ext_note_read(uid);

  select to_jsonb(x) into row_out from (
    select l.name, l.company, l.contact, l.channel, l.service, l.status, l.notes
    from public.leads l
    where l.user_id = uid
      and (
        (coalesce(p_contact, '') <> '' and lower(l.contact) = lower(p_contact))
        or (coalesce(p_contact, '') = '' and l.contact is null
            and coalesce(p_name, '') <> '' and lower(l.name) = lower(p_name))
      )
    order by l.created_at desc
    limit 1
  ) x;

  return row_out;
end;
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
  used integer;
  daily_cap constant integer := 200;
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

  insert into public.ext_usage (user_id, day, writes)
  values (uid, current_date, 1)
  on conflict (user_id, day) do update set writes = public.ext_usage.writes + 1
  returning writes into used;

  if used > daily_cap then
    raise exception 'daily limit reached';
  end if;

  select l.id into existing_id
  from public.leads l
  where l.user_id = uid
    and (
      (coalesce(p_contact, '') <> '' and lower(l.contact) = lower(p_contact))
      or (coalesce(p_contact, '') = '' and l.contact is null
          and lower(l.name) = lower(p_name))
    )
  order by l.created_at desc
  limit 1;

  if existing_id is not null then
    -- Fields the caller left out keep what the lead already had. Blanking them was
    -- how a single crafted call could strip a record while looking like an update.
    update public.leads set
      name = p_name,
      company = coalesce(nullif(p_company, ''), company),
      contact = coalesce(nullif(p_contact, ''), contact),
      channel = coalesce(nullif(p_channel, ''), channel),
      service = coalesce(nullif(p_service, ''), service),
      status  = coalesce(nullif(p_status, ''), status),
      notes   = coalesce(nullif(p_notes, ''), notes)
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

revoke execute on function public.ext_lead_exists(text, text, text) from public;
revoke execute on function public.ext_get_lead(text, text, text) from public;
revoke execute on function public.ext_add_lead(text, text, text, text, text, text, text, text)
  from public;

grant execute on function public.ext_lead_exists(text, text, text) to anon, authenticated;
grant execute on function public.ext_get_lead(text, text, text) to anon, authenticated;
grant execute on function public.ext_add_lead(text, text, text, text, text, text, text, text)
  to anon, authenticated;
