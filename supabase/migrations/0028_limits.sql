-- Zevern — limits the application cannot forget.
--
-- Two kinds of bound, both put in the database on purpose: a check constraint holds
-- for every future action, migration and RPC without anyone remembering to add it,
-- and it holds for the extension path too, which does not go through the app at all.

-- ------------------------------------------------------- 1) text length caps

-- Every free-text column reachable from a form was unbounded `text`. A single
-- request could write a hundred megabytes into a note. The caps below are far
-- larger than any honest input, so they never annoy anyone — they only stop the
-- pathological case.
do $$
declare
  rule record;
begin
  for rule in
    select * from (values
      ('clients',            'name',              200),
      ('clients',            'contact',           200),
      ('clients',            'notes',            5000),
      ('clients',            'business_type',     100),
      ('leads',              'name',              200),
      ('leads',              'company',           200),
      ('leads',              'contact',           300),
      ('leads',              'notes',            5000),
      ('projects',           'title',             300),
      ('projects',           'description',     10000),
      ('quotes',             'title',             300),
      ('invoices',           'number',             60),
      ('tasks',              'title',             500),
      ('tools',              'name',              200),
      ('tools',              'url',              2000),
      ('tools',              'notes',            5000),
      ('tools',              'category',          100),
      ('service_items',      'label',             300),
      ('service_items',      'category',          100),
      ('outreach_templates', 'title',             200),
      ('outreach_templates', 'body',            20000),
      ('seo_checks',         'url',              2000),
      ('seo_checks',         'title',            1000),
      ('money_accounts',     'name',              120),
      ('money_categories',   'name',              120),
      ('money_categories',   'icon',               64),
      ('money_goals',        'name',              200),
      ('money_recurring',    'name',              200),
      ('money_transactions', 'note',             2000),
      ('profiles',           'full_name',         200),
      ('profiles',           'handle',             60),
      ('profiles',           'business_name',     200),
      ('profiles',           'business_email',    320),
      ('profiles',           'business_address', 1000),
      ('profiles',           'vat_id',             60),
      ('profiles',           'avatar_url',       2000)
    ) as t(tbl, col, cap)
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      rule.tbl, rule.tbl || '_' || rule.col || '_len'
    );
    execute format(
      'alter table public.%I add constraint %I check (%I is null or char_length(%I) <= %s)',
      rule.tbl, rule.tbl || '_' || rule.col || '_len', rule.col, rule.col, rule.cap
    );
  end loop;
end $$;

-- ------------------------------------------------ 2) extension write throttle

-- ext_add_lead is callable by `anon` with only a token, so a leaked token means
-- unbounded anonymous inserts into someone's lead list with nothing to notice it.
-- Count what each token actually writes and stop it at a day's worth. This counts
-- RPC inserts only — importing a large CSV through the app is a different door and
-- must not spend this budget.
create table if not exists public.ext_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  writes  integer not null default 0,
  primary key (user_id, day)
);

alter table public.ext_usage enable row level security;

-- Readable by its owner so a usage view can exist later; never written from the
-- client — only the SECURITY DEFINER function below touches it.
drop policy if exists "Ext usage selectable by owner" on public.ext_usage;
create policy "Ext usage selectable by owner"
  on public.ext_usage for select using (auth.uid() = user_id);

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
  -- encode() lives in pg_catalog, which stays reachable even with search_path pinned
  -- to ''; digest() comes from pgcrypto in the extensions schema and must be qualified.
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

grant execute on function public.ext_add_lead(text, text, text, text, text, text, text, text)
  to anon, authenticated;
