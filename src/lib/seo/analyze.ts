import { lookup } from "node:dns/promises";
import * as cheerio from "cheerio";
import type { CheckResult, CheckStatus } from "@/lib/types";

export type AnalyzeResult = { title: string | null; score: number; results: CheckResult[] };

export function analyzeHtml(html: string): AnalyzeResult {
  const $ = cheerio.load(html);
  const results: CheckResult[] = [];
  const push = (
    key: string,
    label: string,
    status: CheckStatus,
    detail: string,
    found?: string,
  ) => results.push({ key, label, status, detail, found });

  // --- SEO ---
  const title = $("title").first().text().trim();
  const titleLen = title.length;
  if (!title) push("title", "Title tag", "fail", "No <title> found.");
  else if (titleLen >= 30 && titleLen <= 60)
    push("title", "Title tag", "pass", `${titleLen} chars — good length.`, title);
  else push("title", "Title tag", "warn", `${titleLen} chars — aim for 30–60.`, title);

  const desc = ($('meta[name="description"]').attr("content") ?? "").trim();
  const descLen = desc.length;
  if (!desc) push("description", "Meta description", "fail", "Missing meta description.");
  else if (descLen >= 70 && descLen <= 160)
    push("description", "Meta description", "pass", `${descLen} chars — good length.`, desc);
  else push("description", "Meta description", "warn", `${descLen} chars — aim for 70–160.`, desc);

  const h1s = $("h1").length;
  if (h1s === 1) push("h1", "Single H1", "pass", "Exactly one H1.");
  else if (h1s === 0) push("h1", "Single H1", "fail", "No H1 heading found.");
  else push("h1", "Single H1", "warn", `${h1s} H1 tags — use one.`);

  const h2s = $("h2").length;
  if (h2s >= 1)
    push("headings", "Heading structure", "pass", `${h2s} H2 section(s) — good structure.`);
  else
    push(
      "headings",
      "Heading structure",
      "warn",
      "No H2s — add sections for readability & AI extraction.",
    );

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const words = bodyText ? bodyText.split(" ").length : 0;
  if (words >= 300) push("words", "Content length", "pass", `${words} words.`);
  else if (words >= 100) push("words", "Content length", "warn", `${words} words — thin content.`);
  else push("words", "Content length", "fail", `${words} words — very thin.`);

  const canonical = $('link[rel="canonical"]').attr("href");
  push(
    "canonical",
    "Canonical URL",
    canonical ? "pass" : "warn",
    canonical ? "Canonical set." : "No canonical link.",
    canonical || undefined,
  );

  const viewport = $('meta[name="viewport"]').attr("content");
  push(
    "viewport",
    "Mobile viewport",
    viewport ? "pass" : "fail",
    viewport ? "Viewport meta set." : "No viewport meta — not mobile-friendly.",
    viewport || undefined,
  );

  const lang = $("html").attr("lang");
  push(
    "lang",
    "HTML lang",
    lang ? "pass" : "warn",
    lang ? `lang="${lang}".` : "No <html lang> attribute.",
    lang ? `lang="${lang}"` : undefined,
  );

  const imgs = $("img");
  if (imgs.length === 0) push("alt", "Image alt text", "pass", "No images on the page.");
  else {
    let withAlt = 0;
    imgs.each((_, el) => {
      const a = $(el).attr("alt");
      if (a !== undefined && a.trim() !== "") withAlt++;
    });
    const pctAlt = Math.round((withAlt / imgs.length) * 100);
    if (pctAlt >= 80)
      push("alt", "Image alt text", "pass", `${pctAlt}% of ${imgs.length} images have alt.`);
    else if (pctAlt > 0)
      push("alt", "Image alt text", "warn", `${pctAlt}% of ${imgs.length} images have alt.`);
    else push("alt", "Image alt text", "fail", "No images have alt text.");
  }

  // --- GEO / generative-readiness ---
  const ld = $('script[type="application/ld+json"]').length;
  push(
    "jsonld",
    "Structured data (JSON-LD)",
    ld ? "pass" : "warn",
    ld
      ? `${ld} JSON-LD block(s) — helps AI engines understand the page.`
      : "No JSON-LD — add schema.org for AI/GEO visibility.",
  );

  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDesc = $('meta[property="og:description"]').attr("content");
  const ogFound = [ogTitle && `og:title="${ogTitle}"`, ogDesc && `og:description="${ogDesc}"`]
    .filter(Boolean)
    .join(" · ");
  if (ogTitle && ogDesc)
    push("og", "Open Graph", "pass", "og:title and og:description set.", ogFound);
  else if (ogTitle || ogDesc) push("og", "Open Graph", "warn", "Partial Open Graph tags.", ogFound);
  else push("og", "Open Graph", "warn", "No Open Graph tags — worse link/AI previews.");

  const weight = (s: CheckStatus) => (s === "pass" ? 1 : s === "warn" ? 0.5 : 0);
  const score = results.length
    ? Math.round((results.reduce((a, r) => a + weight(r.status), 0) / results.length) * 100)
    : 0;

  return { title: title || null, score, results };
}

export type FetchResult =
  | { ok: true; url: string; data: AnalyzeResult }
  | { ok: false; error: string };

/* ------------------------------------------------------------------ *
 * SSRF guard
 *
 * The URL here comes from a signed-in user, and the fetch runs inside the
 * app's own network. Without a guard that is a request-forgery primitive:
 * the caller picks the address, the server makes the call, and the reply
 * (status code, body, timing) comes back to them. So everything below is
 * about making sure the socket only ever opens to a public host.
 * ------------------------------------------------------------------ */

/** The only failure text the caller ever sees — real reasons go to the server log. */
const BLOCKED_MESSAGE = "That URL could not be checked.";

/** Whole-operation budget, redirects included. */
const FETCH_BUDGET_MS = 8_000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 2 * 1024 * 1024;

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

/** Names that resolve inside the machine or the datacentre, whatever DNS says. */
const BLOCKED_NAMES = new Set(["localhost", "internal", "local", "arpa"]);
const BLOCKED_SUFFIXES = [".localhost", ".internal", ".local", ".arpa"];

/**
 * `new URL()` accepts every legacy IPv4 spelling — 2130706433, 0177.0.0.1,
 * 0x7f.0.0.1, 127.1 — so a dotted-quad string comparison proves nothing.
 * Everything is reduced to four bytes before any range is checked.
 */
function ipv4ToBytes(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) return null;

  const nums: number[] = [];
  for (const part of parts) {
    let value: number;
    if (/^0[xX][0-9a-fA-F]+$/.test(part)) value = parseInt(part.slice(2), 16);
    else if (/^0[0-7]+$/.test(part)) value = parseInt(part.slice(1), 8);
    else if (/^(0|[1-9][0-9]*)$/.test(part)) value = Number(part);
    else return null;
    if (!Number.isSafeInteger(value) || value < 0) return null;
    nums.push(value);
  }

  // In the short forms the final part soaks up the remaining bytes.
  const last = nums.pop();
  if (last === undefined) return null;
  if (nums.some((n) => n > 255)) return null;
  const spare = 4 - nums.length;
  if (last >= 256 ** spare) return null;

  const bytes = [...nums];
  for (let i = spare - 1; i >= 0; i--) bytes.push(Math.floor(last / 256 ** i) % 256);
  return bytes;
}

/** IPv6 (including the `::ffff:169.254.169.254` mapped form) reduced to sixteen bytes. */
function ipv6ToBytes(host: string): number[] | null {
  if (!host.includes(":")) return null;

  let text = host;
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    // Trailing dotted quad: rewrite it as two hex groups so one parser handles both.
    const v4 = ipv4ToBytes(tail);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s: string) => (s === "" ? [] : s.split(":"));
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;

  const groups = [...head, ...Array<string>(missing).fill("0"), ...rest];
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    const value = parseInt(group, 16);
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

/** Private, loopback, link-local, CGNAT, multicast and reserved IPv4 space. */
function isBlockedIPv4(b: number[]): boolean {
  const [a, c, d] = b;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // 127/8 loopback
  if (a === 100 && c >= 64 && c <= 127) return true; // 100.64/10 carrier-grade NAT
  if (a === 169 && c === 254) return true; // 169.254/16 link-local — cloud metadata
  if (a === 172 && c >= 16 && c <= 31) return true; // 172.16/12 private
  if (a === 192 && c === 168) return true; // 192.168/16 private
  if (a === 192 && c === 0 && (d === 0 || d === 2)) return true; // IETF assignments, TEST-NET-1
  if (a === 192 && c === 88 && d === 99) return true; // 6to4 relay anycast
  if (a === 198 && (c === 18 || c === 19)) return true; // 198.18/15 benchmarking
  if (a === 198 && c === 51 && d === 100) return true; // TEST-NET-2
  if (a === 203 && c === 0 && d === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // 224/4 multicast, 240/4 reserved, broadcast
  return false;
}

/** Loopback, unique-local, link-local, reserved IPv6 — and anything embedding a blocked IPv4. */
function isBlockedIPv6(b: number[]): boolean {
  const leadingZeros = (n: number) => b.slice(0, n).every((x) => x === 0);

  // ::ffff:a.b.c.d — an IPv4 address wearing an IPv6 costume.
  if (leadingZeros(10) && b[10] === 0xff && b[11] === 0xff) return isBlockedIPv4(b.slice(12));
  // ::, ::1 and the deprecated ::a.b.c.d compatible form.
  if (leadingZeros(12)) return true;
  // 64:ff9b::/96 NAT64 — the low four bytes are the real destination.
  if (
    b[0] === 0x00 &&
    b[1] === 0x64 &&
    b[2] === 0xff &&
    b[3] === 0x9b &&
    b.slice(4, 12).every((x) => x === 0)
  )
    return isBlockedIPv4(b.slice(12));
  if (b[0] === 0x01 && b[1] === 0x00 && b.slice(2, 8).every((x) => x === 0)) return true; // 100::/64 discard
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true; // 2001::/32 Teredo
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // 2001:db8::/32 docs
  if (b[0] === 0x20 && b[1] === 0x02) return true; // 2002::/16 6to4, deprecated
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true; // fec0::/10 site local, deprecated
  if (b[0] === 0xff) return true; // ff00::/8 multicast
  return false;
}

function normalizeHost(hostname: string): string {
  let host = hostname.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  while (host.endsWith(".")) host = host.slice(0, -1); // "localhost." is still localhost
  return host;
}

type Verdict = { ok: true } | { ok: false; reason: string };

/**
 * The host string on its own proves nothing: `metadata.example.com` is a perfectly
 * ordinary name that can have an A record of 169.254.169.254. So a literal is decoded
 * and range-checked, and a name is resolved and *every* address it answers with is
 * range-checked. One bad address is enough to refuse.
 */
async function checkHost(host: string): Promise<Verdict> {
  if (!host) return { ok: false, reason: "empty host" };
  if (BLOCKED_NAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s)))
    return { ok: false, reason: `blocked hostname ${host}` };

  const v6 = ipv6ToBytes(host);
  if (v6)
    return isBlockedIPv6(v6) ? { ok: false, reason: `blocked IPv6 literal ${host}` } : { ok: true };

  const v4 = ipv4ToBytes(host);
  if (v4)
    return isBlockedIPv4(v4) ? { ok: false, reason: `blocked IPv4 literal ${host}` } : { ok: true };

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: `DNS lookup failed for ${host}` };
  }
  if (addresses.length === 0) return { ok: false, reason: `no addresses for ${host}` };

  for (const { address, family } of addresses) {
    const bytes = family === 6 ? ipv6ToBytes(address) : ipv4ToBytes(address);
    if (!bytes) return { ok: false, reason: `unparseable address ${address} for ${host}` };
    const blocked = family === 6 ? isBlockedIPv6(bytes) : isBlockedIPv4(bytes);
    if (blocked) return { ok: false, reason: `${host} resolves to non-public address ${address}` };
  }
  return { ok: true };
}

export type UrlGuardResult = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Scheme, host and DNS check for one URL. `base` resolves a relative `Location`
 * header against the hop it came from.
 *
 * This runs again on every redirect hop, and that re-run is the load-bearing part
 * of the whole guard. The classic bypass is a first host that is genuinely public
 * and passes every check, answering 302 with `Location: http://169.254.169.254/`
 * (or a name that resolves there). Validating only the URL the user typed and then
 * letting fetch follow redirects hands the attacker exactly the request they wanted
 * — which is why `redirect: "manual"` is not an optimisation here but the mechanism:
 * it is what gives us a URL to re-check before the next socket is opened.
 */
export async function assertPublicHttpUrl(
  candidate: string,
  base?: string,
): Promise<UrlGuardResult> {
  let url: URL;
  try {
    url = new URL(candidate, base);
  } catch {
    return { ok: false, reason: `unparseable URL ${candidate}` };
  }
  // Scheme first: file:, gopher:, data: and friends never reach the host check.
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, reason: `blocked scheme ${url.protocol}` };

  const verdict = await checkHost(normalizeHost(url.hostname));
  return verdict.ok ? { ok: true, url } : { ok: false, reason: verdict.reason };
}

function discard(res: Response): void {
  void res.body?.cancel().catch(() => {});
}

/** Read the body as a stream, giving up past the cap so a huge page cannot eat the heap. */
async function readCappedBody(res: Response, contentType: string): Promise<string | null> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const charset = /charset=\s*"?([^;"\s]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset || "utf-8").decode(merged);
  } catch {
    return new TextDecoder("utf-8").decode(merged);
  }
}

type HtmlResult = { ok: true; url: string; html: string } | { ok: false; reason: string };

/** Guarded fetch: manual redirects, at most MAX_REDIRECTS hops, re-checked at each one. */
async function fetchPublicHtml(startUrl: string): Promise<HtmlResult> {
  const deadline = Date.now() + FETCH_BUDGET_MS;
  let target = startUrl;
  let base: string | undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const guard = await assertPublicHttpUrl(target, base);
    if (!guard.ok) return { ok: false, reason: guard.reason };
    const url = guard.url;

    const remaining = deadline - Date.now();
    if (remaining <= 0) return { ok: false, reason: `budget exhausted at ${url.host}` };

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(remaining),
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AgencyOS-SEO/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `request to ${url.host} failed: ${detail}` };
    }

    if (REDIRECT_STATUS.has(res.status)) {
      const location = res.headers.get("location");
      discard(res);
      if (!location) return { ok: false, reason: `${res.status} from ${url.host} with no Location` };
      target = location;
      base = url.toString();
      continue;
    }

    if (!res.ok) {
      discard(res);
      return { ok: false, reason: `${url.host} returned HTTP ${res.status}` };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("html")) {
      discard(res);
      return { ok: false, reason: `${url.host} returned content-type ${contentType || "(none)"}` };
    }

    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      discard(res);
      return { ok: false, reason: `${url.host} declared ${declared} bytes` };
    }

    const html = await readCappedBody(res, contentType);
    if (html === null) return { ok: false, reason: `${url.host} body exceeded ${MAX_BYTES} bytes` };
    return { ok: true, url: url.toString(), html };
  }

  return { ok: false, reason: `more than ${MAX_REDIRECTS} redirects from ${startUrl}` };
}

/** Fetch a URL server-side (guarded against SSRF, with timeout + UA) and analyze it. */
export async function fetchAndAnalyze(rawUrl: string): Promise<FetchResult> {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, error: "Enter a URL." };
  // Only add a scheme when there is none — otherwise "file:///etc/passwd" would be
  // rewritten into something the scheme check never sees.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  const result = await fetchPublicHtml(candidate);
  if (!result.ok) {
    console.error("fetchAndAnalyze:", result.reason);
    return { ok: false, error: BLOCKED_MESSAGE };
  }
  return { ok: true, url: result.url, data: analyzeHtml(result.html) };
}
