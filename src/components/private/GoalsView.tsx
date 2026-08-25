"use client";

import { useActionState, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  History,
  PiggyBank,
  Plus,
  Pencil,
  RotateCcw,
} from "lucide-react";
import {
  archiveGoal,
  moveGoal,
  removeTransaction,
  reopenGoal,
  saveTransaction,
  type MoneyState,
} from "@/app/(app)/private/actions";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { Button, buttonClasses } from "@/components/ui/Button";
import { formatRsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OnHand } from "@/lib/data/money";
import type { GoalEntry, GoalLine, MoneyAccount } from "@/lib/types";
import { GoalForm } from "./GoalForm";

export type GoalsPanel = { mode: "new" } | { mode: "edit"; goal: GoalLine } | null;

/** Small caps label — panel captions and composer headings, same as Setup. */
const caps = "text-[10.5px] font-semibold uppercase tracking-wider text-faint";

/** A goal with no colour of its own falls back to the muted token, never a stray hex. */
const NO_COLOUR = "var(--color-muted)";

/** Bare controls inside a card, measured the same way Setup measures its own. */
const field =
  "rounded-ctrl border border-line bg-white/[0.035] px-2 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring";

const GOALS_HREF = "/private/goals";
const ARCHIVE_HREF = `${GOALS_HREF}?archived=1`;

/** The line beside a panel title: how many of the thing there are. */
function PanelMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11.5px] font-semibold whitespace-nowrap text-muted">{children}</span>
  );
}

const MS_DAY = 86_400_000;

/**
 * Whole days between two dates, read in UTC so the answer never depends on which
 * side of the wire it was computed. `created_at` arrives as a timestamp, so both
 * ends are cut back to a plain date first.
 */
function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / MS_DAY);
}

/** Average days in a month — only ever used to say what a month has to look like. */
const DAYS_PER_MONTH = 30.44;

/** With less history than this there is nothing honest to say about pace. */
const MIN_HISTORY_DAYS = 14;

/** A goal is open while it has not been closed — the same test the accounts apply. */
function isOpen(goal: GoalLine): boolean {
  return goal.completed_at === null;
}

type Reading = {
  /** null when no target is set — there is no progress then, only a running total. */
  pct: number | null;
  done: boolean;
  badge: { status: BadgeStatus; label: string } | null;
  /** The money sentence. */
  note: string;
  /** The phrase that follows the target date. Null when there is no date. */
  pace: string | null;
};

/**
 * Everything a card says about one goal, derived from the facts a goal actually
 * carries: what it holds now, what ever went in, the target, the target date and when
 * it started.
 *
 * The pace verdict is deliberately shy. It shows up only once there is a fortnight of
 * history and something actually put aside — before that, a rate worked out from two
 * days and one deposit would be a guess wearing a badge.
 */
function read(goal: GoalLine, today: string): Reading {
  const target = Number(goal.target_rsd) || 0;
  const saved = goal.saved;
  const date = goal.target_date;
  const daysLeft = date ? daysBetween(today, date) : null;

  if (target > 0 && saved >= target) {
    const over = saved - target;
    return {
      pct: 1,
      done: true,
      badge: { status: "ok", label: "Reached" },
      note:
        over > 0
          ? `The full ${formatRsd(target)} is there, and ${formatRsd(over)} over`
          : `The full ${formatRsd(target)} is there`,
      pace: date ? "the date you aimed at" : null,
    };
  }

  if (target <= 0) {
    return {
      pct: null,
      done: false,
      badge: null,
      note: "No target set — this only counts what goes in.",
      pace: date ? "no target amount to work towards" : null,
    };
  }

  const left = target - saved;
  const pct = Math.min(saved / target, 1);
  const note = `${formatRsd(left)} to go of ${formatRsd(target)}`;

  if (daysLeft === null) {
    return { pct, done: false, badge: null, note, pace: null };
  }

  if (daysLeft < 0) {
    const ago = -daysLeft;
    return {
      pct,
      done: false,
      badge: { status: "danger", label: "Date passed" },
      note,
      pace: `${ago} ${ago === 1 ? "day" : "days"} ago`,
    };
  }

  if (daysLeft === 0) {
    return {
      pct,
      done: false,
      badge: { status: "active", label: "Due today" },
      note,
      pace: "today",
    };
  }

  // What has to go in from here, said in whichever unit fits the time left.
  const pace =
    daysLeft >= 60
      ? `${formatRsd(Math.ceil(left / (daysLeft / DAYS_PER_MONTH)))} a month to make it`
      : daysLeft >= MIN_HISTORY_DAYS
        ? `${formatRsd(Math.ceil(left / (daysLeft / 7)))} a week to make it`
        : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;

  const elapsed = daysBetween(goal.created_at, today);
  const badge =
    elapsed !== null && elapsed >= MIN_HISTORY_DAYS && saved > 0
      ? saved / elapsed >= left / daysLeft
        ? { status: "ok" as const, label: "On track" }
        : { status: "active" as const, label: "Behind pace" }
      : null;

  return { pct, done: false, badge, note, pace };
}

/**
 * One movement, in the goal's own words. The account is named because that is the
 * question the run of deposits is usually asked to settle — which pocket it came from.
 */
function EntryRow({ entry, goalName }: { entry: GoalEntry; goalName: string }) {
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
          {out ? "−" : "+"} {formatRsd(entry.amount)}
        </span>
        <DeleteButton
          compact
          label={`Delete this ${out ? "withdrawal" : "deposit"}`}
          confirmText={`Remove ${formatRsd(entry.amount)} of ${entry.occurred_on} from ${goalName}? The entry leaves the ledger and every balance is worked out without it.`}
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
function GoalHistory({ goal }: { goal: GoalLine }) {
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
              · {formatRsd(goal.withdrawn)} taken back out
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
                ? `${deposits} deposits, ${formatRsd(goal.deposited)} in total. `
                : ""}
            Every one of these is an entry in Money.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The one deliberate act on this screen: money moving between an account and a goal.
 * It gets its own footer, its own caption and its own ground, so it never reads as one
 * more box in a row.
 *
 * Both directions live here, because taking money back out is the same decision made
 * the other way round — and hiding it somewhere else is what left a goal claiming
 * dinars that had already been spent.
 */
function MoveMoney({
  goal,
  accounts,
  done,
}: {
  goal: GoalLine;
  accounts: MoneyAccount[];
  done: boolean;
}) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(
    saveTransaction,
    undefined,
  );
  const [out, setOut] = useState(false);

  const canTakeOut = goal.saved > 0;
  const taking = out && canTakeOut;
  // The account this goal used last is the one it will almost certainly use again.
  const preferred = goal.lastAccountId ?? accounts[0]?.id ?? "";
  const only = accounts.length === 1 ? accounts[0] : null;

  // The amount is left uncontrolled on purpose: React empties an uncontrolled field
  // once its form action settles, so the box clears itself and the same figure cannot
  // go in twice by accident. Holding it in state was what kept the old amount sitting
  // there after a save.
  return (
    <form
      action={formAction}
      className="goal-move-panel border-t border-line-soft bg-white/[0.02] py-3 pr-4 pl-5"
    >
      <input type="hidden" name="kind" value={taking ? "withdraw" : "saving"} />
      <input type="hidden" name="goal_id" value={goal.id} />
      <input type="hidden" name="currency" value="RSD" />
      <input type="hidden" name="return_to" value="stay" />

      <div className="mb-2 flex items-center justify-between gap-2">
        {/* With nothing in the goal yet there is only one thing to do here, so the
            caption stays a caption rather than pretending to be a choice. */}
        {canTakeOut ? (
          <div className="goal-money-toggle flex min-w-0 items-center gap-1" role="group" aria-label={`Money direction for ${goal.name}`}>
            <button
              type="button"
              onClick={() => setOut(false)}
              aria-pressed={!taking}
              className={cn(
                "rounded-pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider transition-colors",
                taking ? "text-faint hover:text-muted" : "bg-active-bg text-gold-hi",
              )}
            >
              Put aside
            </button>
            <button
              type="button"
              onClick={() => setOut(true)}
              aria-pressed={taking}
              className={cn(
                "rounded-pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider transition-colors",
                taking ? "bg-active-bg text-gold-hi" : "text-faint hover:text-muted",
              )}
            >
              Take out
            </button>
          </div>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 shrink-0 text-gold" />
            <span className={cn(caps, "truncate")}>{done ? "Add more" : "Put money aside"}</span>
          </span>
        )}

        {only ? (
          <span className="min-w-0 truncate text-[11px] text-faint">
            {taking ? "back to" : "from"} {only.name}
          </span>
        ) : accounts.length === 0 ? (
          <span className="text-[11px] text-faint">no account yet</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {/* The amount and its currency are one control — the dinars are not a second question. */}
        <div className="flex min-w-0 flex-1 items-center rounded-ctrl border border-line bg-white/[0.035] focus-within:border-gold focus-within:shadow-ring">
          <input
            name="amount"
            inputMode="decimal"
            placeholder="0"
            aria-label={taking ? `Take money out of ${goal.name}` : `Add money to ${goal.name}`}
            className="mono min-w-0 flex-1 bg-transparent px-2.5 py-2 text-right text-[14px] text-ink placeholder:text-faint"
          />
          <span className="mono border-l border-line-soft px-2 py-2 text-[11.5px] font-semibold text-muted">
            RSD
          </span>
        </div>
        {/* Fixed width so "Adding…" does not shrink the control mid-submit. */}
        <Button
          type="submit"
          variant="secondary"
          className="money-premium-button w-24 shrink-0 px-2 py-2 text-[12.5px]"
          disabled={pending}
        >
          {pending ? "Saving…" : taking ? "Take out" : "Put aside"}
        </Button>
      </div>

      {only || accounts.length === 0 ? (
        <input type="hidden" name="account_id" value={only?.id ?? ""} />
      ) : (
        <select
          name="account_id"
          defaultValue={preferred}
          aria-label={taking ? "Account the money goes back to" : "Account the money comes off"}
          className={cn(field, "mt-2 w-full scheme-dark")}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id} className="bg-surface">
              {taking ? "Back to" : "From"} {a.name}
            </option>
          ))}
        </select>
      )}

      {taking && (
        <p className="mt-2 text-[11px] text-faint">
          Holds {formatRsd(goal.saved)}. Taking it out frees it to spend again.
        </p>
      )}

      {state?.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

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

function GoalCard({
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

/** One closed goal: what passed through it, and the two ways back. */
function ClosedRow({ goal }: { goal: GoalLine }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const target = Number(goal.target_rsd) || 0;
  // Reached means it actually held the whole amount at once, which is not the same as
  // the sum of everything that ever went in.
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
            <Badge status={reached ? "ok" : "draft"}>{reached ? "Reached" : "Closed"}</Badge>
          </div>
          <div className="mt-0.5 text-[11.5px] text-faint">
            <span className="mono">{formatRsd(goal.deposited)}</span> went in
            {target > 0 && (
              <>
                {" "}
                of <span className="mono">{formatRsd(target)}</span>
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

/** One figure of the reconciliation strip. The operator lives in the label. */
function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "info" | "danger";
}) {
  return (
    <div className="goal-figure bg-surface px-3 py-2.5">
      <div className={caps}>{label}</div>
      <div
        className={cn(
          "mono mt-1 text-[15px] font-semibold",
          tone === "info" ? "text-info" : tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {formatRsd(value)}
      </div>
    </div>
  );
}

/**
 * The whole picture, first: everything put aside against everything being aimed at,
 * with every goal's colour taking its own share of the bar — and then the three
 * figures that have to agree with every other screen. What is on the accounts, what
 * these goals have a claim on, and what is left to spend. They add up because the
 * middle one is read straight off the goals above it.
 */
function Overall({ goals, onHand }: { goals: GoalLine[]; onHand: OnHand }) {
  const targeted = goals.filter((g) => Number(g.target_rsd) > 0);
  const totalTarget = targeted.reduce((s, g) => s + Number(g.target_rsd), 0);
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  // Overshooting one goal must not pay for falling short on another, so each goal
  // contributes at most its own target to the bar.
  const towards = targeted.reduce((s, g) => s + Math.min(g.saved, Number(g.target_rsd)), 0);
  const reached = targeted.filter((g) => g.saved >= Number(g.target_rsd)).length;
  const untargeted = goals.length - targeted.length;
  const left = Math.max(totalTarget - towards, 0);
  const pct = totalTarget > 0 ? towards / totalTarget : null;
  const many = goals.length > 1;

  return (
    <Panel
      // With one goal the card below is already the whole picture, so the panel drops
      // back to the only thing the card cannot say: how this sits against the accounts.
      title={many ? "Put aside so far" : "Where this money is"}
      className="money-summary-panel goal-overall-panel"
      action={
        <PanelMeta>
          {goals.length} {goals.length === 1 ? "goal" : "goals"}
          {reached > 0 && ` · ${reached} reached`}
        </PanelMeta>
      }
    >
      <div className="px-4 py-4">
        {many && (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="mono text-[28px] font-semibold tracking-[-0.5px] text-ink">
                {formatRsd(totalSaved)}
              </span>
              {totalTarget > 0 && (
                <span className="text-[12.5px] text-muted">
                  of <span className="mono">{formatRsd(totalTarget)}</span> aimed at
                </span>
              )}
            </div>

            {pct === null ? (
              <p className="mt-2.5 text-[12px] text-muted">
                No targets set yet — put one on a goal and this turns into progress.
              </p>
            ) : (
              <>
                <div
                  aria-hidden="true"
                  className="mt-3 flex h-2.5 gap-px overflow-hidden rounded-pill bg-white/6"
                >
                  {targeted.map((g) => {
                    const share = (Math.min(g.saved, Number(g.target_rsd)) / totalTarget) * 100;
                    if (share <= 0) return null;
                    return (
                      <span
                        key={g.id}
                        className="money-progress-segment h-full shrink-0"
                        style={{
                          width: `${share}%`,
                          minWidth: "3px",
                          background: g.color ?? NO_COLOUR,
                        }}
                      />
                    );
                  })}
                </div>
                <p className="mt-2 text-[12px] text-muted">
                  {left === 0 ? (
                    "Every target reached."
                  ) : (
                    <>
                      {Math.min(Math.floor(pct * 100), 99)}% of the way there ·{" "}
                      <span className="mono">{formatRsd(left)}</span> still to find
                    </>
                  )}
                  {untargeted > 0 &&
                    ` · ${untargeted} ${untargeted === 1 ? "goal has" : "goals have"} no target`}
                </p>
              </>
            )}
          </>
        )}

        <div
          className={cn(
            "grid grid-cols-1 gap-px overflow-hidden rounded-ctrl border border-line-soft bg-line-soft min-[440px]:grid-cols-3",
            many && "mt-3.5",
          )}
        >
          <Figure label="On accounts" value={onHand.total} />
          <Figure label="− Set aside" value={onHand.reserved} tone="info" />
          <Figure
            label="= Free to spend"
            value={onHand.free}
            tone={onHand.free < 0 ? "danger" : undefined}
          />
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          Money put aside has not left the accounts — it is still there, it is just
          spoken for. Upcoming plans from what is free, so a goal can never be spent
          twice.
        </p>
      </div>
    </Panel>
  );
}

/** Nothing saved for yet — so the screen has to explain what a goal is for on its own. */
function NoGoals() {
  const steps = [
    "Name what the money is for, and set the amount you are aiming at.",
    "Put money aside against it — the dinars stay on the account, they just stop counting as free to spend.",
    "Give it a date and the goal tells you what each month has to look like to make it.",
    "Buy the thing, or change your mind: take the money back out, or close the goal and it lets go of what is left.",
  ];

  return (
    <Panel className="money-empty-panel">
      <EmptyState
        icon={PiggyBank}
        title="Nothing being saved for yet"
        description="A goal is a name, an amount and — if you know it — a date. A laptop, a deposit, three months of rent in reserve."
        action={
          <Link href={`${GOALS_HREF}?new=1`} className={buttonClasses("primary", "money-premium-button")}>
            New goal
          </Link>
        }
      />
      <div className="border-t border-line-soft px-5 py-4">
        <div className={caps}>How a goal works</div>
        <ol className="mt-2.5 space-y-2 text-[12.5px] text-muted">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-2.5">
              <span className="mono shrink-0 text-[11.5px] text-faint">{i + 1}</span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

export function GoalsView({
  goals,
  accounts,
  onHand,
  panel,
  customColors,
  showArchived,
}: {
  goals: GoalLine[];
  accounts: MoneyAccount[];
  onHand: OnHand;
  panel: GoalsPanel;
  customColors: string[];
  showArchived: boolean;
}) {
  const router = useRouter();
  const close = () => router.push(GOALS_HREF);

  // Read the same way Setup reads today — UTC on both sides, so nothing disagrees.
  const today = new Date().toISOString().slice(0, 10);

  // Open is measured by completed_at alone, never by the archive flag: a goal still
  // holding money back has to stay visible, whatever else has been done to it.
  const open = goals.filter(isOpen);
  const closed = goals.filter((g) => !isOpen(g) && !g.archived);
  const archived = goals.filter((g) => !isOpen(g) && g.archived);
  const openSaved = open.reduce((sum, goal) => sum + goal.saved, 0);
  const openTarget = open.reduce((sum, goal) => sum + Math.max(Number(goal.target_rsd) || 0, 0), 0);
  const reached = open.filter((goal) => Number(goal.target_rsd) > 0 && goal.saved >= Number(goal.target_rsd)).length;

  return (
    <div className="money-premium money-goals mx-auto max-w-220 space-y-5">
      <div className="money-page-head goals-page-head flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="money-page-kicker">Private wealth</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            Goals
          </h1>
          <p className="mt-1 max-w-md text-[13px] leading-5 text-muted">
            Give every saved dinar a destination and watch the distance close.
          </p>
        </div>
        <div className="goals-head-side">
          {goals.length > 0 && (
            <div className="goals-head-stats" aria-label="Goals summary">
              <span><small>Active</small><b>{open.length}</b></span>
              <span><small>Saved</small><b className="mono">{formatRsd(openSaved)}</b></span>
              <span><small>Target</small><b className="mono">{formatRsd(openTarget)}</b></span>
              <span className="goals-reached"><small>Reached</small><b>{reached}</b></span>
            </div>
          )}
          <Link href={`${GOALS_HREF}?new=1`} className={buttonClasses("primary", "money-premium-button shrink-0")}>
            <Plus className="h-4 w-4" />
            New goal
          </Link>
        </div>
      </div>

      {goals.length === 0 ? (
        <NoGoals />
      ) : (
        <>
          {open.length > 0 && <Overall goals={open} onHand={onHand} />}

          <div className="money-card-grid grid gap-3 sm:grid-cols-2">
            {open.map((goal, i) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                accounts={accounts}
                today={today}
                first={i === 0}
                last={i === open.length - 1}
                reorderable={open.length > 1}
              />
            ))}
          </div>

          {open.length === 0 && (
            <Panel className="goal-secondary-panel">
              <EmptyState
                icon={PiggyBank}
                title="Nothing being saved for right now"
                description="Every goal has been closed. Start another one, or reopen one below."
                action={
                  <Link href={`${GOALS_HREF}?new=1`} className={buttonClasses("primary", "money-premium-button")}>
                    New goal
                  </Link>
                }
              />
            </Panel>
          )}

          {closed.length > 0 && (
            <Panel
              className="goal-secondary-panel"
              title="Closed"
              action={
                <PanelMeta>
                  {closed.length} {closed.length === 1 ? "goal" : "goals"} · holding nothing back
                </PanelMeta>
              }
            >
              {closed.map((goal) => (
                <ClosedRow key={goal.id} goal={goal} />
              ))}
            </Panel>
          )}

          {archived.length > 0 &&
            (showArchived ? (
              <Panel
                className="goal-secondary-panel"
                title="Archived"
                action={
                  <Link href={GOALS_HREF} className="text-[12px] font-semibold text-gold-hi">
                    Hide
                  </Link>
                }
              >
                {archived.map((goal) => (
                  <ClosedRow key={goal.id} goal={goal} />
                ))}
              </Panel>
            ) : (
              <Link
                href={ARCHIVE_HREF}
                className="goal-archive-link flex items-center justify-center gap-1.5 rounded-card border border-line bg-surface px-4 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
              >
                <Archive className="h-3.5 w-3.5" />
                Show {archived.length} archived {archived.length === 1 ? "goal" : "goals"}
              </Link>
            ))}
        </>
      )}

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.mode === "edit" ? "Edit goal" : "New goal"}
      >
        <GoalForm
          goal={panel?.mode === "edit" ? panel.goal : undefined}
          accounts={accounts}
          customColors={customColors}
          onDone={close}
        />
      </SlideOver>
    </div>
  );
}
