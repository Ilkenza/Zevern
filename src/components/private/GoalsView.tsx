"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PiggyBank, Plus, Pencil } from "lucide-react";
import { saveTransaction, type MoneyState } from "@/app/(app)/private/actions";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, buttonClasses } from "@/components/ui/Button";
import { formatRsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { GoalLine, MoneyAccount, MoneyGoal } from "@/lib/types";
import { GoalForm } from "./GoalForm";

export type GoalsPanel = { mode: "new" } | { mode: "edit"; goal: MoneyGoal } | null;

/** Small caps label — panel captions and composer headings, same as Setup. */
const caps = "text-[10.5px] font-semibold uppercase tracking-wider text-faint";

/** A goal with no colour of its own falls back to the muted token, never a stray hex. */
const NO_COLOUR = "var(--color-muted)";

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
 * Everything a card says about one goal, derived from the four facts a goal actually
 * carries: what is saved, the target, the target date and when it started.
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
 * The one deliberate act on this screen: money leaving an account and landing on a
 * goal. It gets its own footer, its own caption and its own ground, so it never reads
 * as one more box in a row.
 */
function AddToGoal({
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
  const from = accounts[0]?.name ?? null;

  // The amount is left uncontrolled on purpose: React empties an uncontrolled field
  // once its form action settles, so the box clears itself and the same figure cannot
  // go in twice by accident. Holding it in state was what kept the old amount sitting
  // there after a save.
  return (
    <form action={formAction} className="border-t border-line-soft bg-white/[0.02] py-3 pr-4 pl-5">
      <input type="hidden" name="kind" value="saving" />
      <input type="hidden" name="goal_id" value={goal.id} />
      <input type="hidden" name="currency" value="RSD" />
      <input type="hidden" name="return_to" value="stay" />
      <input type="hidden" name="account_id" value={accounts[0]?.id ?? ""} />

      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <Plus className="h-3.5 w-3.5 shrink-0 text-gold" />
          <span className={cn(caps, "truncate")}>{done ? "Add more" : "Put money aside"}</span>
        </span>
        <span className="min-w-0 truncate text-[11px] text-faint">
          {from ? `from ${from}` : "no account yet"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* The amount and its currency are one control — the dinars are not a second question. */}
        <div className="flex min-w-0 flex-1 items-center rounded-ctrl border border-line bg-white/[0.035] focus-within:border-gold focus-within:shadow-ring">
          <input
            name="amount"
            inputMode="decimal"
            placeholder="0"
            aria-label={`Add money to ${goal.name}`}
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
          className="w-24 shrink-0 px-2 py-2 text-[12.5px]"
          disabled={pending}
        >
          {pending ? "Adding…" : "Put aside"}
        </Button>
      </div>

      {state?.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

function GoalCard({
  goal,
  accounts,
  today,
}: {
  goal: GoalLine;
  accounts: MoneyAccount[];
  today: string;
}) {
  const r = read(goal, today);
  const colour = goal.color ?? NO_COLOUR;
  // Rounded down, and capped at 99 until the target is actually met — a goal one
  // dinar short should never claim to be finished.
  const shown = r.pct === null ? null : r.done ? 100 : Math.min(Math.floor(r.pct * 100), 99);

  return (
    <article
      className={cn(
        "money-card-premium goal-card-premium relative flex flex-col overflow-hidden rounded-card border",
        r.done ? "border-ok/35 bg-ok-bg" : "border-line bg-surface",
      )}
    >
      {/* The goal's own colour, down the whole edge — its identity in the grid. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: colour }}
      />

      <div className="flex-1 py-3.5 pr-4 pl-5">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{goal.name}</h3>
          <Link
            href={`/private/goals?edit=${goal.id}`}
            aria-label={`Edit ${goal.name}`}
            title={`Edit ${goal.name}`}
            className="-mt-1 -mr-1.5 shrink-0 rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
          >
            <Pencil className="h-3.75 w-3.75" />
          </Link>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
          <span className="mono text-[21px] font-semibold tracking-[-0.5px] text-ink">
            {formatRsd(goal.saved)}
          </span>
          {r.badge && <Badge status={r.badge.status}>{r.badge.label}</Badge>}
        </div>

        {r.pct !== null && shown !== null && (
          <div className="mt-2.5 flex items-center gap-2.5">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={shown}
              aria-label={`${goal.name} progress`}
              className="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-white/6"
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

        <p className="mt-2 text-[12px] text-muted">{r.note}</p>
        {goal.target_date && r.pace && (
          <p className="mt-0.5 text-[11.5px] text-faint">
            <span className="mono">{goal.target_date}</span> · {r.pace}
          </p>
        )}
      </div>

      <AddToGoal goal={goal} accounts={accounts} done={r.done} />
    </article>
  );
}

/**
 * The whole picture, first: everything put aside against everything being aimed at,
 * with every goal's colour taking its own share of the bar. Skipped when there is a
 * single goal, because then the card below already is the whole picture.
 */
function Overall({ goals }: { goals: GoalLine[] }) {
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

  return (
    <Panel
      title="Put aside so far"
      className="money-summary-panel"
      action={
        <PanelMeta>
          {goals.length} {goals.length === 1 ? "goal" : "goals"}
          {reached > 0 && ` · ${reached} reached`}
        </PanelMeta>
      }
    >
      <div className="px-4 py-4">
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
      </div>
    </Panel>
  );
}

/** Nothing saved for yet — so the screen has to explain what a goal is for on its own. */
function NoGoals() {
  const steps = [
    "Name what the money is for, and set the amount you are aiming at.",
    "Put money aside against it — that comes off the account it came from and lands here.",
    "Give it a date and the goal tells you what each month has to look like to make it.",
  ];

  return (
    <Panel className="money-empty-panel">
      <EmptyState
        icon={PiggyBank}
        title="Nothing being saved for yet"
        description="A goal is a name, an amount and — if you know it — a date. A laptop, a deposit, three months of rent in reserve."
        action={
          <Link href="/private/goals?new=1" className={buttonClasses("primary")}>
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
  panel,
  customColors,
}: {
  goals: GoalLine[];
  accounts: MoneyAccount[];
  panel: GoalsPanel;
  customColors: string[];
}) {
  const router = useRouter();
  const close = () => router.push("/private/goals");

  // Read the same way Setup reads today — UTC on both sides, so nothing disagrees.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="money-premium money-goals mx-auto max-w-220 space-y-5">
      <div className="money-page-head flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="money-page-kicker">Private wealth</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            Goals
          </h1>
          <p className="mt-1 max-w-md text-[13px] leading-5 text-muted">
            Give every saved dinar a destination and watch the distance close.
          </p>
        </div>
        <Link href="/private/goals?new=1" className={buttonClasses("primary", "money-premium-button shrink-0")}>
          <Plus className="h-4 w-4" />
          New goal
        </Link>
      </div>

      {goals.length === 0 ? (
        <NoGoals />
      ) : (
        <>
          {goals.length > 1 && <Overall goals={goals} />}
          <div className="money-card-grid grid gap-3 sm:grid-cols-2">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} accounts={accounts} today={today} />
            ))}
          </div>
        </>
      )}

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.mode === "edit" ? "Edit goal" : "New goal"}
      >
        <GoalForm
          goal={panel?.mode === "edit" ? panel.goal : undefined}
          customColors={customColors}
        />
      </SlideOver>
    </div>
  );
}
