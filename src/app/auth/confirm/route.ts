import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where a valid email link lands, taken from the query string.
 *
 * String tests on the raw value are not enough: the URL parser strips tab, newline
 * and carriage return *before* resolving, so `/%09/evil.com` passes a `startsWith("//")`
 * check and then resolves to `https://evil.com/`. And an off-origin landing is not a
 * cosmetic problem here — the redirect fires after the session cookie is set, so it
 * hands someone a working session and then walks them somewhere else.
 *
 * So: an allowlist, not a filter. These two are the only places an email link is ever
 * meant to end up, and anything else falls back to the app root.
 */
const ALLOWED_NEXT = new Set(["/", "/reset-password"]);

function safeNext(raw: string | null): string {
  if (!raw) return "/";
  // Drop the characters the URL parser would have stripped anyway, so the compare
  // below sees exactly what the browser would eventually see.
  const cleaned = raw.replace(/[\s\u0000-\u001F\u007F]/g, "");
  return ALLOWED_NEXT.has(cleaned) ? cleaned : "/";
}

/**
 * Handles email links (password recovery, signup confirm). Verifies the OTP,
 * which sets the session cookie, then forwards to `next` (e.g. /reset-password).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=invalid-link", origin));
}
