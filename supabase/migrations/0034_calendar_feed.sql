-- Zevern — read access for the private calendar feed.
--
-- The .ics endpoint is fetched by Google Calendar, not by a browser with a session,
-- so it arrives as `anon` holding only the token. RLS would show it nothing, which is
-- correct — so one narrow, read-only function opens exactly the two lists the feed
-- needs and nothing else. It returns rules and planned items rather than dates,
-- because the walk that turns a rule into occurrences already exists in the app and
-- having it in two languages is how the calendar and the screen start disagreeing.

create or replace function public.calendar_feed(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  out_rules jsonb;
  out_planned jsonb;
begin
  -- A short token is a guessing attempt, not a mistake. Refuse before touching a table.
  if coalesce(p_token, '') = '' or char_length(p_token) < 24 then
    raise exception 'unauthorized';
  end if;

  select id into uid from public.profiles where calendar_token = p_token;

  if uid is null then
    raise exception 'unauthorized';
  end if;

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into out_rules
  from (
    select r.id, r.name, r.kind, r.amount, r.currency, r.variable, r.every,
           r.next_on, r.active, r.ends_on, r.installments_total, r.installments_done,
           r.goal_id, r.created_at,
           c.name as category_name
    from public.money_recurring r
    left join public.money_categories c on c.id = r.category_id
    where r.user_id = uid
  ) r;

  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into out_planned
  from (
    select p.id, p.name, p.kind, p.amount, p.currency, p.due_on, p.note, p.settled_at
    from public.money_planned p
    where p.user_id = uid
      and p.settled_at is null
  ) p;

  return jsonb_build_object('rules', out_rules, 'planned', out_planned);
end;
$$;

revoke execute on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
