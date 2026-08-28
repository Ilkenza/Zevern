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
`SVEŽE` or names what is missing, and exits non-zero when the browser is behind. That
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
