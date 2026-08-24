"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteAccount } from "@/app/(app)/settings/actions";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export function DangerZone({ email }: { email: string }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The server checks this too — matching here only keeps the button honest.
  const matches = email !== "" && typed.trim().toLowerCase() === email.trim().toLowerCase();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount(typed);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="px-4 py-4">
      <p className="text-[13px] leading-relaxed text-muted">
        This deletes your account and everything in it — clients, projects, tasks, invoices,
        quotes and the service catalog, leads and outreach templates, SEO checks, the toolbox,
        and the whole Private workspace including every transaction, account, budget, goal and
        recurring item. There is no backup and no undo.
      </p>

      <label className="mt-4 block text-[12.5px] font-semibold text-[#C6CAD6]">
        Type <span className="mono text-ink">{email}</span> to confirm
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-label={`Type ${email} to confirm deletion`}
          className="mono mt-1.5 block w-full max-w-96 rounded-ctrl border border-line bg-white/[0.035] px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-danger focus:outline-none"
        />
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={!matches || pending}
        className={cn(buttonClasses("danger"), "mt-3", !matches && "cursor-not-allowed opacity-50")}
      >
        <Trash2 className="h-4 w-4" />
        {pending ? "Deleting…" : "Delete account permanently"}
      </button>

      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
    </div>
  );
}
