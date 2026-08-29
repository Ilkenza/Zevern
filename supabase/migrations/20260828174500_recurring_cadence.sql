-- Zevern — a recurring rule gets a number, and an explicit answer to "until when".
--
-- Two gaps, both of which showed up the moment anyone tried to write down a real
-- standing charge.
--
-- The first is that `every` was a unit and nothing else, so the cadence could only be
-- weekly, monthly or yearly. Every six months is how insurance is billed, every three
-- how tax is paid, every two weeks how half the world is paid, and none of the three
-- could be written down at all. A count next to the unit covers all of them, and every
-- other cadence anybody will ever want, without a new value in a check constraint each
-- time.
--
-- The second is that a rule's end was implied rather than stated. `ends_on` set meant
-- "until that date", `installments_total` set meant "for that many", neither set meant
-- "forever" — three conditions inferred from which column happened to be filled in,
-- which is how a rule with both ends up meaning whatever the reading code checks first.
-- `ends_when` says it once, and the constraints below make the columns agree with it.
--
-- 'goal' is the new one and the only one that is not a counter or a date: a standing
-- order into a savings goal stops when the goal is full. Written any other way it is a
-- date you have to work out yourself and correct every time you put extra in — and if
-- you get it wrong the rule quietly overfills a goal that is already met.

alter table public.money_recurring
  add column if not exists every_count integer not null default 1;

alter table public.money_recurring
  drop constraint if exists money_recurring_every_count_range;
alter table public.money_recurring
  add constraint money_recurring_every_count_range
  check (every_count between 1 and 60);

-- Daily was missing, and a daily rule is a real thing — a commute, a coffee, per-diem.
alter table public.money_recurring drop constraint if exists money_recurring_every_check;
alter table public.money_recurring add constraint money_recurring_every_check
  check (every in ('day', 'week', 'month', 'year'));

alter table public.money_recurring
  add column if not exists ends_when text not null default 'never';

-- Say out loud what the old rows meant, before the constraint starts insisting on it.
-- A date beats a count where a row somehow carries both: a date is a promise about the
-- calendar, a count is a promise about the rule, and the calendar wins.
update public.money_recurring
set ends_when = case
  when ends_on is not null then 'date'
  when installments_total is not null then 'installments'
  else 'never'
end
where ends_when = 'never';

alter table public.money_recurring drop constraint if exists money_recurring_ends_when_check;
alter table public.money_recurring add constraint money_recurring_ends_when_check
  check (ends_when in ('never', 'date', 'installments', 'goal'));

-- Each condition needs the column that carries it. Without these, "until the goal is
-- full" could sit on a rule that feeds no goal, and the walk that projects the forecast
-- would have nothing to stop on.
alter table public.money_recurring drop constraint if exists money_recurring_end_has_its_field;
alter table public.money_recurring add constraint money_recurring_end_has_its_field
  check (
    (ends_when <> 'date' or ends_on is not null)
    and (ends_when <> 'installments' or installments_total is not null)
    and (ends_when <> 'goal' or goal_id is not null)
  );

comment on column public.money_recurring.every_count is
  'How many of `every` to a step. 2 with ''week'' is a fortnight; 3 with ''month'' is quarterly.';
comment on column public.money_recurring.ends_when is
  'never | date (ends_on) | installments (installments_total) | goal (stops when goal_id is full).';

-- The calendar feed has to walk the same dates the app does.
--
-- It reads rules through this function and projects them itself, so a cadence the
-- function does not hand over is a cadence the feed cannot honour: without
-- `every_count` a quarterly insurance bill would appear in a subscribed calendar every
-- month, forever, and the calendar would be quietly wrong in a way nobody checks.
--
-- `goal_remaining_rsd` is the same problem for the new end condition. A standing order
-- that stops when its goal is full stops on a date only the ledger knows, so the figure
-- is worked out here and the feed stops its walk on it.
create or replace function public.calendar_feed(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid;
  out_rules jsonb;
  out_planned jsonb;
begin
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
           r.every_count, r.ends_when,
           r.next_on, r.active, r.ends_on, r.installments_total, r.installments_done,
           r.goal_id, r.created_at, r.anchor_day,
           c.name as category_name,
           gr.remaining as goal_remaining_rsd
    from public.money_recurring r
    left join public.money_categories c on c.id = r.category_id
    left join lateral (
      select g.target_rsd - coalesce((
        select sum(case when t.kind = 'saving' then t.amount_rsd else -t.amount_rsd end)
        from public.money_transactions t
        where t.goal_id = g.id and t.kind in ('saving', 'withdraw')
      ), 0) as remaining
      from public.money_goals g
      where g.id = r.goal_id
    ) gr on true
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
$function$;
