import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * "/" is public because it serves two pages: the marketing page to a visitor and
 * the dashboard to a signed-in user. The page decides which, so the guard here only
 * has to let the anonymous request through — every other app route stays closed.
 *
 * The three files after the auth pages are read by machines that have no session and
 * never will: a crawler asking what it may index, and whatever renders a link
 * preview. Redirecting those to /login is not a lock, it is a broken address — the
 * crawler records the redirect, and the preview card comes back empty.
 */
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
  "/setup-preview",
];

/**
 * Prefixes that are public for the whole subtree.
 *
 * `/auth` is the callback Supabase sends people back through, so it has to be
 * reachable without the session it is in the middle of establishing.
 *
 * `/api/calendar` is the .ics feed, and it is here because it was broken without it:
 * the feed is fetched by Google's servers and by phone calendar daemons, none of
 * which carry a cookie, so every one of them was being answered with a 307 to the
 * sign-in page instead of a calendar. The route is not unguarded — the token in the
 * path is the whole credential and `calendar_feed` checks it — but that check never
 * ran, because this guard turned the request away first.
 */
const PUBLIC_PREFIXES = ["/auth", "/api/calendar"];

/** Signed-in users are bounced away from these to the dashboard. */
const BOUNCE_ROUTES = ["/login", "/forgot-password"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_ROUTES.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }


  if (user && BOUNCE_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [

    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
