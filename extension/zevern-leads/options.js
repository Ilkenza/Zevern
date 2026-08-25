/* Store the Zevern connection ({url, anonKey, token}) in chrome.storage.sync. */

const cfgEl = document.getElementById("cfg");
const statusEl = document.getElementById("status");

function show(text, cls) {
  statusEl.textContent = text;
  statusEl.className = "status " + (cls || "");
}

chrome.storage.sync.get(["agencyos"], (res) => {
  if (res.agencyos) {
    cfgEl.value = JSON.stringify(res.agencyos, null, 2);
    show("Connected ✓", "ok");
  }
});

document.getElementById("save").addEventListener("click", () => {
  let cfg;
  try {
    cfg = JSON.parse(cfgEl.value);
  } catch {
    return show("Invalid JSON — copy the config from the app.", "err");
  }
  if (!cfg || !cfg.url || !cfg.anonKey || !cfg.token) {
    return show("Config must include url, anonKey and token.", "err");
  }
  cfg.url = String(cfg.url).replace(/\/+$/, "");
  chrome.storage.sync.set({ agencyos: cfg }, () => show("Saved and connected ✓", "ok"));
});
