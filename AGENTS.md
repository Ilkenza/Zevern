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

The 43 files still numbered `NNNN_` are already applied and are left alone.

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
