"use client";

import { monthLabel } from "@/lib/money";
import type { ForecastLine } from "@/lib/data/money";
import { useMoney } from "@/lib/money/currency";

export type MonthGroup = {
  key: string;
  rows: ForecastLine[];
  expense: number;
  income: number;
  /** What the month sets aside rather than spends — counted apart, still deducted. */
  saving: number;
  /** Projected everyday spending — kept apart from the dated items on purpose. */
  everyday: number;
  /** The running balance after the last row of the month — where the month ends up. */
  closing: number;
};

/** The lines arrive sorted by date, so one pass is enough to cut them into months. */
export function byMonth(lines: ForecastLine[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const line of lines) {
    const key = line.on.slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        rows: [],
        expense: 0,
        income: 0,
        saving: 0,
        everyday: 0,
        closing: line.balance,
      };
      groups.push(group);
    }
    group.rows.push(line);
    if (line.source === "everyday") group.everyday += line.amount;
    else if (line.kind === "income") group.income += line.amount;
    else if (line.goal) group.saving += line.amount;
    else group.expense += line.amount;
    group.closing = line.balance;
  }
  return groups;
}

export function MonthHead({ group }: { group: MonthGroup }) {
  const { fmt } = useMoney();
  const dated = group.rows.filter((r) => r.source !== "everyday").length;

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line-soft bg-white/[0.02] px-4 py-2">
      <span className="text-[11.5px] font-semibold text-ink">
        {monthLabel(group.key)}
        <span className="ml-1.5 font-normal text-faint">
          {dated} {dated === 1 ? "item" : "items"}
        </span>
      </span>
      <span className="mono text-[11px] text-muted">
        −{fmt(group.expense)}
        {group.income > 0 && <> · +{fmt(group.income)}</>}
        {group.saving > 0 && <span className="text-held"> · {fmt(group.saving)} aside</span>}
        {group.everyday > 0 && <> · {fmt(group.everyday)} living</>}
        {" · "}
        <span className={group.closing < 0 ? "text-danger" : "text-faint"}>
          leaves {fmt(group.closing)}
        </span>
      </span>
    </div>
  );
}

/**
 * Nothing on the timeline is not the same as nothing to say. Either nothing has been
 * entered yet, or things exist and every one of them is out of this window for a reason
 * the data itself records — paused, finished, dated later, or variable with no past
 * bookings to estimate from. Say which, and nothing that is not in the data.
 */
