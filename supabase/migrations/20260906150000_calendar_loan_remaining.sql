-- The calendar feed learns what is still owed.
--
-- The feed reads rules through this function and walks the dates itself, so a figure the
-- function does not hand over is one the feed cannot honour. It already gets
-- `goal_remaining_rsd`, because a standing order that stops when its goal is full stops
-- on a date only the ledger knows. An instalment plan is the same problem: it stops when
-- the debt is clear, and paying more than the rate one month brings that forward.
--
-- Without this a subscribed calendar goes on printing instalments for a credit that was
-- paid off — and a calendar nobody can trust is worse than no calendar.
--
-- The arithmetic mirrors `weighLoanMove` in `src/lib/money/loan-progress.ts`, which is
-- where it is written in prose and pinned by tests. Kept in step by hand, because this
-- function is the one reader that cannot call it: the entry that opened the debt counts
-- for nothing, a repayment adds, a refund takes back, and anything else is not a
-- movement against a debt at all.
--
-- Everything outside the rules block is the function exactly as it stood — taken from
-- the live definition rather than rebuilt from an older migration, so the planned half
-- cannot quietly lose a column on the way past.

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
           r.goal_id, r.loan_id, r.created_at, r.anchor_day,
           c.name as category_name,
           gr.remaining as goal_remaining_rsd,
           lr.remaining as loan_remaining_rsd
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
    left join lateral (
      select greatest(
        l.total_rsd - greatest(coalesce((
          select sum(
            case
              -- The movement that opened the debt: real money, and no part of repaying it.
              when t.kind = (case when l.direction = 'lent' then 'loan_out' else 'loan_in' end)
                then 0
              -- Nothing else can pay a debt down; a stray kind must not move this figure.
              when t.kind not in ('loan_in', 'loan_out', 'expense', 'income') then 0
              -- Money coming back on a debt owed to you pays it down, and money going out
              -- on one you owe does. The other direction is a refund and takes it back up.
              when (t.kind in ('loan_in', 'income')) = (l.direction = 'lent') then t.amount_rsd
              else -t.amount_rsd
            end
          )
          from public.money_transactions t
          where t.loan_id = l.id
        ), 0), 0),
        0
      ) as remaining
      from public.money_loans l
      -- A settled debt caps at nothing, so the feed stops rather than projecting a plan
      -- against something already closed by hand.
      where l.id = r.loan_id and l.settled_on is null
    ) lr on true
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
