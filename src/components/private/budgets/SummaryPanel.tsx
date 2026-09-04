"use client";

import Link from "next/link";
import { monthLabel } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BudgetLine } from "@/lib/types";
import { PaceRing } from "./PaceRing";
import type { Remedy, Status, Totals } from "./status";
import { useMoney } from "@/lib/money/currency";

/** One line of the read-out under the ring. The word carries it; colour only agrees. */
function Figure({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "danger" | "gold" | "ok";
  hint?: string;
}) {
  return (
    <div className="budget-figure-row">
      <span className="budget-figure-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className={cn("mono budget-figure-value", tone && `is-${tone}`)}>{value}</span>
    </div>
  );
}

/**
 * The month, decided.
 *
 * It is a column of its own rather than a band across the top, and on a wide screen it
 * stays put while the categories scroll past it. That is the point of moving it: the
 * question being asked of every row — "is this the one putting me over?" — can only be
 * answered against the total, and the total used to scroll away as soon as you started
 * reading the rows.
 */
export function SummaryPanel({
  month,
  totals,
  status,
  verdict,
  showPace,
  untracked,
  entriesHref,
  remedy,
}: {
  month: string;
  totals: Totals;
  status: Status;
  verdict: string;
  showPace: boolean;
  untracked: BudgetLine[];
  entriesHref: string;
  /** The one move worth making, when the month is heading over. */
  remedy: Remedy | null;
}) {
  const { fmt } = useMoney();
  const untrackedTotal = untracked.reduce((s, l) => s + l.spent, 0);
  const monthName = monthLabel(month).split(" ")[0];

  return (
    <aside className="budget-summary">
      <div className="budget-summary-head">
        <span className="money-page-kicker">{monthLabel(month)}</span>
      </div>

      <PaceRing
        used={totals.used}
        pacePct={totals.pacePct}
        status={status}
        showPace={showPace}
        caption="of the budget used"
      />

      {/*
        The tick no longer sits on the calendar, so the note has to say what it does sit
        on — otherwise a mark at 84% on the 20th of a 31-day month looks like a bug.
        When there is nothing dated in the month the two figures are the same, and the
        second half would be a sentence explaining that nothing happened.
      */}
      {showPace && (
        <p className="budget-pace-note">
          <i aria-hidden="true" />
          {totals.pacePct === totals.calendarPct ? (
            <>
              Pace marker · {totals.calendarPct}% of {monthName} has passed
            </>
          ) : (
            <>
              Pace marker · {totals.pacePct}% of the budget is due by now ·{" "}
              {totals.calendarPct}% of {monthName} has passed
            </>
          )}
        </p>
      )}

      <p className="budget-verdict">{verdict}</p>

      {remedy && (
        <p className="budget-remedy">
          <b>{remedy.category}</b>{" "}
          {remedy.room > 0 ? (
            <>
              is {fmt(remedy.gap)} of it.{" "}
              {/* Purchases, not weeks, where the money leaves in lumps — see `remedyFor`. */}
              {remedy.buys !== null
                ? `${remedy.buys === 1 ? "One" : remedy.buys} more ${
                    remedy.buys === 1 ? "buy" : "buys"
                  } of ${fmt(remedy.typicalBuy)}`
                : `${fmt(remedy.perWeek)} a week`}{" "}
              for the rest of {monthName} keeps it inside.
            </>
          ) : (
            <>is {fmt(remedy.gap)} of it, and its limit is already spent.</>
          )}
        </p>
      )}

      <div className="budget-figures">
        <Figure label="Spent" value={fmt(totals.spent)} />
        <Figure label="Limits" value={fmt(totals.limit)} />
        <Figure
          label={totals.left > 0 ? "Left" : "Over"}
          value={fmt(totals.left > 0 ? totals.left : totals.spent - totals.limit)}
          tone={totals.left > 0 ? "ok" : "danger"}
        />
        {showPace && (
          <Figure
            label={totals.overshoot > 0 ? "Projected over" : "Projected left"}
            hint={`at the end of ${monthName}`}
            value={fmt(totals.overshoot > 0 ? totals.overshoot : -totals.overshoot)}
            tone={totals.overshoot > 0 ? "danger" : "ok"}
          />
        )}
      </div>

      {untracked.length > 0 && (
        <div className="budget-untracked">
          <span className="mono budget-untracked-amount">
            {fmt(untrackedTotal)} spent without limits
          </span>
          <span>
            Across {untracked.length === 1 ? "one category" : `${untracked.length} categories`} without
            limits — {untracked.map((l) => l.category.name).join(", ")}. This spending is not included
            in the totals above.
          </span>
        </div>
      )}

      <Link href={entriesHref} className="budget-entries-link">
        See the entries behind these figures
      </Link>
    </aside>
  );
}
