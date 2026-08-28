# Zevern

A workspace for one person. Everything between finding a client and getting paid —
leads, quotes, projects, invoices, clients, tasks, an SEO check and a toolbox — plus a
separate private side for your own money, kept away from the business.

It is built for a freelance web designer or developer working alone. There is no team,
no seats and no sharing: every row belongs to exactly one account, and the database
enforces that rather than the application.

---

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, server actions, React 19) |
| Database & auth | Supabase (Postgres + RLS) |
| Styling | Tailwind CSS 4, tokens in `src/app/globals.css` |
| Tests | Vitest, over the pure logic |
| Deploy | Any Node host; Vercel is what the config assumes |

No ORM, no state library, no form library. Reads go through `src/lib/data/*`, writes go
through server actions in `src/app/**/actions.ts`, and components draw what they are
given. That is the whole architecture.

---

## Running it

```bash
npm install
cp .env.example .env.local   # then fill in the two Supabase values
npm run dev
```

Open <http://localhost:3000>. Signed out, `/` is the landing page; signed in, it is the
overview. Everything else redirects to `/login`.

Setting up the Supabase project from scratch — schema, migrations, the settings that
are not in this repo — is in [SETUP.md](SETUP.md).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |

---

## What is in it

**Business side**

- **Leads** — a pipeline with statuses, follow-up dates, CSV import with a diff shown
  before anything is written, mail-merge outreach templates, and a Chrome extension
  that reads a profile page and saves the lead without any typing.
- **Quotes** — a catalog of service items with multi-currency prices, a builder, and a
  printable page.
- **Clients & projects** — a client carries a tier and a contact channel; converting a
  lead creates both the client and its first project.
- **Tasks** — a board, with a workspace split so business and private tasks never mix.
- **Invoices** — numbered per account (uniquely, and permanently), with a printable
  page and a status that ages into "overdue" on its own.
- **SEO check** — paste a URL, the server fetches it and reads the markup that search
  engines and AI answers rely on.
- **Toolbox** — the links and licences you keep losing.

**Private side** — a second workspace, hidden from the business one:

- Accounts, categories, a ledger, and monthly budgets that know what a normal month
  actually costs you.
- Recurring items — instalments, end dates, and an anchor day, so rent due on the 28th
  stays on the 28th instead of drifting to the month end every February.
- Savings goals that hold real money out of the spendable balance, and that can be
  aimed at a figure in euros or dollars rather than a dinar amount you converted once
  and then watched go stale.
- **Loans**, in both directions. Lending someone 10.000 is not spending — the money is
  still yours, in their pocket. Taking a credit is not earning. Both used to be forced
  into an expense or an income; they now have a shape of their own.
- A 90-day forecast, and an `.ics` feed you can subscribe to from Google Calendar.

**Money in more than one currency** — a base currency on the profile that every form
starts on, a target currency per goal, and a display currency per recurring rule, so a
subscription billed in dollars reads as "$27 a month" while every total stays in dinars.
Each entry stores the rate it was booked at, so history never moves.

**An export of everything** — Settings hands back every table the account owns as one
file. It is listed table by table rather than discovered, so adding a table to the
schema and forgetting it here shows up as a missing key somebody can inspect, not as
silence.

Any module you do not use can be switched off in Settings and disappears from the
sidebar.

---

## How it is kept safe

This is the part of the codebase with the most thought in it, so it is worth stating
plainly.

- **Row-level security on every table**, scoped to the owner — and every query from the
  app *also* filters on `user_id`. Two independent locks, so one missing policy is not
  a breach.
- **Foreign keys are checked for ownership** (`ownsRow` in
  `src/lib/supabase/current-user.ts`). RLS only validates the row being written, never
  the parent it points at; without this check a crafted request attaches your invoice
  to somebody else's client.
- **The SEO fetcher is guarded against SSRF**: DNS is resolved before the request,
  private and link-local ranges are refused, redirects are followed manually and
  re-checked at every hop, and the body is capped and time-boxed. It is also rate
  limited per account, in the database.
- **The extension token is stored as a SHA-256 hash.** The plaintext is shown once, at
  generation, and is unrecoverable after. Writes through it are capped per day.
- **Deleting the account requires retyping the email**, checked server-side in
  `delete_user`, not by a checkbox the browser can skip.
- **Changing the password requires the current one**, so a borrowed session does not
  become permanent ownership.
- **The calendar feed** is the only address that answers without a session. Every
  failure is the same bare 404, so guessing a token gets no feedback.
- **Security headers** — CSP, HSTS, `frame-ancestors 'none'`, `Referrer-Policy` — are
  in `next.config.ts`, with the reasoning for each written next to it.

---

## Layout

```
src/
  app/
    (app)/        the signed-in workspace; "/" is also the landing page
    (auth)/       sign in, forgot, reset
    (print)/      printable invoice and quote
    api/calendar/ the .ics feed — the only unauthenticated route
    api/export/   the account's data, behind the session
  components/     views and forms, grouped by module; ui/ holds the primitives
  lib/
    data/         every read
    supabase/     clients, the auth helper, error wording
    money/        the private side's pure logic — dates, currency, occurrences
    export/       the account's whole data set, table by table
    seo/          fetch guard + analysis
extension/zevern-leads/   Chrome extension (MV3)
supabase/migrations/      numbered, forward-only, each explains why
```

---

## Conventions

- **Comments say why, not what.** If a line is doing something unobvious, the comment
  explains the problem it solves and what breaks without it. That is the house style
  and it is worth keeping.
- **Migrations are forward-only and numbered.** They are never edited after being
  applied; a mistake gets a new one.
- **Dates are wall clocks.** Almost nothing carries a timezone, so it reads back the
  same wherever it is opened. "Today" is the exception and is decided on the server,
  which is why `next.config.ts` pins `TZ` — see the comment there.
- **Money keeps the rate it was entered at.** `amount_rsd` is generated from the amount
  and that rate, so history never shifts when the rate is updated.
