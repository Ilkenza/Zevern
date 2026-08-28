"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CornerUpLeft, Target } from "lucide-react";
import { saveBudgets, type MoneyState } from "@/app/(app)/private/actions";
import { Panel } from "@/components/ui/Panel";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { daysLeftInMonth, monthLabel, monthProgress, shiftMonth, shortMonthLabel } from "@/lib/money";
import type { BudgetLine } from "@/lib/types";
import { SummaryPanel } from "./budgets/SummaryPanel";
import { CategoryRow } from "./budgets/CategoryRow";
import { remedyFor, totalsOf, type Status } from "./budgets/status";
import { useMoney } from "@/lib/money/currency";
import { fromRsd } from "@/lib/money/display";

/**
 * The state of the whole month, in the same vocabulary a single category uses. The
 * ring, the verdict and every row are then coloured by one function rather than three,
 * so the ring can never be green while the sentence under it says you are over.
 */
function overallStatus(
  limit: number,
  spent: number,
  used: number,
  pacePct: number,
): Status {
  if (limit <= 0) return "unset";
  if (spent > limit) return "over";
  if (used > pacePct + 5) return "ahead";
  return "ontrack";
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
  const { fmt, code, display } = useMoney();
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
  /*
    Limits are stored in dinars and typed in whatever currency this screen is read in.
    The conversion happens here, once, on the way into the fields — and again on the
    server on the way back out — so the number in the box is always the same kind of
    number as the spending printed beside it.
  */
  const initial = useMemo(
    () =>
      Object.fromEntries(
        lines.map((l) => [
          l.category.id,
          l.limit > 0 ? String(Math.round(fromRsd(l.limit, display))) : "",
        ]),
      ) as Record<string, string>,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature is `lines`, compared by value
    [signature, display],
  );

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [baseline, setBaseline] = useState(signature);
  if (baseline !== signature) {
    setBaseline(signature);
    setValues(initial);
  }

  const changed = Object.keys(initial).filter((id) => (values[id] ?? "") !== initial[id]);

  const totals = totalsOf(lines, pace, isCurrentMonth);
  const status = overallStatus(totals.limit, totals.spent, totals.used, totals.pacePct);

  /*
    Only offered when the month is actually heading over. A lever attached to a month
    that is going to be fine is not advice, it is a screen that cannot stop talking.
  */
  const remedy =
    isCurrentMonth && totals.overshoot > 0
      ? remedyFor(lines, pace, daysLeftInMonth(month))
      : null;

  // Spending in categories with no ceiling at all — the part of the month no budget is
  // watching, and usually where the surprise lives.
  const untracked = lines.filter((l) => l.limit <= 0 && l.spent > 0);

  // Categories with a limit come first: they are the ones this screen is about, and a
  // run of unused categories at the top pushes the actual budget below the fold.
  const ordered = useMemo(() => {
    const withLimit = lines.filter((l) => l.limit > 0);
    const rest = lines.filter((l) => l.limit <= 0);
    return [...withLimit, ...rest];
  }, [lines]);
  const tracked = ordered.filter((l) => l.limit > 0).length;
  const monthName = monthLabel(month).split(" ")[0];

  const verdict = (() => {
    if (totals.limit === 0) {
      return "No category has a limit. Your spending is still shown below.";
    }
    if (!isCurrentMonth) {
      return totals.spent > totals.limit
        ? `${monthLabel(month)} finished ${fmt(totals.spent - totals.limit)} over.`
        : `${monthLabel(month)} finished ${fmt(totals.limit - totals.spent)} under.`;
    }
    if (totals.used > totals.pacePct + 5) {
      return totals.overshoot > 0
        ? `Spending is running ahead of plan. At this pace, you’ll finish ${monthName} ${fmt(totals.overshoot)} over your limits.`
        : `Spending is ahead of the month’s pace, but you’re still projected to finish ${monthName} within your limits.`;
    }
    if (totals.used < totals.pacePct - 5) {
      return `You’re comfortably within your limits. At this pace, you’ll finish ${monthName} with ${fmt(Math.max(totals.limit - totals.projected, 0))} still available.`;
    }
    return `Spending is on pace for ${monthName}.`;
  })();

  return (
    <div className="money-premium money-budgets mx-auto max-w-300">
      <div className="money-page-head budget-head">
        <div className="min-w-0">
          <span className="money-page-kicker">Monthly control</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            Budgets
          </h1>
          <p className="mt-1 max-w-md text-[13px] leading-5 text-muted">
            A limit applies to every month. {monthLabel(month)} is what it is being
            measured against.
          </p>
        </div>

        <div className="money-month-nav budget-head-nav">
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
        <form action={formAction} className="budget-layout">
          {/* What the numbers in the boxes are denominated in. */}
          <input type="hidden" name="currency" value={code} />
          <SummaryPanel
            month={month}
            totals={totals}
            status={status}
            verdict={verdict}
            showPace={isCurrentMonth}
            untracked={untracked}
            entriesHref={`/private/money?month=${month}`}
            remedy={remedy}
          />

          <div className="budget-list">
            <div className="budget-list-head">
              <h2 className="budget-list-title">Categories</h2>
              <span className="budget-list-meta">
                {tracked} with limits · {lines.length - tracked} without limits
              </span>
            </div>

            <div className="budget-cards">
              {ordered.map((line, index) => (
                <CategoryRow
                  key={line.category.id}
                  line={line}
                  pace={pace}
                  value={values[line.category.id] ?? ""}
                  onChange={(next) =>
                    setValues((v) => ({ ...v, [line.category.id]: next }))
                  }
                  // The ladder is capped in CSS; this only decides the rung.
                  style={{ animationDelay: `${90 + index * 45}ms` }}
                />
              ))}
            </div>

            {state?.error && (
              <p className="budget-note is-error">{state.error}</p>
            )}
            {state?.ok && changed.length === 0 && (
              <p className="budget-note is-ok">Limits saved.</p>
            )}
            <p className="budget-note">
              Leave a limit empty to track a category without capping it.
            </p>
          </div>

          {/*
            The save bar exists only once there is something to save — it is not hidden
            but absent, so it takes up no room and no tab stop on a page you are only
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
