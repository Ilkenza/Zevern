# Zevern — Lead Collector (Chrome extension)

Open **one** Instagram profile, Facebook page, or Google Maps business → the extension reads the page,
**checks whether the lead already exists** in Zevern (✓ / ✗), lets you fill in a few fields, and
**saves it straight to your database**. No CSV, no manual typing.

## One-time setup

1. In the app: **Settings → Browser extension** → **Generate token** → **Copy config for the extension**.
2. `chrome://extensions` → **Developer mode** → **Load unpacked** → pick this folder (`extension/zevern-leads`).
3. Right-click the extension icon → **Options** → paste the config → **Save connection** (shows “Connected ✓”).

The config is a JSON `{ url, anonKey, token }`. `url`/`anonKey` are public (Supabase); `token` is your
secret that links the extension to your account.

## Usage

- **Instagram**: open someone's profile (`instagram.com/name`) → click the icon. The popup shows ✓/✗ and a
  form (name, contact `@username`, channel `instagram`, plus service/status/notes/company) → **Save**.
- **Facebook**: open a page/profile (`facebook.com/name`) → click the icon. Takes the name and handle;
  channel = `facebook`.
- **Google Maps**: click a business to open its panel → click the icon. Takes the name, phone (if shown),
  whether it has a website, and the link (added to notes); channel = `google_maps`.
- **Email (Gmail / Proton)**: open a reply in Gmail or Proton → click the icon → it captures the
  **sender** (name + email) as a lead; channel = `email`. On any other site, it lists the emails found
  on the page so you can pick one to save.

The lead appears immediately in the app under **Leads**.

## Limits / security

- **The token is a secret** — anyone with it can add leads to your account. Keep it safe; **Regenerate
  token** in Settings revokes the old one instantly.
- **Selectors can break**: Instagram/Facebook/Google change their HTML. If the popup finds nothing,
  update `scrapeIgProfile` / `scrapeFbProfile` / `scrapeMapsPlace` in `popup.js`.
- **Phone** on Maps is only read if it's shown in the panel.
- The extension only **reads** the open page and **writes to your Zevern** — it never posts anything
  to Instagram/Facebook/Google.

## Test

```
node test.mjs
```

## Files

- `manifest.json` — MV3 manifest (+ options_page)
- `popup.html` / `popup.css` — UI (form + duplicate check)
- `popup.js` — site detection, scraper injection, check and save (Supabase RPC)
- `format.js` — pure functions (scrape → lead payload); shared with the test
- `options.html` / `options.js` — enter/store the config
- `test.mjs` — node sanity test
