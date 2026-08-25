import Link from "next/link";
import { formatRsd, monthLabel } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BudgetLine } from "@/lib/types";
import { PaceRing } from "./PaceRing";
import type { Status, Totals } from "./status";

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
}: {
  month: string;
  totals: Totals;
  status: Status;
  verdict: string;
  showPace: boolean;
  untracked: BudgetLine[];
  entriesHref: string;
}) {
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

      {showPace && (
        <p className="budget-pace-note">
          <i aria-hidden="true" />
          {totals.pacePct}% of {monthName} has gone
        </p>
      )}

      <p className="budget-verdict">{verdict}</p>

      <div className="budget-figures">
        <Figure label="Spent" value={formatRsd(totals.spent)} />
        <Figure label="Limits" value={formatRsd(totals.limit)} />
        <Figure
          label={totals.left > 0 ? "Left" : "Over"}
          value={formatRsd(totals.left > 0 ? totals.left : totals.spent - totals.limit)}
          tone={totals.left > 0 ? "ok" : "danger"}
        />
        {showPace && (
          <Figure
            label="At this rate"
            hint={`by the end of ${monthName}`}
            value={formatRsd(totals.projected)}
            tone={totals.overshoot > 0 ? "danger" : "ok"}
          />
        )}
      </div>

      {untracked.length > 0 && (
        <div className="budget-untracked">
          <span className="mono budget-untracked-amount">{formatRsd(untrackedTotal)}</span>
          <span>
            went to {untracked.length === 1 ? "one category" : `${untracked.length} categories`} with
            no limit — {untracked.map((l) => l.category.name).join(", ")}. None of it is in the
            figures above.
          </span>
        </div>
      )}

      <Link href={entriesHref} className="budget-entries-link">
        See the entries behind these figures
      </Link>
    </aside>
  );
}
