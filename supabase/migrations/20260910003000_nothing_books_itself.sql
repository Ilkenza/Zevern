-- Nothing records itself unless it was asked to.
--
-- A fixed rule entered before its date used to post its entry the first time the app was
-- opened after the date passed. The reasoning was sound — the rent leaves the account
-- whether or not anybody opens an app, so a ledger that waits for a tap is a ledger that
-- is wrong for as long as the tap is late — and it is still the behaviour worth offering.
-- It was the wrong thing to *assume*, and for a plain reason: the app cannot see the
-- money move. It only knows what a rule predicted, so what it writes on its own is a
-- guess wearing the clothes of a fact, and the person who has to notice the guess was
-- wrong is the one who was never asked.
--
-- So the behaviour becomes a switch, and the switch starts off — on the rules that exist
-- now as well, which is the point rather than an oversight: every one of them was created
-- under a rule nobody chose. The overview asks; a tap answers; anyone who wants the old
-- behaviour back turns it on per rule, which is also the only place where the answer can
-- be honest, because "does this leave the account on its own" is a fact about the direct
-- debit, not about the person.
alter table public.money_recurring
  add column if not exists books_itself boolean not null default false;

comment on column public.money_recurring.books_itself is
  'Records its entry by itself once the date has passed. Off by default: the rule waits to be confirmed.';
