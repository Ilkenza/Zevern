import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { commitRestore, MAX_BYTES, parseBackup, planRestore } from "@/lib/import/restore";

/**
 * A backup, read back in.
 *
 * A route rather than a server action, and the reason is a hard limit rather than a
 * preference: a server action's body is capped at a megabyte by default, and the file
 * this reads is the one the export wrote — an account with a few years of ledger in it
 * clears that on its own. A route takes the upload as `multipart/form-data` and the cap
 * is ours to set.
 *
 * Two modes over one endpoint, and the file comes up the wire for each. `preview`
 * touches nothing and answers "here is what would happen"; `commit` does it. That means
 * uploading twice for one import, which is the price of holding no half-finished state
 * on the server — nothing to expire, nothing to clean up, nothing to confuse a second
 * tab with. For a file of this size it is not a price anyone notices.
 *
 * Who the rows belong to is not a question this file asks the file. `restore.ts`
 * overwrites every `user_id` with the signed-in account's, and the database's own
 * policies refuse anything else.
 */

/** The upload is read into memory, so the cap is checked before the read, not after. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "That upload could not be read." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That file is too large to be a backup of this account." },
      { status: 413 },
    );
  }

  const commit = form.get("mode") === "commit";
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  if (!commit) {
    const planned = await planRestore(supabase, uid, parsed.backup.data);
    if (!planned.ok) return NextResponse.json({ error: planned.error }, { status: 500 });
    return NextResponse.json(
      { plan: planned.plan, ignored: parsed.backup.ignored, rows: parsed.backup.rows },
      { headers: { "cache-control": "no-store, private" } },
    );
  }

  const outcome = await commitRestore(supabase, uid, parsed.backup.data);

  /*
    Revalidated even when the commit stopped partway, because by then rows are in and
    every screen reading them is stale. A failed import that leaves the app showing the
    numbers from before is the same bug as a successful one that does.
  */
  if (outcome.added > 0) {
    revalidatePath("/", "layout");
  }

  return NextResponse.json(outcome, {
    status: outcome.error ? 500 : 200,
    headers: { "cache-control": "no-store, private" },
  });
}
