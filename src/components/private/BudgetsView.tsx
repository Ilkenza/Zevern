"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CornerUpLeft, Target, Wand2 } from "lucide-react";
import { saveBudgets, type MoneyState } from "@/app/(app)/private/actions";
import { Panel } from "@/components/ui/Panel";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  formatRsd,
  monthLabel,
  monthProgress,
  shiftMonth,
  shortMonthLabel,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BudgetLine } from "@/lib/types";

type Status = "over" | "ahead" | "ontrack" | "untracked" | "unset";

/**
 * Where a category stands, in one word.
 *
 * "Ahead" is the state a plain percentage hides: 60% of the grocery budget spent is
 * fine on the 20th and a warning on the 8th. Pace is what separates those two, which
 * is why the comparison is against how much of the month has gone rather than against
 * the limit alone.
 */
function statusOf(line: BudgetLine, pace: number): Status {
  if (line.limit <= 0) return line.spent > 0 ? "untracked" : "unset";
  if (line.spent > line.limit) return "over";
  if (line.spent / line.limit > pace + 0.15) return "ahead";
  return "ontrack";
}

const STATUS_LABEL: Record<Status, string> = {
  over: "Over",
  ahead: "Ahead of pace",
  ontrack: "On track",
  untracked: "No limit",
  unset: "Unused",
};

const BAR_TONE: Record<Status, string> = {
  over: "bg-danger",
  ahead: "bg-gold",
  ontrack: "bg-ok",
  untracked: "bg-white/15",
  unset: "bg-white/10",
};

/** Digits only — a limit is whole dinars, and this makes an unparseable one impossible. */
function clean(value: string): string {
  return value.replace(/\D/g, "").slice(0, 12);
}

export function BudgetsView({
  month,
  currentMonth,
  lines,
}: {
  month: string;
  /** Decided on the server, so the client never disagrees about which month is now. */
  currentMonth: string;
  lines: BudgetLine[];
}) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveBudgets, undefined);
  const pace = monthProgress(month);
  const isCurrentMonth = month === currentMonth;
  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  /*
    The fields are controlled, so the suggestion buttons can fill them and the save bar
    can tell what has moved. That needs a baseline, and the baseline has to follow the
    server: after a save, what came back is the new "unchanged".

    Tracking a signature of the saved limits rather than the props object is what keeps
    that honest. Browsing to another month does not touch the limits — they apply to
    every month — so it does not throw away edits in progress either.
  */
  const signature = lines.map((l) => `${l.category.id}:${l.limit}`).join("|");
  const initial = useMemo(
    () =>
      Object.fromEntries(
        lines.map((l) => [l.category.id, l.limit > 0 ? String(l.limit) : ""]),
      ) as Record<string, string>,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature is `lines`, compared by value
    [signature],
  );

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [baseline, setBaseline] = useState(signature);
  if (baseline !== signature) {
    setBaseline(signature);
    setValues(initial);
  }

  const changed = Object.keys(initial).filter((id) => (values[id] ?? "") !== initial[id]);

  const totalLimit = lines.reduce((s, l) => s + l.limit, 0);
  const totalSpent = lines.reduce((s, l) => s + l.spent, 0);
  const totalUsed = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;
  const pacePct = Math.round(pace * 100);

  // Spending in categories with no ceiling at all — the part of the month no budget is
  // watching, and usually where the surprise lives.
  const untracked = lines.filter((l) => l.limit <= 0 && l.spent > 0);
  const untrackedTotal = untracked.reduce((s, l) => s + l.spent, 0);

  // Where the month lands at today's rate. Only meaningful while it is still running —
  // a finished month has already landed wherever it landed.
  const projected = pace > 0 && isCurrentMonth ? Math.round(totalSpent / pace) : totalSpent;
  const overshoot = projected - totalLimit;

  const verdict = (() => {
    if (totalLimit === 0) return "Set a limit on a category and its pace shows up here.";
    if (!isCurrentMonth) {
      return totalSpent > totalLimit
        ? `${monthLabel(month)} finished ${formatRsd(totalSpent - totalLimit)} over.`
        : `${monthLabel(month)} finished ${formatRsd(totalLimit - totalSpent)} under.`;
    }
    if (totalUsed > pacePct + 5) {
      return overshoot > 0
        ? `${totalUsed - pacePct} points ahead of the month — at this rate you finish ${formatRsd(overshoot)} over.`
        : `${totalUsed - pacePct} points ahead of the month, but still inside the limits.`;
    }
    if (totalUsed < pacePct - 5) {
      return `${pacePct - totalUsed} points behind the month — ${formatRsd(Math.max(totalLimit - projected, 0))} of slack at this rate.`;
    }
    return "Right on pace for the month.";
  })();

  return (
    <div className="money-premium money-budgets mx-auto max-w-220">
      <div className="money-page-head mb-5 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="money-page-kicker">Monthly control</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            Budgets
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            A limit applies to every month. {monthLabel(month)} is what it is being
            measured against.
          </p>
          <div className="money-month-nav mt-3">
            <Link
              href={`/private/budgets?month=${prevMonth}`}
              aria-label={`Go to ${monthLabel(prevMonth)}`}
              className="money-month-arrow"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{shortMonthLabel(prevMonth, month)}</span>
            </Link>
            <Link
              href={`/private/budgets?month=${nextMonth}`}
              aria-label={`Go to ${monthLabel(nextMonth)}`}
              className="money-month-arrow"
            >
              <span>{shortMonthLabel(nextMonth, month)}</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
            {!isCurrentMonth && (
              <Link href="/private/budgets" className="money-month-back">
                <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />
                This month
              </Link>
            )}
          </div>
        </div>
        <Link
          href={`/private/money?month=${month}`}
          className={buttonClasses("secondary", "money-premium-button border")}
        >
          See entries
        </Link>
      </div>

      {lines.length === 0 ? (
        <Panel className="money-empty-panel">
          <EmptyState
            icon={Target}
            title="No categories yet"
            description="Create your categories first — budgets hang off them."
            action={
              <Link
                href="/private/setup"
                className={buttonClasses("primary", "money-premium-button")}
              >
                Go to Setup
              </Link>
            }
          />
        </Panel>
      ) : (
        <form action={formAction}>
          <Panel className="money-summary-panel budget-panel-premium">
            {totalLimit > 0 && (
              <div className="budget-overview border-b border-line-soft px-4 py-4">
                <div className="budget-verdict">
                  <div className="budget-verdict-main">
                    <span className="money-page-kicker">Budget used</span>
                    <p className="mono budget-figure">{totalUsed}%</p>
                    <p className="budget-verdict-text">{verdict}</p>
                  </div>
                  <p className="budget-verdict-meta">
                    <span className="mono">
                      {formatRsd(totalSpent)} of {formatRsd(totalLimit)}
                    </span>
                    <span className="mono">
                      {formatRsd(Math.max(totalLimit - totalSpent, 0))} available
                    </span>
                  </p>
                </div>

                {/*
                  The tick is where the month is. A bar on its own only says how much has
                  gone; the tick is what makes it say whether that is too much yet.
                */}
                <div className="budget-track">
                  <div
                    className={cn(
                      "money-progress-fill budget-fill",
                      totalSpent > totalLimit
                        ? "bg-danger"
                        : totalUsed > pacePct + 5
                          ? "bg-gold"
                          : "bg-ok",
                    )}
                    style={{ width: `${Math.min(totalUsed, 100)}%` }}
                  />
                  {isCurrentMonth && (
                    <span
                      className="budget-pace"
                      style={{ left: `${Math.min(pacePct, 100)}%` }}
                      aria-hidden
                    />
                  )}
                </div>
                {isCurrentMonth && (
                  <p className="budget-pace-legend">
                    <i /> {pacePct}% of {monthLabel(month).split(" ")[0]} has gone
                  </p>
                )}
              </div>
            )}

            {untracked.length > 0 && (
              <div className="budget-untracked border-b border-line-soft px-4 py-3">
                <span className="mono budget-untracked-amount">{formatRsd(untrackedTotal)}</span>{" "}
                went to {untracked.length === 1 ? "a category" : `${untracked.length} categories`} with
                no limit — {untracked.map((l) => l.category.name).join(", ")}.
              </div>
            )}

            <div className="budget-rows">
              {lines.map((line, index) => {
                const status = statusOf(line, pace);
                const used = line.limit > 0 ? Math.min(line.spent / line.limit, 1) : 0;
                const left = line.limit - line.spent;
                const value = values[line.category.id] ?? "";
                const suggest = line.typical > 0 && String(line.typical) !== value;

                return (
                  <div
                    key={line.category.id}
                    className={cn("budget-row-premium budget-row", `budget-is-${status}`)}
                    style={{ animationDelay: `${150 + index * 55}ms` }}
                  >
                    <div className="budget-row-main">
                      <span
                        className="budget-dot"
                        style={{ background: line.category.color ?? "#565c6b" }}
                      />
                      <span className="budget-name">{line.category.name}</span>
                      <span className={cn("budget-status", `budget-status-${status}`)}>
                        {STATUS_LABEL[status]}
                      </span>
                      <span className="mono budget-spent">{formatRsd(line.spent)}</span>
                      <span className="budget-of">of</span>
                      <input
                        name={`limit_${line.category.id}`}
                        value={value}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [line.category.id]: clean(e.target.value) }))
                        }
                        inputMode="numeric"
                        placeholder="no limit"
                        aria-label={`Monthly limit for ${line.category.name}`}
                        className="budget-input"
                      />
                    </div>

                    {line.limit > 0 && (
                      <div className="budget-row-bar">
                        <div className="budget-track budget-track-sm">
                          <div
                            className={cn("money-progress-fill budget-fill", BAR_TONE[status])}
                            style={{ width: `${used * 100}%` }}
                          />
                          {isCurrentMonth && (
                            <span
                              className="budget-pace budget-pace-sm"
                              style={{ left: `${Math.min(pacePct, 100)}%` }}
                              aria-hidden
                            />
                          )}
                        </div>
                        <span className={cn("mono budget-left", left < 0 && "text-danger")}>
                          {left < 0 ? `${formatRsd(-left)} over` : `${formatRsd(left)} left`}
                        </span>
                      </div>
                    )}

                    {/*
                      A blank field is a decision nobody has the numbers for. This one
                      does: it is what the last six months actually cost.
                    */}
                    {suggest && (
                      <button
                        type="button"
                        className="budget-suggest"
                        onClick={() =>
                          setValues((v) => ({ ...v, [line.category.id]: String(line.typical) }))
                        }
                      >
                        <Wand2 className="h-3 w-3" aria-hidden />
                        A normal month is {formatRsd(line.typical)} — use it
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          {state?.error && (
            <p className="mt-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
              {state.error}
            </p>
          )}
          {state?.ok && changed.length === 0 && (
            <p className="mt-3 text-[12px] text-ok">Limits saved.</p>
          )}
          <p className="mt-3 text-[12px] text-muted">
            Leave a limit empty to track a category without capping it.
          </p>

          {/*
            The save bar exists only once there is something to save — it is not hidden
            but present, so it takes up no room and no tab stop on a page you are only
            reading. After a save the server's numbers become the baseline again and it
            leaves on its own.
          */}
          {changed.length > 0 && (
            <div className="budget-savebar">
              <span className="budget-savebar-text">
                {changed.length} {changed.length === 1 ? "limit" : "limits"} changed
              </span>
              <button
                type="button"
                className="budget-savebar-undo"
                onClick={() => setValues(initial)}
              >
                Undo
              </button>
              <Button
                type="submit"
                variant="primary"
                className="money-premium-button"
                disabled={pending}
              >
                {pending ? "Saving…" : "Save limits"}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
