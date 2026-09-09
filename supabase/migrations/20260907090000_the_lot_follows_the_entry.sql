-- The lot goes when the entry that bought it goes.
--
-- `money_stock.transaction_id` was `on delete set null`, and the reason written beside it
-- was that forgetting an entry must not delete the food: it is still in the fridge
-- whatever the ledger says. That reads well and is wrong in practice. An entry is deleted
-- because it should not have been written — a duplicate, a mistake, a purchase that never
-- happened — and the house went on claiming twenty coffees with no entry left anywhere to
-- say where they had come from. "Ako ja izbacim tu transakciju, u In the house piše da
-- imam još."
--
-- Only lots that came from that entry. A lot put in by hand carries no `transaction_id`
-- at all and is never touched by this, and each lot's movements follow their lot the way
-- they already did.
alter table public.money_stock
  drop constraint if exists money_stock_transaction_id_fkey;

alter table public.money_stock
  add constraint money_stock_transaction_id_fkey
    foreign key (transaction_id) references public.money_transactions (id) on delete cascade;

comment on column public.money_stock.transaction_id is
  'Which entry bought it. Null for a lot put in the house by hand. Deleting the entry deletes the lot.';
