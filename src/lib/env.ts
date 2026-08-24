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
