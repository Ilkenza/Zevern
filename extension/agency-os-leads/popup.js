/* Agency OS — Lead Collector popup.
 *
 * Flow: load config → detect Instagram profile / Google Maps place → scrape the
 * open item → check if the lead already exists → let the user edit → save via
 * Supabase RPC (ext_add_lead). Pure helpers live in format.js.
 */

const els = {
  notice: document.getElementById("notice"),
  main: document.getElementById("main"),
  exists: document.getElementById("exists"),
  form: document.getElementById("form"),
  channel: document.getElementById("channel"),
  save: document.getElementById("save"),
  msg: document.getElementById("msg"),
};

let cfg = null;
let mode = null; // "instagram" | "maps"

function notice(html) {
  els.notice.innerHTML = html;
  els.notice.classList.remove("hidden");
  els.main.classList.add("hidden");
}
function setMsg(text, cls, ms) {
  els.msg.textContent = text;
  els.msg.className = "msg " + (cls || "");
  if (ms) setTimeout(() => (els.msg.textContent = ""), ms);
}

// ---------- Scrapers (run in the page) ----------

function scrapeIgProfile() {
  const m = location.pathname.match(/^\/([A-Za-z0-9._]+)\/?$/);
  const reserved = ["explore", "reels", "direct", "accounts", "p", "stories", "about"];
  if (!m || reserved.includes(m[1]))
    return { error: "Open someone's Instagram profile page (e.g. instagram.com/name)." };
  const username = m[1];
  let name = "";
  const header = document.querySelector("header");
  if (header) {
    const texts = [...header.querySelectorAll("h1, h2, span")]
      .map((e) => e.textContent.trim())
      .filter((t) => t && t.length < 60 && t.toLowerCase() !== username.toLowerCase());
    name = texts.find((t) => !/^\d|følg|follow|prati|posts|objav/i.test(t)) || "";
  }
  return { source: "instagram", username, name };
}

function scrapeFbProfile() {
  const path = location.pathname;
  const reserved = [
    "watch", "marketplace", "groups", "gaming", "events", "pages", "messages",
    "notifications", "friends", "bookmarks", "help", "settings", "login", "reel",
    "reels", "story.php", "sharer", "photo", "profile.php",
  ];
  let handle = "";
  const idm = location.search.match(/[?&]id=(\d+)/);
  if (path.startsWith("/profile.php") && idm) {
    handle = "profile:" + idm[1];
  } else {
    const m = path.match(/^\/([A-Za-z0-9.\-]+)\/?$/);
    if (m && !reserved.includes(m[1])) handle = m[1];
  }
  const name = (document.querySelector("h1")?.textContent || "").trim();
  if (!name && !handle)
    return { error: "Open a Facebook page or profile (e.g. facebook.com/name)." };
  const url =
    "https://www.facebook.com" +
    (handle.startsWith("profile:") ? "/profile.php?id=" + handle.slice(8) : "/" + handle);
  return { source: "facebook", name, handle, url };
}

function scrapeMapsPlace() {
  const name = (document.querySelector("h1")?.textContent || "").trim();
  if (!name) return { error: "Open a business on Google Maps (click a place to open its panel)." };
  let phone = "";
  const pb = document.querySelector('button[data-item-id^="phone:tel:"]');
  if (pb) {
    const id = pb.getAttribute("data-item-id") || "";
    phone = id.split("tel:")[1] || (pb.getAttribute("aria-label") || "").replace(/^[^:]*:/, "").trim();
  }
  const hasWebsite = !!document.querySelector('a[data-item-id="authority"]');
  return { source: "maps", name, phone, hasWebsite, link: location.href };
}

function scrapeGmail() {
  // Sender of the currently open message; Gmail puts the address in span[email].
  const senders = [...document.querySelectorAll("span[email]")];
  const s = senders[senders.length - 1];
  if (!s) return { error: "Open an email in Gmail to capture the sender." };
  const email = s.getAttribute("email") || "";
  const name = (s.getAttribute("name") || s.textContent || "").trim();
  if (!email) return { error: "Could not read the sender email." };
  return { source: "email", email, name: name && name !== email ? name : "" };
}

function scrapeProton() {
  // Proton marks the sender with data-testid and a title holding the address.
  const el =
    document.querySelector('[data-testid="message-header:from"] [title*="@"]') ||
    document.querySelector('[data-testid="recipient:sender"] [title*="@"]') ||
    document.querySelector('.message-header [title*="@"]');
  if (!el) return { error: "Open an email in Proton to capture the sender." };
  const email = (el.getAttribute("title") || el.textContent || "").trim();
  const nameEl = el.closest("span, div")?.querySelector("bdi, .text-ellipsis");
  const name = (nameEl?.textContent || "").trim();
  if (!/@/.test(email)) return { error: "Could not read the sender email." };
  return { source: "email", email, name: name && name !== email ? name : "" };
}

function scrapeEmails() {
  // Any page: mailto links + a regex sweep. For picking one to save.
  const out = new Set();
  document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
    const e = (a.getAttribute("href") || "").replace(/^mailto:/i, "").split("?")[0].trim();
    if (e) out.add(e);
  });
  const text = document.body ? document.body.innerText : "";
  (text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).forEach((e) =>
    out.add(e.trim()),
  );
  const emails = [...out].filter((e) => !/\.(png|jpg|jpeg|gif|webp)$/i.test(e)).slice(0, 25);
  if (emails.length === 0) return { error: "No email addresses found on this page." };
  return { source: "emails", emails, pageName: document.title || "" };
}

// ---------- Supabase RPC ----------

async function rpc(fn, args) {
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: cfg.anonKey,
      Authorization: "Bearer " + cfg.anonKey,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json();
}

/** Look up the existing lead; if found, mark ✓ and fill the form from it. */
async function syncExisting(contact, name) {
  els.exists.className = "exists";
  els.exists.innerHTML = "Checking…";
  try {
    const found = await rpc("ext_get_lead", {
      p_token: cfg.token,
      p_contact: contact || "",
      p_name: name || "",
    });
    if (found) {
      // Keep the auto channel if the stored one is empty.
      fillForm({ ...found, channel: found.channel || els.form.channel.value });
      els.exists.className = "exists dupe";
      els.exists.innerHTML = '<span class="mark">✓</span> Already in Agency OS';
    } else {
      els.exists.className = "exists new";
      els.exists.innerHTML = '<span class="mark">✗</span> New lead';
    }
  } catch (e) {
    els.exists.className = "exists";
    els.exists.innerHTML = "Can't check (verify the connection in Options).";
    setMsg(String(e.message || e), "err", 8000);
  }
}

function fillForm(lead) {
  els.form.name.value = lead.name || "";
  els.form.company.value = lead.company || "";
  els.form.contact.value = lead.contact || "";
  els.form.channel.value = lead.channel || "";
  els.form.service.value = lead.service || "";
  els.form.status.value = lead.status || "new";
  els.form.notes.value = lead.notes || "";
}

// ---------- Boot ----------

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// --- Draft: keep unsaved edits per page across popup close/reopen ---
let draftKey = null;

function currentForm() {
  return {
    name: els.form.name.value,
    company: els.form.company.value,
    contact: els.form.contact.value,
    channel: els.form.channel.value,
    service: els.form.service.value,
    status: els.form.status.value,
    notes: els.form.notes.value,
  };
}

async function saveDraft() {
  if (!draftKey) return;
  const s = await chrome.storage.local.get(["drafts"]);
  const drafts = s.drafts || {};
  drafts[draftKey] = currentForm();
  chrome.storage.local.set({ drafts });
}

async function applyDraft() {
  if (!draftKey) return;
  const s = await chrome.storage.local.get(["drafts"]);
  const d = (s.drafts || {})[draftKey];
  if (d) fillForm(d);
}

async function clearDraft() {
  if (!draftKey) return;
  const s = await chrome.storage.local.get(["drafts"]);
  const drafts = s.drafts || {};
  delete drafts[draftKey];
  chrome.storage.local.set({ drafts });
}

async function boot() {
  const store = await chrome.storage.sync.get(["agencyos"]);
  cfg = store.agencyos;
  if (!cfg || !cfg.url || !cfg.token) {
    notice(
      'Not connected. Open the extension <b>Options</b> and paste the config from the app (Settings → Browser extension).',
    );
    return;
  }

  const tab = await activeTab();
  const url = tab?.url || "";
  draftKey = url;
  let fn;
  if (/^https:\/\/www\.instagram\.com\//.test(url)) {
    mode = "instagram";
    fn = scrapeIgProfile;
  } else if (/^https:\/\/(www\.|web\.|m\.)?facebook\.com\//.test(url)) {
    mode = "facebook";
    fn = scrapeFbProfile;
  } else if (/^https:\/\/www\.google\.[^/]+\/maps/.test(url)) {
    mode = "maps";
    fn = scrapeMapsPlace;
  } else if (/^https:\/\/mail\.google\.com\//.test(url)) {
    mode = "email";
    fn = scrapeGmail;
  } else if (/^https:\/\/mail\.proton(mail)?\.(me|com)\//.test(url)) {
    mode = "email";
    fn = scrapeProton;
  } else {
    mode = "emails";
    fn = scrapeEmails;
  }

  let data;
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fn });
    data = r?.result;
  } catch (e) {
    notice("Can't read the page: " + (e?.message || e));
    return;
  }
  if (!data || data.error) {
    notice(
      data?.error ||
        "Open an <b>Instagram/Facebook profile</b>, a <b>Google Maps business</b>, or an <b>email</b> (Gmail/Proton).",
    );
    return;
  }

  // A page with several emails → let the user pick which one to save.
  if (data.source === "emails") {
    renderEmailPicker(data.emails, data.pageName);
    return;
  }

  const lead =
    mode === "instagram"
      ? igToLead(data)
      : mode === "facebook"
        ? fbToLead(data)
        : mode === "maps"
          ? mapsToLead(data)
          : emailToLead(data.email, data.name);
  await loadLead(lead);
}

/** Show the form for a lead: fill, dedupe-check, then apply any unsaved draft. */
async function loadLead(lead) {
  els.notice.classList.add("hidden");
  els.main.classList.remove("hidden");
  fillForm(lead);
  await syncExisting(lead.contact, lead.name);
  await applyDraft();
  els.form.addEventListener("input", saveDraft);
}

/** Fallback for ordinary sites: list found emails; clicking one opens the form. */
function renderEmailPicker(emails, pageName) {
  els.main.classList.add("hidden");
  els.notice.classList.remove("hidden");
  els.notice.innerHTML = `<div style="margin-bottom:8px">Emails on this page — pick one to save:</div>`;
  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "6px";
  emails.forEach((email) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn";
    b.textContent = email;
    b.addEventListener("click", () => loadLead(emailToLead(email, pageName)));
    list.appendChild(b);
  });
  els.notice.appendChild(list);
}

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.save.disabled = true;
  setMsg("Saving…");
  try {
    const lead = {
      name: els.form.name.value.trim(),
      company: els.form.company.value.trim(),
      contact: els.form.contact.value.trim(),
      channel: els.form.channel.value.trim(),
      service: els.form.service.value,
      status: els.form.status.value,
      notes: els.form.notes.value.trim(),
    };
    await rpc("ext_add_lead", toRpcArgs(lead, cfg.token));
    setMsg("Saved to Agency OS ✓", "ok", 5000);
    await clearDraft(); // saved → drop the unsaved-draft copy
    syncExisting(lead.contact, lead.name);
  } catch (e2) {
    setMsg("Error: " + (e2?.message || e2), "err", 9000);
  }
  els.save.disabled = false;
});

boot();
