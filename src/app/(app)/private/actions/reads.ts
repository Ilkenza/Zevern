"use server";

import type { BudgetEntry,CategoryHistory } from "@/lib/data/money";
import {
getBudgetEntries,
getCategoryHistory
} from "@/lib/data/money";

export async function loadCategoryHistory(categoryId: string): Promise<CategoryHistory | null> {
  const id = String(categoryId ?? "").trim();
  if (!id) return null;
  return getCategoryHistory(id);
}


/**
 * The entries behind one budget's figure, fetched when its panel opens.
 *
 * A server action rather than data carried down with every card: eleven budgets' worth
 * of ledger rows would ride to the browser on every page load for a list almost nobody
 * opens, and the panel wants a fresh read anyway. Ownership is checked inside
 * `getBudgetEntries` — an id that is not yours finds no plan and therefore no rows.
 */
export async function loadBudgetEntries(
  planId: string,
  span?: { from: string; to: string },
): Promise<BudgetEntry[]> {
  if (typeof planId !== "string" || planId.length === 0) return [];
  // Two days or nothing. Anything else that arrives here is dropped rather than passed
  // into a query — the shape is all this boundary can check, so it checks that.
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const clean = span ? { from: day(span.from), to: day(span.to) } : undefined;
  return getBudgetEntries(planId, undefined, clean);
}
