"use client";

import { useActionState } from "react";
import { saveModules, type SettingsState } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/Button";
import { MODULE_OPTIONS } from "@/lib/nav";

export function ModulesPanel({ hidden }: { hidden: string[] }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    saveModules,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4 px-4 py-4">
      <p className="text-[13px] leading-relaxed text-muted">
        Turn sections on or off. Unchecked ones are hidden from the sidebar and the “+ New” menu.
        Overview and Settings are always shown.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {MODULE_OPTIONS.map((m) => (
          <label
            key={m.key}
            className="flex items-center gap-2.5 rounded-ctrl border border-line px-3 py-2.5 text-[13px] text-ink"
          >
            <input
              type="checkbox"
              name={`mod_${m.key}`}
              defaultChecked={!hidden.includes(m.key)}
              className="h-4 w-4 accent-gold"
            />
            {m.label}
          </label>
        ))}
      </div>

      {state?.ok && <p className="text-[12px] text-ok">Saved.</p>}
      {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Save modules"}
      </Button>
    </form>
  );
}
