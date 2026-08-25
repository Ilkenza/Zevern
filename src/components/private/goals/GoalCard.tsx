"use client";

import { useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Trophy } from "lucide-react";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { deleteGoal, moveGoal } from "@/app/(app)/private/actions";
import { Badge } from "@/components/ui/Badge";
import { formatAmount } from "@/lib/money";
import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import type { AccountBalance } from "@/lib/data/money";
import type { GoalLine } from "@/lib/types";
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
        className="zv-rowctrl zv-rowctrl-sm"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => move("down")}
        disabled={pending || last}
        aria-label={`Move ${goal.name} down`}
        title="Lower priority"
        className="zv-rowctrl zv-rowctrl-sm"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

export function GoalCard({
  goal,
  accounts,
  siblings,
  today,
  first,
  last,
  reorderable,
  compact = false,
  onOpen,
}: {
  goal: GoalLine;
  accounts: AccountBalance[];
  /** The other open goals — where an overshoot can go instead. */
  siblings: GoalLine[];
  today: string;
  first: boolean;
  last: boolean;
  reorderable: boolean;
  /** Collapsed to a line because another card is the one being worked on. */
  compact?: boolean;
  onOpen?: () => void;
}) {
  const { fmt } = useMoney();
  const r = read(goal, today, fmt);
  const colour = goal.color ?? NO_COLOUR;
  const target = Math.max(Number(goal.target_rsd) || 0, 0);
  // A goal aimed at euros says euros, with the dinar figure it was converted at
  // underneath — that is the number the progress bar is actually measuring.
  const foreign = goal.currency !== "RSD" && Number(goal.target_amount) > 0;
  const remaining = Math.max(target - goal.saved, 0);
  // Rounded down, and capped at 99 until the target is actually met — a goal one
  // dinar short should never claim to be finished.
  const shown = r.pct === null ? null : r.done ? 100 : Math.min(Math.floor(r.pct * 100), 99);

  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn("goal-strip", r.done && "is-done")}
        style={{ "--goal-accent": colour } as CSSProperties}
        aria-label={`Open ${goal.name}`}
      >
        <span aria-hidden="true" className="goal-strip-rail" style={{ background: colour }} />
        <span className="goal-strip-name">{goal.name}</span>
        <span className="goal-strip-bar" aria-hidden="true">
          <span
            className="goal-strip-fill"
            style={{
              width: `${r.pct === null ? 0 : Math.max(Math.min(r.pct, 1) * 100, goal.saved > 0 ? 2 : 0)}%`,
              background: colour,
            }}
          />
        </span>
        <span className="mono goal-strip-figure">
          {fmt(goal.saved)}
          {target > 0 && <span className="goal-strip-of"> / {fmt(target)}</span>}
        </span>
        {shown !== null && <span className="mono goal-strip-pct">{shown}%</span>}
      </button>
    );
  }

  return (
    <article
      className={cn(
        "money-card-premium goal-card-premium relative flex flex-col overflow-hidden rounded-card border",
        r.done ? "goal-card-reached border-gold/45" : "border-line bg-surface",
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
          <div className="goal-card-controls -mt-1 -mr-1 flex shrink-0 items-center gap-1">
            {reorderable && <Reorder goal={goal} first={first} last={last} />}
            <Link
              href={`${GOALS_HREF}?edit=${goal.id}`}
              aria-label={`Edit ${goal.name}`}
              title={`Edit ${goal.name}`}
              className="zv-rowctrl"
            >
              <Pencil className="h-3.75 w-3.75" />
            </Link>
            {/*
              The bin belongs beside the pencil, not three clicks away inside the edit
              panel. Everything it can destroy is explained in the confirmation.
            */}
            <DeleteButton
              compact
              label={`Delete ${goal.name}`}
              confirmText={`Delete "${goal.name}"? The target goes, the money does not: every deposit stays in the ledger and counts as free to spend again. To keep the record, close the goal instead.`}
              action={deleteGoal.bind(null, goal.id)}
            />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
          <span>
            <small className="goal-saved-label">Saved</small>
            <b className="mono goal-saved-value block text-[24px] font-semibold tracking-[-0.7px] text-ink">
              {fmt(goal.saved)}
            </b>
          </span>
          {r.badge && <Badge status={r.badge.status}>{r.badge.label}</Badge>}
        </div>

        {target > 0 && (
          <dl className="goal-card-metrics">
            <div>
              <dt>Target</dt>
              <dd className="mono">
                {foreign
                  ? formatAmount(Number(goal.target_amount), goal.currency)
                  : fmt(target)}
              </dd>
              {foreign && <dd className="mono goal-card-metric-note">≈ {fmt(target)}</dd>}
            </div>
            <div>
              <dt>{r.done ? "Above target" : "Remaining"}</dt>
              <dd className={cn("mono", r.done && goal.saved > target && "text-gold-hi")}>
                {r.done ? fmt(Math.max(goal.saved - target, 0)) : fmt(remaining)}
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
              {/*
                Quarter marks.

                Progress that only ever says a percentage gives you nothing to cross;
                a bar with thresholds on it does, and crossing one is what carries
                people through the long middle of a goal where deposits usually stop.
                They are hairlines, not decorations — the bar still reads as one thing.
              */}
              {[25, 50, 75].map((mark) => (
                <span
                  key={mark}
                  aria-hidden="true"
                  className={cn("goal-milestone", shown >= mark && "is-passed")}
                  style={{ left: `${mark}%` }}
                />
              ))}
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

        {/*
          Reaching a target used to be a green tint and a badge — the app saying "valid"
          where a person would say "you did it". This says it, and then says the one
          thing that is easy to get wrong next: the money is still only reserved, and
          closing the goal is what hands it back.
        */}
        {r.done ? (
          <div className="goal-reached-note">
            <Trophy className="h-4 w-4" aria-hidden />
            <span>
              <b>You made it.</b>{" "}
              {r.note} — your goal is fully funded. The money is still on the account, so
              when you buy the thing, say so once and Zevern logs the purchase and closes
              the goal together.{" "}
              <Link href={`${GOALS_HREF}?edit=${goal.id}`} className="goal-reached-link">
                I bought it →
              </Link>
            </span>
          </div>
        ) : (
          target === 0 && <p className="mt-2 text-[12px] text-muted">{r.note}</p>
        )}
        {goal.target_date && r.pace && (
          <p className="mt-0.5 text-[11.5px] text-faint">
            <span className="mono">{goal.target_date}</span> · {r.pace}
          </p>
        )}

        {/*
          What is already behind you, in the only two numbers that say it: how much has
          gone in, and how many times you decided to put it there. Both were already
          being computed and neither had ever been shown.
        */}
        {!r.done && goal.deposited > 0 && (
          <p className="mt-1.5 text-[11.5px] text-muted">
            <span className="mono text-ink">{fmt(goal.deposited)}</span> in across{" "}
            {goal.movements} {goal.movements === 1 ? "move" : "moves"}
            {goal.withdrawn > 0 && (
              <span className="text-faint">
                {" "}
                · <span className="mono">{fmt(goal.withdrawn)}</span> taken back
              </span>
            )}
          </p>
        )}

        {r.consequence && <p className="goal-consequence">{r.consequence}</p>}
      </div>

      <GoalHistory goal={goal} />
      <MoveMoney goal={goal} accounts={accounts} siblings={siblings} done={r.done} />
    </article>
  );
}
