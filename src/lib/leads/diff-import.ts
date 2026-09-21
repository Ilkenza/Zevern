import type { ImportRow } from "./parse-import";
import type { Lead } from "@/lib/types";

export type ImportChange = { field: string; from: string; to: string };
export type ImportUpdate = {
  id: string;
  name: string;
  changes: ImportChange[];
  payload: Partial<Lead>;
};
export type ImportPlan = { newRows: ImportRow[]; updates: ImportUpdate[]; unchanged: number };

const disp = (v: unknown) => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? "—" : s;
};

const keyOf = (contact: string | null, name: string) =>
  ((contact ?? "").trim() || (name ?? "").trim()).toLowerCase();


export function computeImportPlan(rows: ImportRow[], existing: Lead[]): ImportPlan {
  const byKey = new Map<string, Lead>();
  for (const e of existing) {
    const k = keyOf(e.contact, e.name);
    if (k && !byKey.has(k)) byKey.set(k, e);
  }

  const newRows: ImportRow[] = [];
  const updates: ImportUpdate[] = [];
  let unchanged = 0;

  const softFields = ["company", "contact", "channel", "service", "notes", "next_followup"] as const;

  for (const r of rows) {
    const ex = byKey.get(keyOf(r.contact, r.name));
    if (!ex) {
      // A lead nobody has told us about yet starts where every new lead starts.
      newRows.push({ ...r, status: r.status ?? "new" });
      continue;
    }

    const changes: ImportChange[] = [];
    const payload: Partial<Lead> = {};

    for (const f of softFields) {
      const to = r[f] as string | null;
      if (to != null && String(to).trim() !== "" && String(to) !== String(ex[f] ?? "")) {
        changes.push({ field: f, from: disp(ex[f]), to: disp(to) });
        (payload as Record<string, unknown>)[f] = to;
      }
    }

    // Only a status the sheet actually gave. A missing one leaves the lead where it is.
    if (r.status && r.status !== ex.status) {
      changes.push({ field: "status", from: disp(ex.status), to: disp(r.status) });
      payload.status = r.status;
    }

    if (r.value > 0 && r.value !== Number(ex.value)) {
      changes.push({ field: "value", from: disp(ex.value), to: disp(r.value) });
      payload.value = r.value;
    }

    if (changes.length > 0) {
      updates.push({ id: ex.id, name: ex.name, changes, payload });
    } else {
      unchanged++;
    }
  }

  return { newRows, updates, unchanged };
}
