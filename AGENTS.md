<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Supabase migrations

Name every new migration `<14-digit-timestamp>_<name>.sql` — run `supabase migration new
<name>` and write into the file it makes. Do **not** carry on the old `NNNN_name.sql`
numbering: the remote history records versions as timestamps, so a `0044_` file has a
version the remote never compares equal to, `supabase db push` reports nothing to do,
and the app ships against a column that does not exist. That is exactly how
`0044_transaction_items` was written, pushed, and silently skipped.

The 43 files still numbered `NNNN_` are already applied and are left alone — all but one
was, and the one is worth remembering. `0035_seo_rate_limit` was never applied, so the
`claim_seo_check` function the SEO action calls first did not exist: every check 404'd on
the RPC and the screen said "Could not save that. Try again." from the day that code
shipped until it was applied by hand on 2026-09-21. The symptom is a generic save error
with nothing wrong in the code; the evidence is `POST | 404 | …/rest/v1/rpc/<name>` in the
edge logs. Check the database has what the code calls before debugging the code.

## When a style change does not show up

Turbopack's CSS cache goes stale often enough in this project to be the first thing to
check, not the last. The symptom is a class that exists in `globals.css` and does
nothing in the browser — the markup renders, the rules never arrive.

Check it rather than guessing:

    npm run css:check

It reads `globals.css`, and for every declaration and selector that survives
minification unchanged, asks whether the newest built stylesheet contains it. It prints
`FRESH` or names what is missing, and exits non-zero when the browser is behind. That
turns "is my change live?" from an argument into a command.

Restarting is the cure, not the routine. Do not tell anyone to run `dev:clean` after
every edit — most of the time the rebuild works, and the ritual hides the times it does
not. Run the check; restart only when it says to. `npm run dev:clean` wipes `.next` and
restarts, and `npm run dev:webpack` is the fallback if it keeps happening: slower, and
it does not have this cache.

Note the shape of the failure: it is the CSS chunk that goes stale. Edits to `.tsx`
files hot-reload reliably, so a session spent in components will never see this, and a
session spent in `globals.css` may see it repeatedly.

Do not blame anything else first. It has been misdiagnosed as "Reduce motion is on",
"the browser cached it" and "the selector must be wrong" — it was the cache every time.

## Money arithmetic does not live in a server action

Every sum that decides an amount belongs in `src/lib/money/*`, as a pure function with
tests. The action reads the database, calls it, and writes the result.

This is not tidiness. Twenty-six server-action files had no tests at all, and the two
things they had no tests for were the two that touch money: how much a booking is
actually worth, and whether a plan is finished. Both were seven lines wedged between a
Supabase read and a Supabase write, so the only way to run them was to have a database
and a signed-in user — which meant nobody ran them.

Worked examples: `posting.ts` (what one instalment books, and what ends the plan),
`stock.ts` (what is left of a lot, and how much a movement takes), `loan-progress.ts`,
`goal-progress.ts`, `paymentsLeft` in `money/index.ts`.

Two habits go with it:

- **A refusal is a name, not a sentence.** `amountToBook` answers `{ refusal: "settled" }`
  and the action turns that into copy. A test that asserts on a sentence fails the next
  time somebody improves the wording, which teaches people to stop trusting tests.
- **Mutate the function and watch the tests fail.** Every one of these was checked by
  breaking it on purpose — drop the trim, widen the tolerance, flip an inequality — and
  confirming a test caught it. A test that passes against a broken function is worse than
  no test, and the only way to know is to try. One mutation survived in `stock.ts` and
  the test was rewritten until it did not.

## Three checks that fail on things nobody can see

They exist because each was a real fault that shipped and stayed for months.

`src/app/dead-css.test.ts` — a class styled in `globals.css` or `motion.css` that no
source file can ever wear. 102 of them had accumulated: the agenda bands the task tabs
replaced, the chip rail, the on-hand panel, eight button studies from an afternoon of
trying shapes. All of it shipped to every visitor and none of it was reachable. **When
you delete a component, this test tells you what CSS went with it** — run the suite and
prune, do not leave the rules behind.

`src/app/grid-tracks.test.ts` — a bare `1fr` in a grid track. `1fr` is
`minmax(auto, 1fr)`: its floor is its content's min-content width, so instead of letting
what is inside shrink or scroll, it grows past the window and takes the page with it.
`AppShell` had `lg:grid-cols-[260px_1fr]` and it put controls off the right edge of every
screen in the app. It is invisible from inside — the *document* does not scroll, so every
check for page overflow reports nothing wrong. Use `minmax(0, 1fr)`.

`src/lib/export/collect.test.ts` — a table a migration creates that the backup does not
copy. The export promises a complete copy of the account; a table missing from the list
makes it a quiet partial one, and the person holding the file cannot tell. **A new table
means four edits**: `export/collect.ts`, `import/restore.ts` (in dependency order), the
edge list in `restore.test.ts`, and the label map in `settings/RestorePanel.tsx`.

## database.types.ts is generated

    npm run types:gen

It was hand-edited for months — a column added by a migration patched in here to make the
compiler agree. When it was finally checked against the real schema it was missing eight
whole tables, `money_budget_amounts` and `money_budget_boosts` among them, and four
foreign keys.

Worth knowing while you are in there: the Supabase clients in `@/lib/supabase` are created
**untyped**, so nothing in this file checks a single query. That is why eight missing
tables cost nothing and went unnoticed — `from("money_budget_amounts")` compiles whether or
not this file has heard of the table. Wiring `Database` into those clients is what would
turn it from a document into a check, and has not been done.

## RLS is not the whole of ownership

Every table has the four owner policies, in the `(select auth.uid())` form. That stops one
person *reading* another's rows; on its own it does not stop a crafted insert from
*pointing* at them — a row carrying the attacker's `user_id` and the victim's parent id
passes every `with check` clause there is.

Where a child row points at a parent, put the ownership in the key:

    alter table public.money_stock add constraint money_stock_id_user_key unique (id, user_id);
    alter table public.money_stock_moves add constraint money_stock_moves_stock_fkey
      foreign key (stock_id, user_id) references public.money_stock (id, user_id) on delete cascade;

Then prove it, with a `do $$ ... raise exception $$` probe that writes the bad row, catches
the violation and aborts — so the check runs against the real database and leaves nothing
behind.

## The app speaks English

Every word a person reads on screen is English: buttons, labels, help lines, error
messages, empty states, the text a server action sends back. All of it, on both sides of
the app — not only the marketing page.

This is worth stating because it is easy to get wrong in exactly one situation, and that
situation keeps coming up: the owner is Serbian, the conversation that produces a feature
is in Serbian, and the strings come out in the language they were discussed in. A whole
receipt scanner shipped that way — twenty-odd strings, every one of them Serbian, in an
app where nothing else is. Write the feature in whatever language it is being discussed
in; write the screen in English.

Serbian in the source is data, never interface, and there are exactly three kinds of it:
what a fiscal receipt prints and `money/receipt.ts` has to match (`ПФР време`, the unit
names on an item line), what a bank statement spells and `import/statement.ts` folds
(`č` → `c`), and `дин` as the dinar's own abbreviation. If a Serbian string is not one of
those, it is a bug.

## How the owner files things, when the app has to guess

Rules about his money, in a file about the code, for one reason: the moment anything
guesses a category — a receipt read off a fiscal QR, a bank line matched to a name, a
field filled from the last entry with the same title — it has to guess the way he files by
hand. Guess differently and the same coffee lands in two categories, and then neither
figure answers anything.

**A café is `Fun`, not `Eating out`.** Coffee at home costs thirty dinars; the 250 in a
café buys an hour sitting with somebody. What was bought is the outing, and the coffee is
the excuse — so beer, kafana, cinema and a concert are the same line. `Eating out` is the
narrower thing: a meal that replaced cooking. Burek in the morning, a pizza because there
was no time, delivery, lunch out — money that was going to be spent on food anyway, only
more of it.

The test is one question: *would the same thing at home have done?* Burek, yes — so
`Eating out`. Coffee with a friend, no — so `Fun`. Where the meal is itself the outing, a
pizza with friends and two hours at the table, it is `Fun`: the outing is what created the
spend, and without it there is no bill.

The point of the split is which figure can be acted on. `Fun` is the line an ordinary
decision moves, so it is the one worth looking at in a thin month. `Eating out` answers a
different question — what not cooking costs — and it stays lumpy, a couple of bills a
month, which is what it should look like.

**A whip-round is one share, not the pot.** Several people put in for a present and he
pays 1.000 of the 5.000: the expense is 1.000, filed under `Gifts`. (`Gifts` is giving to
a person — a present, a wedding envelope, a wreath. `Donations` is giving to a cause.)

If he collects the other 4.000 and hands the lot over, that money passed through him and
was never his — nothing is recorded for it, because 5.000 in the ledger is a month lying
by 4.000. A share somebody has not put in yet is `Lent out` in that person's name, and it
closes when they pay.

**A fine is its own line, not a `Transport` line.** Money paid *because a rule was
broken* — a seatbelt, speeding, a parking ticket, the late charge on an unpaid bill,
penalty interest — is `Fines`, whatever kind of rule it was. The test is one question:
*would this have been paid anyway, doing everything right?* Paid parking, a toll, the
registration, a fee for a document: yes, so those are `Transport` or an ordinary bill. A
ticket: no.

Filed apart from `Transport` because of what each figure has to answer. `Transport` is the
cost of getting about, and it is planned — fuel, tickets, service; a ten-thousand-dinar
ticket inside it reads as driving having got dearer, which is not what happened. `Fines`
answers the one question worth asking about them, which is what a year of mistakes came
to, and that answer does not survive being mixed into anything. It is not `Other` for the
same reason nothing is: `Other` is where a spend goes when it has no meaning, and this one
has a very clear one.

**`Car` is what the car costs standing still; `Transport` is what moving costs.**
Registration, insurance, a service, tyres, a part — `Car`. Fuel, parking, a toll, a bus
ticket, a taxi — `Transport`. The line is whether the money bought a journey or bought the
right to keep making them: a tank of petrol is gone when you arrive, a registration is not.

Split for the same reason as `Fines`. `Transport` is a weekly figure and a registration is
a thirty-thousand-dinar afternoon once a year; together, the month he registers reads as
having driven three times as much, and both numbers stop meaning anything.

**`Taxes` is what the state takes on what he earns.** Porez and doprinosi on a fee, the
paušal once he registers. Not `Fines` — a fine is charged for breaking a rule, a tax is
charged for earning — and not `Bills & utilities`, which is the flat's running costs.

**Rent goes in `Bills & utilities`,** decided by him against the argument for a category of
its own. It is a fixed figure that does not move month to month, so it does not hide the
movement in the rest of that line the way a variable spend would.

**`Refund` is money coming back, and it is income, not a negative expense.** A returned
item, a cancelled service, an overpaid bill repaid. Kept off `Freelance` and `Salary`
because those two answer what he earned, and a refund is not earnings — it is his own money
returning. A fiscal receipt marked as a refund is refused by the scanner and sent here.

## The setup questions, and the two flags behind them

There are two setup runs, one per half of the app, and they are not the same run with a
different colour. `Quickstart` on the work screen asks for the business name and the price
list; `MoneyQuickstart` on the private screen asks where the money is, what comes in and
what goes out. Each question has to **build** something — a question whose answer is only
remembered is a form, and a form is what these replace.

Neither run stores how far through it is. Progress is derived from the data, exactly like
the two checklists beside them: is there a business name, is there a line on the price
list, is there an account. A stored "finished" bit is a second source of truth that drifts
the first time somebody fills the same field from Settings, and then the card either nags
about work already done or retires having done none.

**Dismissal is two columns, not one.** `profiles.onboarding_hidden` covers the work screen
— the getting-started checklist and the freelance questions. `profiles.money_onboarding_hidden`
covers the private one. They were briefly the same column, which meant pressing "Not now"
on the money card silently retired two cards on a screen nobody was looking at. If a third
card ever wants a "Not now", it gets its own column or it shares with the run on its own
screen; it does not reach across.

**Only a question the app cannot work without holds its card open.** The money card is held
open by accounts alone. Income and outgoings are offered and never insisted on, because
both have an honest answer that builds nothing — money that arrives whenever an invoice is
paid is not a monthly rule — and a card waiting on those would nag forever for work that
does not exist.

**A typed day of the month is the anchor; the date it first lands on is not.** `monthlyDayFrom`
reads the number, `nextMonthlyOn` works out the first date, and the number goes into
`anchor_day` unchanged. Do not pass that first date through `anchorDayFor` instead: it
promotes the last day of a short month to 31, which is right for a date somebody picked off
a calendar and wrong for a number they typed — a rule written 30 would fire on the 31st
from the second month on. `anchorDayFor` is the fallback for the one case where nothing was
typed. `src/lib/money/monthly-day.test.ts` holds that pair apart.

## A transfer's fee is a second row, never a column

A `transfer` is symmetric by construction: whatever leaves `account_id` arrives at
`to_account_id`. A cash machine that is not your bank's breaks that — ask for 5.000 and
the statement says 5.250 — so the charge is written as its own `expense` on the source
account, carrying `fee_for_id` pointing back at the transfer.

Do not add a `fee` column to the transfer instead. The month summary, the budgets, the
category breakdown and the forecast all already count expenses; a column would have to
be taught to four of them, and four places is four chances for the charge to go missing.
As an expense it is counted everywhere for free, and it can be budgeted and shows in the
breakdown, which a column could never do.

`saveTransaction` owns the pair. It writes, updates or removes the fee row after the
transfer is written — after, because a new transfer has no id until then — and passes
zero when the kind is no longer a transfer, so a charge left behind by a changed entry is
deleted rather than orphaned. Unlike the shopping-list write below it, a failure here is
returned as an error and not logged: this one is money, and silently dropping it leaves
the account short with nothing on screen to say why. The FK cascades, so deleting a
transfer takes its fee with it.

**Do not embed the fee in `TX_SELECT`.** It is this table embedded in itself, and
PostgREST refuses it: `fee:money_transactions!money_transactions_fee_for_id_fkey(...)`
against the live API returns HTTP 400, PGRST200, "Could not find a relationship". That
select is shared by every money list, so one embed takes all of them down at once — it
was written once, and caught only because it never reached production. `withFees` in
`src/lib/data/money/transactions.ts` attaches the fee afterwards with a plain
`.in("fee_for_id", ...)` read, and every loader that can feed the edit form goes through
it (`getTransactions`, `getTransaction`). Its failure throws, on purpose: the form opens
its fee box from that read, and a box that opened empty because the read failed would
delete a real charge on an untouched save. Read the value through `feeOf`.

The category is `BANK_FEES` from `@/lib/money`, resolved by name and created if the
account has not got one. Never refuse a save because the category is missing — an account
older than this feature has no `Bank fees` in its seed, and the honest outcome is the
charge filed correctly, not a transfer that will not save.

## A phone is 390px wide, and nothing here scrolls sideways

`html, body { overflow-x: clip }` is the page guard. It means a child that is too wide is
not scrollable on a phone — it is cut off, silently. So "it fits" has to be checked at
390px, not assumed. What went wrong the first time, and the rule each one left:

- **A grid that only sets columns at a breakpoint** (`grid lg:grid-cols-[…]`) has one
  `auto` track below it, and an auto track is as wide as its widest child. The Overview's
  Projects table made both columns 547px. Give it `grid-cols-1` (`minmax(0, 1fr)`) as
  the base whenever it can hold a table or anything else that does not wrap.
- **A list that is a table** keeps two or three columns on a phone. Secondary columns get
  `hidden sm:table-cell` on both `th` and `td`; their facts move into the first cell as a
  `sm:hidden` line under the title, and the status badge goes under the figure. The first
  cell is `max-sm:w-full max-sm:max-w-0` — a table sizes a column by its longest line
  that cannot wrap, and a `truncate` line counts at full length, so without it the one
  line pushes the amount back off the screen. `whitespace-nowrap` on figures and numbers.
- **Loose text around a button in a flex row** is three flex items, and each wraps in its
  own column (`Nothing in / yet.`). One sentence, one `<span>`.
- **`truncate` does nothing on an inline element.** A link is inline; it needs `block`
  (or `inline-block`) before `overflow` and `text-overflow` apply.
- **A toggle inside a truncated line** is the first thing the ellipsis eats. Keep the
  truncating text in its own `min-w-0 truncate` span and the control after it.
- **Wrapping meta lines** (`date · in 9 days · category`) use `WithDot` from
  `private/upcoming/ui.tsx`: the dot travels with the fact after it, and the line's box
  hides whichever dot lands at the start of a line.
- **A grid of form controls** places every control by name below its breakpoint. Letting
  seven controls fall into two tracks in order is how `Plazma mix zel` and `N` happened.
