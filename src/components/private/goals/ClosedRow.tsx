"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, RotateCcw } from "lucide-react";
import { archiveGoal, reopenGoal, type MoneyState } from "@/app/(app)/private/actions";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";

import type { GoalLine } from "@/lib/types";
import { NO_COLOUR } from "./shared";
import { GoalHistory } from "./GoalHistory";
import { useMoney } from "@/lib/money/currency";

/** One closed goal: what passed through it, and the two ways back. */
export function ClosedRow({ goal }: { goal: GoalLine }) {
  const { fmt } = useMoney();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const target = Number(goal.target_rsd) || 0;
  // Reached means it actually stood at the whole amount at once, which is not the same
  // as the sum of everything that ever counted toward it.
  const reached = target > 0 && goal.peak >= target;

  const run = (fn: () => Promise<MoneyState>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="goal-closed-row border-b border-line-soft last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <span
          aria-hidden="true"
          className="h-7 w-1 shrink-0 rounded-pill opacity-60"
          style={{ background: goal.color ?? NO_COLOUR }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-[13px] font-semibold text-muted">
              {goal.name}
            </span>
            <Badge status={reached ? "ok" : "draft"}>
              {reached ? (goal.paying ? "Paid off" : "Reached") : "Closed"}
            </Badge>
          </div>
          <div className="mt-0.5 text-[11.5px] text-faint">
            <span className="mono">{fmt(goal.deposited)}</span>{" "}
            {goal.paying ? "paid" : "went in"}
            {target > 0 && (
              <>
                {" "}
                of <span className="mono">{fmt(target)}</span>
              </>
            )}
            {goal.completed_at && (
              <>
                {" "}
                · closed <span className="mono">{goal.completed_at}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => run(() => reopenGoal(goal.id))}
            disabled={pending}
            className={buttonClasses("secondary", "px-2.5 py-1 text-[12px] disabled:opacity-50")}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reopen
          </button>
          <button
            type="button"
            onClick={() => run(() => archiveGoal(goal.id, !goal.archived))}
            disabled={pending}
            aria-label={goal.archived ? `Bring ${goal.name} back` : `Archive ${goal.name}`}
            title={goal.archived ? "Bring it back to the closed list" : "Put it in the archive"}
            className="rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink disabled:opacity-50"
          >
            {goal.archived ? (
              <ArchiveRestore className="h-3.75 w-3.75" />
            ) : (
              <Archive className="h-3.75 w-3.75" />
            )}
          </button>
        </div>
      </div>
      {error && <p className="px-4 pb-2.5 text-[11px] text-danger">{error}</p>}
      {/* The run of deposits is worth more once the thing is finished, not less. */}
      <GoalHistory goal={goal} />
    </div>
  );
}

