/* Pure helpers — no DOM, no chrome APIs. Shared by popup.js and test.mjs. */

// Scraped Instagram profile → default lead field values (user can edit in the form).
function igToLead(p) {
  const username = (p.username || "").replace(/^@/, "");
  return {
    name: p.name || username,
    company: "",
    contact: username ? "@" + username : "",
    channel: "instagram",
    service: "",
    status: "new",
    notes: "",
  };
}

// Scraped Facebook page/profile → default lead field values.
function fbToLead(p) {
  const handle = (p.handle || "").replace(/^@/, "");
  const cleanHandle = handle && !handle.startsWith("profile:") ? handle : "";
  return {
    name: p.name || cleanHandle || "",
    company: "",
    contact: cleanHandle ? "@" + cleanHandle : p.url || "",
    channel: "facebook",
    service: "",
    status: "new",
    notes: "",
  };
}

// An email (from Gmail/Proton sender or a page) → default lead field values.
function emailToLead(email, name) {
  const e = (email || "").trim();
  return {
    name: (name || "").trim() || e,
    company: "",
    contact: e,
    channel: "email",
    service: "",
    status: "new",
    notes: "",
  };
}

// Scraped Google Maps place → default lead field values.
function mapsToLead(p) {
  return {
    name: p.name || "",
    company: "",
    contact: p.phone || "",
    channel: "google_maps",
    service: p.hasWebsite ? "" : "new_site",
    status: "new",
    notes: [p.link || "", p.hasWebsite ? "" : "nema sajt"].filter(Boolean).join(" · "),
  };
}

// Lead form values → argument object for the ext_add_lead RPC.
function toRpcArgs(lead, token) {
  return {
    p_token: token || "",
    p_name: lead.name || "",
    p_company: lead.company || "",
    p_contact: lead.contact || "",
    p_channel: lead.channel || "",
    p_service: lead.service || "",
    p_status: lead.status || "new",
    p_notes: lead.notes || "",
  };
}

if (typeof module !== "undefined") {
  module.exports = { igToLead, fbToLead, mapsToLead, emailToLead, toRpcArgs };
}
