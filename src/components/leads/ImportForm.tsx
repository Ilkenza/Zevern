"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import {
  previewLeadsImport,
  commitLeadsImport,
  type ImportPreview,
  type ImportResult,
} from "@/app/(app)/leads/actions";
import { Button, buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Preview = Exclude<ImportPreview, { error: string }>;

const TEMPLATE =
  "name,company,contact,channel,service,status,value,next_followup,notes\n" +
  "John Miller,Mike's Cafe,@john,instagram,new_site,contacted,800,2026-08-01,Sent a quote\n" +
  "Anna Peters,Studio Anna,@anna,instagram,redesign,new,1200,,No reply yet";

function downloadTemplate() {
  const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leads-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportForm() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onPreview() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await previewLeadsImport(text);
      if ("error" in res) {
        setError(res.error);
        setPreview(null);
        return;
      }
      setPreview(res);
    });
  }

  function onConfirm() {
    startTransition(async () => {
      const res = await commitLeadsImport(text, updateExisting);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult(res);
      setPreview(null);
    });
  }

  // Success screen
  if (result) {
    return (
      <div className="rounded-card border border-ok/40 bg-ok-bg px-4 py-4 text-[13px] text-ok">
        <p className="font-semibold">
          Imported {result.imported} new lead{result.imported === 1 ? "" : "s"}
          {result.updated ? ` · updated ${result.updated} existing` : ""}.
        </p>
        <Link
          href="/leads"
          className="mt-2 inline-block font-semibold underline"
        >
          View leads
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-4 text-[12.5px] text-muted">
        <p className="mb-2 font-semibold text-ink">How it works</p>
        <p>
          Paste your leads — CSV, or copy a range straight from Excel / Google
          Sheets (pastes as tab-separated). First row must be the header. We
          match by contact (@handle) or name, so re-importing updates existing
          leads instead of duplicating them.
        </p>
        <ul className="mt-3 space-y-1">
          <li>
            <span className="mono text-ink">name</span> — required
          </li>
          <li>
            <span className="mono text-ink">company, contact, notes</span> —
            free text
          </li>
          <li>
            <span className="mono text-ink">channel</span> — email · instagram ·
            linkedin · whatsapp · phone · other
          </li>
          <li>
            <span className="mono text-ink">service</span> — new_site · redesign
            · fix
          </li>
          <li>
            <span className="mono text-ink">status</span> — new · contacted ·
            seen · replied · negotiating · won · lost
          </li>
          <li>
            <span className="mono text-ink">value</span> — € number ·{" "}
            <span className="mono text-ink">next_followup</span> —{" "}
            <span className="mono">YYYY-MM-DD</span>
          </li>
        </ul>
        <button
          type="button"
          onClick={downloadTemplate}
          className={cn(
            buttonClasses("secondary"),
            "mt-3 h-8 px-3 text-[12px]",
          )}
        >
          <Download className="h-3.5 w-3.5" />
          Download CSV template
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        rows={12}
        placeholder={
          "name,company,contact,channel,service,status,value,next_followup,notes\n…"
        }
        className="mono w-full resize-y rounded-ctrl border border-line bg-white/[0.035] px-3 py-2.5 text-[12px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring focus:outline-none"
      />

      {error && (
        <p className="rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
          {error}
        </p>
      )}

      {/* Preview / confirmation */}
      {preview && (
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-[13px] text-ink">
            <span className="font-semibold text-ok">
              {preview.newCount} new
            </span>{" "}
            ·{" "}
            <span className="font-semibold text-gold">
              {preview.updates.length} to update
            </span>{" "}
            · <span className="text-muted">{preview.unchanged} unchanged</span>
            {preview.skipped ? ` · ${preview.skipped} skipped` : ""}
          </p>

          {preview.updates.length > 0 && (
            <>
              <label className="mt-3 flex items-center gap-2 text-[12.5px] text-ink">
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={(e) => setUpdateExisting(e.target.checked)}
                  className="accent-[#D9A441]"
                />
                Update the {preview.updates.length} existing lead
                {preview.updates.length === 1 ? "" : "s"} below
              </label>

              <div className="mt-3 max-h-70 space-y-2 overflow-y-auto">
                {preview.updates.map((u) => (
                  <div
                    key={u.id}
                    className="rounded-ctrl border border-line-soft px-3 py-2"
                  >
                    <div className="text-[12.5px] font-semibold text-ink">
                      {u.name}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {u.changes.map((c) => (
                        <li key={c.field} className="text-[11.5px] text-muted">
                          <span className="text-faint">{c.field}:</span>{" "}
                          <span className="line-through">{c.from}</span> →{" "}
                          <span className="text-ink">{c.to}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={onConfirm}
              disabled={pending}
            >
              {pending ? "Importing…" : "Confirm import"}
            </Button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className={buttonClasses("secondary")}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Initial actions */}
      {!preview && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={onPreview}
            disabled={pending || !text.trim()}
          >
            {pending ? "Checking…" : "Preview import"}
          </Button>
          <Link href="/leads" className={buttonClasses("secondary")}>
            Cancel
          </Link>
        </div>
      )}
    </div>
  );
}
