"use client";

import { useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { moveGoal } from "@/app/(app)/private/actions";
import { Badge } from "@/components/ui/Badge";
import { formatRsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { GoalLine, MoneyAccount } from "@/lib/types";
import { GOALS_HREF, NO_COLOUR } from "./shared";
import { read } from "./reading";
import { GoalHistory } from "./GoalHistory";
import { MoveMoney } from "./MoveMoney";

/** Move a goal up or down the list — priority the owner chose, not creation order. */
function Reorder({ goal, first, last }: { goal: GoalLine; first: boolean; last: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const move = (direction: "up" | "down") => {
    startTransition(async () => {
      await moveGoal(goal.id, direction);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => move("up")}
        disabled={pending || first}
        aria-label={`Move ${goal.name} up`}
        title="Higher priority"
        className="rounded-ctrl p-1 text-faint transition-colors hover:bg-white/5 hover:text-ink disabled:opacity-30"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => move("down")}
        disabled={pending || last}
        aria-label={`Move ${goal.name} down`}
        title="Lower priority"
        className="rounded-ctrl p-1 text-faint transition-colors hover:bg-white/5 hover:text-ink disabled:opacity-30"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

export function GoalCard({
  goal,
  accounts,
  today,
  first,
  last,
  reorderable,
}: {
  goal: GoalLine;
  accounts: MoneyAccount[];
  today: string;
  first: boolean;
  last: boolean;
  reorderable: boolean;
}) {
  const r = read(goal, today);
  const colour = goal.color ?? NO_COLOUR;
  const target = Math.max(Number(goal.target_rsd) || 0, 0);
  const remaining = Math.max(target - goal.saved, 0);
  // Rounded down, and capped at 99 until the target is actually met — a goal one
  // dinar short should never claim to be finished.
  const shown = r.pct === null ? null : r.done ? 100 : Math.min(Math.floor(r.pct * 100), 99);

  return (
    <article
      className={cn(
        "money-card-premium goal-card-premium relative flex flex-col overflow-hidden rounded-card border",
        r.done ? "goal-card-reached border-ok/35 bg-ok-bg" : "border-line bg-surface",
      )}
      style={{ "--goal-accent": colour } as CSSProperties}
    >
      <span className="goal-card-orb" aria-hidden="true" />
      {/* The goal's own colour, down the whole edge — its identity in the grid. */}
      <span
        aria-hidden="true"
        className="goal-accent-rail absolute inset-y-0 left-0 w-1"
        style={{ background: colour }}
      />

      <div className="flex-1 py-3.5 pr-4 pl-5">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{goal.name}</h3>
          <div className="-mt-1 -mr-1.5 flex shrink-0 items-center">
            {reorderable && <Reorder goal={goal} first={first} last={last} />}
            <Link
              href={`${GOALS_HREF}?edit=${goal.id}`}
              aria-label={`Edit ${goal.name}`}
              title={`Edit ${goal.name}`}
              className="rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
            >
              <Pencil className="h-3.75 w-3.75" />
            </Link>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
          <span>
            <small className="goal-saved-label">Saved</small>
            <b className="mono goal-saved-value block text-[24px] font-semibold tracking-[-0.7px] text-ink">
              {formatRsd(goal.saved)}
            </b>
          </span>
          {r.badge && <Badge status={r.badge.status}>{r.badge.label}</Badge>}
        </div>

        {target > 0 && (
          <dl className="goal-card-metrics">
            <div>
              <dt>Target</dt>
              <dd className="mono">{formatRsd(target)}</dd>
            </div>
            <div>
              <dt>{r.done ? "Above target" : "Remaining"}</dt>
              <dd className={cn("mono", r.done && goal.saved > target && "text-ok")}>
                {r.done ? formatRsd(Math.max(goal.saved - target, 0)) : formatRsd(remaining)}
              </dd>
            </div>
          </dl>
        )}

        {r.pct !== null && shown !== null && (
          <div className="mt-2.5 flex items-center gap-2.5">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={shown}
              aria-label={`${goal.name} progress`}
              className="goal-progress-track h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-white/6"
            >
              {/* A first deposit that rounds to nothing still deserves to be visible. */}
              <div
                className="money-progress-fill h-full rounded-pill transition-[width] duration-700 motion-reduce:transition-none"
                style={{
                  width: `${goal.saved > 0 ? Math.max(r.pct * 100, 2) : 0}%`,
                  background: colour,
                }}
              />
            </div>
            <span className="mono w-9 shrink-0 text-right text-[11.5px] font-semibold text-muted">
              {shown}%
            </span>
          </div>
        )}

        {(target === 0 || r.done) && <p className="mt-2 text-[12px] text-muted">{r.note}</p>}
        {goal.target_date && r.pace && (
          <p className="mt-0.5 text-[11.5px] text-faint">
            <span className="mono">{goal.target_date}</span> · {r.pace}
          </p>
        )}
      </div>

      <GoalHistory goal={goal} />
      <MoveMoney goal={goal} accounts={accounts} done={r.done} />
    </article>
  );
}

