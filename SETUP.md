# Setting Zevern up

Everything the repo cannot carry: the Supabase project, the migrations, and the few
settings that live in a dashboard rather than in a file.

---

## 1. Supabase project

Create a project (any region; `eu-central-1` is what this one runs on). Then, under
**Project settings → API**, copy:

- the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- the **publishable / anon key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The **service-role key is not used anywhere in this app** and must not be put in
`.env.local`. Everything the server does goes through the anon key plus the caller's
session, so RLS applies to it — which is the point.

```bash
cp .env.example .env.local
```

Fill in the two values and you are done with configuration.

---

## 2. Schema

The migrations in `supabase/migrations/` are numbered and forward-only. Apply them in
order, either with the CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

…or by pasting each file into the SQL editor, oldest first. They must be applied in
order — later ones alter what earlier ones created.

`0001` needs the `pgcrypto` extension available in the `extensions` schema (Supabase
enables it by default). `0026` onwards depend on it for token hashing.

### What the migrations set up

- `0001–0011` — profiles, clients, projects, tasks, invoices, SEO checks, leads,
  outreach templates, the service catalog, quotes and the toolbox. Every table gets
  RLS scoped to `auth.uid() = user_id` and a trigger that creates a profile row on
  sign-up.
- `0012–0023` — the additions that came with real use: lead statuses and channels, dual
  currency prices, client tiers, the extension RPCs, module visibility.
- `0024–0025` — the private workspace: accounts, categories, goals, recurring items
  with instalments, budgets and the ledger.
- `0026`, `0028`, `0029` — the security pass. Token hashing, confirmed account
  deletion, unique invoice numbers, length caps on every free-text column, and explicit
  EXECUTE grants (Postgres grants new functions to `PUBLIC` by default, and `PUBLIC` is
  a superset of `anon`).
- `0030–0035` — extension scope, custom colours, goals, planned items, the calendar
  feed function, and the rate limit on SEO checks.
- `0036–0041` — the corrections and settings that came out of using it: the anchor day
  a recurring rule is really tied to, a name on an entry, a default account and a
  default currency, a target currency per goal, and a display currency per rule.
- `0042` — loans, in both directions. A new table with the same owner-scoped RLS as
  everything else.
- `0043` — an entry may be logged before its amount is known, for the receipt still in
  your pocket.
- `0044` — each person can choose up to two accounts for the compact Overview readout.

Each file opens with a comment saying what problem it solves. Read that before changing
anything in it — several of them exist because something was wrong, not because a
feature was wanted.

---

## 3. Auth settings

In the dashboard, under **Authentication**:

- **Sign In / Providers → Email** — on by default. While developing you can turn
  **Confirm email** off so a fresh sign-up logs straight in instead of showing "check
  your email". Turn it back on before anyone else uses it.
- **URL Configuration → Redirect URLs** — add `http://localhost:3000/**` for local work
  and your deployed origin for production. Password reset and email confirmation both
  come back through `/auth/confirm`, and Supabase refuses a redirect that is not listed.

Google OAuth is not wired up. The button exists on the sign-in page and is disabled;
enabling it is a matter of adding credentials under **Providers → Google** and removing
the `disabled` attribute.

---

## 4. Verify

```bash
npm install
npm run typecheck && npm run lint && npm test && npm run build
npm run dev
```

Then, by hand, once:

1. Sign up → a row appears in `profiles` with the full name carried through.
2. Sign out → `/` shows the landing page. Any other route sends you to `/login`.
3. Sign in → `/` shows the overview and the getting-started checklist.

The dashboard's **Advisors → Security** report should be clean apart from the three
`ext_*` functions, which are intentionally callable by `anon` — that is how the browser
extension reaches them, and `0029` re-grants them explicitly so the warning reads as a
decision rather than an oversight.

---

## 5. The browser extension (optional)

1. In the app: **Settings → Browser extension → Generate token**, then **Copy config**.
   The token is shown once and stored only as a hash — losing it means generating a new
   one, which revokes the old.
2. `chrome://extensions` → **Developer mode** → **Load unpacked** → pick
   `extension/zevern-leads`.
3. Right-click the extension icon → **Options** → paste the config → **Save**.

Details and limits are in [`extension/zevern-leads/README.md`](extension/zevern-leads/README.md).

---

## 6. Deploying

Any Node host works. On Vercel: import the repo, set the two `NEXT_PUBLIC_SUPABASE_*`
variables, and deploy — `NEXT_PUBLIC_SITE_URL` is inferred from the deployment.

Set `APP_TIMEZONE` if the app is not being used from Belgrade. The server decides what
"today" means, and getting it wrong shifts overdue counts by a day.

Add the deployed origin to Supabase's redirect URL list, or password reset will bounce.
