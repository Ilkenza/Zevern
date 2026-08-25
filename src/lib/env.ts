/**
 * Environment access with the check in one place.
 *
 * These were read as `process.env.X!` in four files and `?? ""` in a fifth, so a
 * missing key produced a Supabase client pointed at "undefined" and an extension
 * config that looked filled in but was not — a deployment that boots, renders, and
 * quietly fails every request. Reading through here turns that into one clear error
 * at the moment of use instead.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy it from the Supabase dashboard (Project settings → API) into .env.local, or into the environment of whatever is running this.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * The public address of this deployment, without a trailing slash.
 *
 * Unlike the Supabase keys this one does not throw when it is missing, because
 * nothing breaks without it — `metadataBase`, the sitemap and robots.txt simply need
 * an absolute origin to write down, and a localhost one is correct while developing.
 * Vercel exports `VERCEL_PROJECT_PRODUCTION_URL` on every deployment, so the fallback
 * chain lands on the right host by itself on the platform the app deploys to.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}
