import Link from "next/link";
import { formatRsd } from "@/lib/money";
import type { MoneyCategory } from "@/lib/types";

/**
 * Where the month's money went.
 *
 * The four figures above say how much was spent. This says on what — which is the
 * question that actually changes behaviour, and the one the ledger below can only
 * answer by being read line by line.
 *
 * Bars are scaled to the largest category rather than to the total, because the
 * comparison worth making is between categories. Scaled to the total, a month split
 * evenly across nine categories draws nine stubs and tells you nothing.
 *
 * Each row is a filter: the ledger underneath is one click from showing only that
 * category, which is the natural next question after seeing a number you did not
 * expect.
 */

const SHOWN = 8;

export function SpendBreakdown({
  byCategory,
  categories,
  total,
  month,
  activeCategory,
}: {
  byCategory: { id: string; spent: number }[];
  categories: MoneyCategory[];
  total: number;
  month: string;
  activeCategory?: string;
}) {
  const nameById = new Map(categories.map((c) => [c.id, c]));

  const rows = byCategory
    .filter((c) => c.spent > 0)
    .map((c) => ({ ...c, category: nameById.get(c.id) ?? null }))
    .sort((a, b) => b.spent - a.spent);

  if (rows.length === 0 || total <= 0) return null;

  const shown = rows.slice(0, SHOWN);
  const rest = rows.slice(SHOWN);
  const restTotal = rest.reduce((sum, r) => sum + r.spent, 0);
  const peak = shown[0].spent;

  return (
    <section className="breakdown">
      <div className="breakdown-head">
        <span className="money-page-kicker">Where it went</span>
        <span className="mono breakdown-total">{formatRsd(total)}</span>
      </div>

      <div className="breakdown-rows">
        {shown.map((row, index) => {
          const share = Math.round((row.spent / total) * 100);
          const name = row.category?.name ?? "Uncategorised";
          const color = row.category?.color ?? "var(--color-faint)";
          const on = activeCategory === row.id;
          return (
            <Link
              key={row.id}
              href={
                on
                  ? `/private/money?month=${month}`
                  : `/private/money?month=${month}&cat=${row.id}`
              }
              className={`breakdown-row${on ? " breakdown-row-on" : ""}`}
              style={{ animationDelay: `${180 + index * 45}ms` }}
              aria-label={
                on ? `Clear the ${name} filter` : `Show only ${name} in the entries below`
              }
            >
              <span className="breakdown-name">
                <i style={{ background: color }} aria-hidden />
                {name}
              </span>
              <span className="breakdown-track" aria-hidden>
                <span
                  className="breakdown-fill money-progress-segment"
                  style={{ width: `${(row.spent / peak) * 100}%`, background: color }}
                />
              </span>
              <span className="mono breakdown-amount">{formatRsd(row.spent)}</span>
              <span className="mono breakdown-share">{share}%</span>
            </Link>
          );
        })}

        {rest.length > 0 && (
          <div className="breakdown-row breakdown-rest">
            <span className="breakdown-name">
              <i style={{ background: "var(--color-faint)" }} aria-hidden />
              {rest.length} smaller {rest.length === 1 ? "category" : "categories"}
            </span>
            <span className="breakdown-track" aria-hidden>
              <span
                className="breakdown-fill"
                style={{ width: `${(restTotal / peak) * 100}%`, background: "var(--color-faint)" }}
              />
            </span>
            <span className="mono breakdown-amount">{formatRsd(restTotal)}</span>
            <span className="mono breakdown-share">{Math.round((restTotal / total) * 100)}%</span>
          </div>
        )}
      </div>
    </section>
  );
}
