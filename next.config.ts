import type { NextConfig } from "next";

/**
 * The server keeps the user's clock, not the datacentre's.
 *
 * Almost every date in Zevern is a wall clock and carries no zone at all, so it
 * reads back the same wherever it is opened. "Today" is the exception: the tasks
 * due today, the overdue counts and the revenue month are all decided on the
 * server, and a host running in UTC answers "what day is it" with yesterday's date
 * for the first two hours of every Belgrade morning.
 *
 * Set `APP_TIMEZONE` to move it. The default is simply where the app is used.
 */
process.env.TZ = process.env.APP_TIMEZONE || "Europe/Belgrade";

const isDev = process.env.NODE_ENV === "development";

/**
 * Where the browser is allowed to talk to.
 *
 * The Supabase URL is a build-time public value, so pinning it here costs nothing
 * and is far tighter than the wildcard. The wildcard is the fallback for a build
 * that has no env yet (CI type-checking, a fresh clone) — it still shuts out every
 * host that is not Supabase.
 */
function supabaseOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "https://*.supabase.co wss://*.supabase.co";
  try {
    const { origin, host } = new URL(url);
    return `${origin} wss://${host}`;
  } catch {
    return "https://*.supabase.co wss://*.supabase.co";
  }
}

/**
 * The content policy, written out rather than generated, because the interesting
 * part of a CSP is the reason each line is as loose as it is:
 *
 * - `script-src` carries 'unsafe-inline'. Next.js inlines its own bootstrap and the
 *   flight payload into the document, and the alternative is a per-request nonce
 *   threaded through the proxy — which is worth doing the day this app renders
 *   somebody else's markup. It renders none: there is no `dangerouslySetInnerHTML`
 *   anywhere in `src`, so there is no injection point for the directive to close.
 * - `script-src` also carries 'wasm-unsafe-eval', which is not the loosening it looks
 *   like. It permits one thing: compiling a WebAssembly module. It does not turn on
 *   `eval`, `new Function`, or running a string as script — those stay refused, and
 *   `'unsafe-eval'` would have allowed all of them. The receipt scanner's QR decoder is
 *   WebAssembly, served from this origin, and without this token the browser refuses to
 *   compile it: it worked in development only because Fast Refresh needs 'unsafe-eval'
 *   there, which happens to cover WebAssembly too. In production it failed with a
 *   CompileError, on every path, from the day it shipped.
 * - `style-src` carries it because Tailwind and every inline `style` attribute in
 *   the charts need it, and a style attribute cannot exfiltrate anything here.
 * - `img-src https:` is for avatars and whatever a client's logo turns out to be.
 * - `connect-src` is Supabase and nothing else — this is the line that would stop a
 *   compromised dependency from posting your ledger somewhere.
 * - `frame-ancestors 'none'` is the one that matters most day to day: it is what
 *   stops the app being framed inside somebody else's page and clicked through.
 *
 * In development the same policy would break React Fast Refresh (eval) and the HMR
 * socket, so those two get let in there and nowhere else.
 */
function contentSecurityPolicy(): string {
  const supabase = supabaseOrigin();
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabase}${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,

  /**
   * Route changes animate.
   *
   * This is what turns a navigation from a flash into a movement: the browser
   * photographs the outgoing page and the incoming one and animates between them, so
   * the sidebar holds still and only the content travels. React's `<ViewTransition>`
   * is what drives it; this flag is what makes Next fire it on a route change.
   *
   * It is an experimental flag, and worth knowing why that is safe here. The feature
   * degrades to nothing: a browser without the View Transitions API renders exactly
   * the app that existed before, and so does anyone with `prefers-reduced-motion` set.
   * Nothing about what the app *does* depends on it.
   *
   * Turning it on also moves the app onto React's canary channel, which is the
   * channel the App Router already runs on.
   */
  experimental: {
    viewTransition: true,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          // Two years, subdomains included, and eligible for the preload list. Only
          // ever sent over HTTPS by the platform, so a local http:// dev server is
          // unaffected by it.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Belt to frame-ancestors' braces, for the browsers that still read it.
          { key: "X-Frame-Options", value: "DENY" },
          // No MIME sniffing: an uploaded file that claims to be text stays text.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // A referrer leaks the path, and the paths here contain row ids — and, on
          // the calendar feed, the token itself. Send the origin at most.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          /*
            Nothing in the app may ask for any of these — except the camera, which one
            screen now does.

            `camera=()` is an empty allow-list: no origin at all, the page's own included.
            It was correct when it was written, and it stayed in place when the receipt
            scanner arrived — so the browser refused `getUserMedia` in a millisecond, with
            no prompt, on every address the app is served from, while the browser's own
            camera setting said "sites can ask" and macOS had the browser switched on.
            Three layers, two of them innocent, and the refusal was coming from here.

            `self` is the whole of the change: this origin may use the camera, and nothing
            it embeds can. Everything else stays shut.
          */
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
          // Keep this window's browsing context to itself.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      {
        // The one address that answers without a session. It must never be indexed,
        // never cached by anything shared, and never framed.
        source: "/api/calendar/:token*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
