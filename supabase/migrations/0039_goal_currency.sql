-- A goal can be aimed at euros or dollars, not only dinars.
--
-- What you are saving for is often priced in a currency you do not hold: a laptop at
-- €1.200, a course at $99. Forcing the target into dinars meant converting it yourself
-- and then watching the figure quietly stop being true as the rate moved.
--
-- Same shape the ledger already uses for money in another currency: the amount as you
-- said it, the currency you said it in, the rate it was read at, and the dinar figure
-- every other screen does its arithmetic on. `target_rsd` keeps its meaning, so no
-- existing progress, forecast or reconciliation had to learn anything new.
alter table public.money_goals
  add column if not exists currency text not null default 'RSD'
    check (currency in ('RSD', 'EUR', 'USD')),
  add column if not exists rate numeric(12, 4) not null default 1 check (rate > 0),
  add column if not exists target_amount numeric(14, 2);

-- Every goal that exists was typed in dinars at a rate of one, so the amount it was
-- aimed at is the dinar figure it already carries.
update public.money_goals
set target_amount = target_rsd
where target_amount is null;
