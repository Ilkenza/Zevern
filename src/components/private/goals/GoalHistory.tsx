"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { removeTransaction } from "@/app/(app)/private/actions";
import { DeleteButton } from "@/components/ui/DeleteButton";

import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import type { GoalEntry, GoalLine } from "@/lib/types";

/**
 * One movement, in the goal's own words. The account is named because that is the
 * question the run of deposits is usually asked to settle — which pocket it came from.
 */
function EntryRow({ entry, goalName }: { entry: GoalEntry; goalName: string }) {
  const { fmt } = useMoney();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const out = entry.kind === "withdraw";

  return (
    <div className="border-b border-line-soft py-1.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="mono shrink-0 text-[11px] text-faint">{entry.occurred_on}</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">
          {entry.account ?? "No account"}
          {entry.note ? ` · ${entry.note}` : ""}
          {entry.recurring && !entry.note ? " · standing order" : ""}
        </span>
        <span
          className={cn("mono shrink-0 text-[12px] font-semibold", out ? "text-muted" : "text-ink")}
        >
          {out ? "−" : "+"} {fmt(entry.amount)}
        </span>
        <DeleteButton
          compact
          label={`Delete this ${out ? "withdrawal" : "deposit"}`}
          confirmText={`Remove ${fmt(entry.amount)} of ${entry.occurred_on} from ${goalName}? The entry leaves the ledger and every balance is worked out without it.`}
          action={async () => {
            const result = await removeTransaction(entry.id);
            if (result?.error) setError(result.error);
            else router.refresh();
          }}
        />
      </div>
      {error && <p className="pb-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

/**
 * The run of deposits — the thing that actually makes saving feel like something.
 * Folded away by default, because the card's job is the figure at the top; opened, it
 * is also the only place a fat-fingered 50.000 can be found and taken back out.
 */
export function GoalHistory({ goal }: { goal: GoalLine }) {
  const { fmt } = useMoney();
  const [open, setOpen] = useState(false);

  if (goal.movements === 0) return null;

  const deposits = goal.entries.filter((e) => e.kind === "saving").length;
  const shown = goal.entries.length;

  return (
    <div className="goal-history border-t border-line-soft px-5 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="goal-history-trigger flex w-full items-center gap-1.5 text-left text-[11.5px] font-semibold text-muted transition-colors hover:text-ink"
      >
        <History className="h-3.25 w-3.25 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {goal.movements} {goal.movements === 1 ? "movement" : "movements"}
          {goal.withdrawn > 0 && (
            <span className="font-normal text-faint">
              {" "}
              · {fmt(goal.withdrawn)} taken back out
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>

      {open && (
        <div className="goal-history-content mt-1">
          {goal.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} goalName={goal.name} />
          ))}
          <p className="pt-2 text-[11px] text-faint">
            {shown < goal.movements
              ? `The last ${shown} of ${goal.movements}. `
              : deposits > 1
                ? `${deposits} deposits, ${fmt(goal.deposited)} in total. `
                : ""}
            Every one of these is an entry in Money.
          </p>
        </div>
      )}
    </div>
  );
}

