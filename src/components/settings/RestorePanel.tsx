"use client";

import { useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { RestoreOutcome, RestorePlan, RestoreTable } from "@/lib/import/restore";

/**
 * A backup, brought back.
 *
 * The screen above this hands you a complete copy of the account and, until now, that
 * was the end of it — a file with nowhere to go. The whole of this panel is one
 * sentence: it adds what is missing and touches nothing else, which is what makes it
 * safe to press without reading anything first.
 *
 * So it is not explained at length. The preview is the explanation: press the button
 * and the screen tells you, in your own tables and your own numbers, exactly what it
 * would add before it adds anything.
 */

/** What each table is called by someone who did not design the database. */
const LABEL: Record<RestoreTable, string> = {
  clients: "clients",
  projects: "projects",
  invoices: "invoices",
  quotes: "quotes",
  leads: "leads",
  tasks: "tasks",
  seo_checks: "SEO checks",
  service_items: "services",
  outreach_templates: "templates",
  tools: "tools",
  money_accounts: "accounts",
  money_categories: "categories",
  money_goals: "goals",
  money_loans: "debts",
  money_budget_plans: "budgets",
  money_budgets: "category limits",
  money_items: "things you buy",
  money_recurring: "recurring rules",
  money_transactions: "entries",
  money_planned: "planned one-offs",
  money_budget_amounts: "budget amounts",
  money_budget_categories: "budget categories",
  money_budget_accounts: "budget accounts",
  money_budget_boosts: "budget boosts",
};

type Preview = { plan: RestorePlan; ignored: string[]; rows: number };

export function RestorePanel() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<RestoreOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
    The file goes up for the preview and again for the commit.

    Two uploads for one import, deliberately: nothing is held on the server between
    them, so there is no half-finished import to expire, to clean up, or to collide with
    a second tab. The file is the state, and it is on the person's own disk.
  */
  const send = async (mode: "preview" | "commit", picked: File) => {
    const body = new FormData();
    body.append("file", picked);
    body.append("mode", mode);
    const res = await fetch("/api/import", { method: "POST", body });
    return (await res.json()) as Record<string, unknown>;
  };

  const choose = async (picked: File | undefined) => {
    setError(null);
    setDone(null);
    setPreview(null);
    if (!picked) return;
    setFile(picked);
    setBusy(true);
    try {
      const body = await send("preview", picked);
      if (typeof body.error === "string") setError(body.error);
      else setPreview(body as unknown as Preview);
    } catch {
      setError("The file could not be sent. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const bringIn = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = await send("commit", file);
      const outcome = body as unknown as RestoreOutcome;
      setDone(outcome);
      setPreview(null);
      if (outcome.error) setError(outcome.error);
    } catch {
      setError("The import could not be sent. Nothing was brought in.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setDone(null);
    setError(null);
    if (input.current) input.current.value = "";
  };

  const added = preview?.plan.tables.filter((t) => t.add > 0) ?? [];

  return (
    <div className="mt-5 border-t border-line-soft pt-4">
      <div className="mb-2 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
        <Upload className="h-3.5 w-3.5" aria-hidden />
        Bring a backup back
      </div>

      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(e) => void choose(e.target.files?.[0])}
      />

      {done ? (
        <div className="rounded-ctrl border border-ok/40 bg-ok-bg px-3 py-2.5 text-[12.5px] text-ok">
          <p className="flex items-center gap-1.5 font-semibold">
            <Check className="h-4 w-4" />
            {done.added === 0
              ? "Everything in that file was already here."
              : `Brought in ${done.added} ${done.added === 1 ? "row" : "rows"}.`}
          </p>
          {done.tables.length > 0 && (
            <p className="mt-1 text-muted">
              {done.tables.map((t) => `${t.added} ${LABEL[t.table]}`).join(" · ")}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            className="mt-2 font-semibold text-gold-hi underline"
          >
            Another file
          </button>
        </div>
      ) : preview ? (
        <div className="rounded-ctrl border border-line bg-white/3 px-3 py-2.5 text-[12.5px]">
          {preview.plan.add === 0 ? (
            <p className="text-muted">Everything in that file is already here.</p>
          ) : (
            <p className="text-ink">{added.map((t) => `${t.add} ${LABEL[t.table]}`).join(" · ")}</p>
          )}
          {preview.plan.already > 0 && (
            <p className="mt-1 text-faint">
              {preview.plan.already} already here — left alone.
            </p>
          )}
          {preview.plan.orphaned > 0 && (
            <p className="mt-1 text-faint">
              {preview.plan.orphaned} skipped — they belong to a budget that is not in the
              file or here.
            </p>
          )}
          {preview.ignored.length > 0 && (
            <p className="mt-1 text-faint">Not read: {preview.ignored.join(", ")}.</p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => void bringIn()}
              disabled={busy || preview.plan.add === 0}
              className="px-3 py-1.5 text-[12.5px]"
            >
              {busy ? "Bringing in…" : `Bring in ${preview.plan.add}`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={reset}
              disabled={busy}
              className="px-3 py-1.5 text-[12.5px]"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="px-3 py-1.5 text-[12.5px]"
          >
            {busy ? "Reading…" : "Choose a backup file"}
          </Button>
          <span className="text-[11.5px] text-faint">
            Adds what is missing. Nothing here is changed or deleted.
          </span>
        </div>
      )}

      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
    </div>
  );
}
