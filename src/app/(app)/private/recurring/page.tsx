import { redirect } from "next/navigation";

/**
 * The register is now a view of /private/upcoming. The old address keeps working, and
 * carries its query across: "+ New → New recurring" points here with `?new=1`, older
 * links carry `?edit=<id>`, and `saveRecurring` still redirects here after a save.
 * Only those two are forwarded — anything else on the URL is dropped rather than
 * copied blindly onto the new one.
 */
export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string }>;
}): Promise<never> {
  const params = await searchParams;

  const query = new URLSearchParams({ view: "rules" });
  if (params.new) query.set("new", params.new);
  if (params.edit) query.set("edit", params.edit);

  redirect(`/private/upcoming?${query}`);
}
