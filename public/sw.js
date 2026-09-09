/*
  The service worker, and the two things it deliberately does not do.

  It does not cache a single page. Every screen in this app is a server render of one
  account's money, behind a session — serving one of those from a cache means showing a
  figure that was true a week ago, with nothing on screen saying so. In an app whose
  whole job is to be right about numbers, a stale page is worse than no page.

  It does not queue writes either. Filing an expense while offline and syncing it later
  needs an idempotency key per entry and an answer for what happens to a balance
  correction made in the meantime; without both, the reliable outcome is duplicates. That
  is a decision to take on its own, not a side effect of making the app installable.

  What it does is make the shell instant. Next's build output is content-hashed — a file
  at a given URL never changes — so those can be cached forever and served without a
  round trip. That is what turns a home-screen tap from "white, then the app" into "the
  app".
*/

const CACHE = "zevern-static-v2";

/* Only what is safe: immutable build output, our own icons, and the font files. */
function cacheable(url) {
  if (url.origin === self.location.origin) {
    return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
  }
  return url.origin === "https://fonts.gstatic.com";
}

self.addEventListener("install", () => {
  // Nothing to precache — the filenames are decided at build time and change every
  // deploy. Take over as soon as this version is ready rather than waiting for every
  // tab to close.
  self.skipWaiting();
});

/*
  Whether this worker is running in front of a development server.

  The page that registers this one already refuses to in development — but a service
  worker outlives the page that installed it, and it is scoped to an *origin*, not to a
  build. One `npm run build && npm start` on localhost registers it there for good, and
  every `npm run dev` afterwards is served through a cache of `/_next/static/`. In
  development Turbopack reuses chunk filenames, so that cache never misses: the
  stylesheet is frozen at whatever it was the day the worker was installed.

  What makes it hard to see is that the JavaScript keeps updating — HMR pushes it down a
  websocket, which never touches a worker — so the app behaves like the new code and is
  painted by the old CSS. A layout that had been rewritten three times went on rendering
  as the first version, and every look at it was a look at a fixed bug.
*/
function isDevOrigin() {
  const h = self.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".local");
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      /*
        On a dev origin the right thing is not to cache more carefully — it is to stop
        being here. Drop every cache and unregister, so the next reload is served by the
        dev server directly and this cannot happen again.
      */
      if (isDevOrigin()) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
        await self.registration.unregister();
        const tabs = await self.clients.matchAll({ type: "window" });
        for (const tab of tabs) tab.navigate(tab.url).catch(() => {});
        return;
      }

      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Writes are never touched. A POST to a server action must reach the server or fail
  // loudly; there is no version of "handled it from the cache" that is true.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  // Belt as well as braces: until the unregister above takes effect, serve nothing here.
  if (isDevOrigin()) return;
  if (!cacheable(url)) return;

  event.respondWith(
    (async () => {
      const hit = await caches.match(request);
      if (hit) return hit;

      const response = await fetch(request);
      /*
        Only a clean answer is kept. A 206 or an opaque error cached here would be served
        back forever, and the file it stands for never changes name, so nothing would ever
        correct it.
      */
      if (response && response.status === 200 && response.type !== "error") {
        const copy = response.clone();
        const cache = await caches.open(CACHE);
        cache.put(request, copy).catch(() => {});
      }
      return response;
    })(),
  );
});
