"use client";

/**
 * The toolbar over a long list of rules: what to sort by, and the two things worth
 * narrowing on — what a rule is for, and which account it comes off.
 *
 * It only appears once there are enough rules for scanning to be work; below that
 * the list is the toolbar.
 */

import type { Rates } from "@/lib/money";
import type { RecurringRow } from "@/lib/types";
import { monthlyFor } from "./rules-reading";

export const FILTERS_FROM = 6;

export type SortKey = "due" | "cost" | "name";

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "due", label: "Next due first" },
  { value: "cost", label: "Costs most first" },
  { value: "name", label: "Name A–Z" },
];

export const EVERY_FILTER: { value: string; label: string }[] = [
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

/**
 * What a rule is *for*, as one value: a category, a goal, or neither.
 *
 * A standing order into a goal carries no category — the row puts the goal's name
 * where the category would be — so both live in one select, keyed apart by prefix so
 * a goal and a category sharing a name stay two different filters.
 */
export function purposeKey(item: RecurringRow): string {
  if (item.goal) return `g:${item.goal.name}`;
  return item.category ? `c:${item.category.name}` : "none";
}

export function purposeLabel(item: RecurringRow): string {
  if (item.goal) return item.goal.name;
  return item.category?.name ?? "No category";
}

export function accountKey(item: RecurringRow): string {
  return item.account ? `a:${item.account.name}` : "none";
}

export function accountLabel(item: RecurringRow): string {
  return item.account?.name ?? "No account";
}

/**
 * The values a select can honestly offer: the ones this register actually contains.
 * Offering "Subscriptions" to someone who has no subscription rule is a filter that
 * can only ever return nothing.
 */
export function optionsFrom(
  items: RecurringRow[],
  key: (item: RecurringRow) => string,
  label: (item: RecurringRow) => string,
): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const item of items) if (!seen.has(key(item))) seen.set(key(item), label(item));
  return [...seen]
    .map(([value, text]) => ({ value, label: text }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * How much a rule takes off the account in an average month, for the "costs most"
 * sort. Money coming in is not a cost, so it is ranked by the negative of its figure:
 * the bills descend from the top and income settles at the far end, biggest last.
 * Null — a variable rule with no set amount — has no rank and sinks below both.
 */
export function costRank(item: RecurringRow, rates: Rates): number | null {
  const monthly = monthlyFor(item, rates);
  if (monthly === null) return null;
  return item.kind === "income" ? -monthly : monthly;
}

export const control =
  "rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-[12.5px] text-ink scheme-dark focus:border-gold focus:shadow-ring";

export function Filter({
  value,
  onChange,
  label,
  all,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  all: string;
  options: { value: string; label: string }[];
}) {
  // One real choice is not a choice — a select offering "All accounts" and the single
  // account every rule already uses can only ever be a no-op.
  if (options.length < 2) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={control}
    >
      <option value="" className="bg-surface">
        {all}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-surface">
          {o.label}
        </option>
      ))}
    </select>
  );
}

