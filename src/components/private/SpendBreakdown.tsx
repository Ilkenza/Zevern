"use client";

import Link from "next/link";

import type { MoneyCategory } from "@/lib/types";
import { useMoney } from "@/lib/money/currency";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/money";
import { CAT_REST, catTone } from "@/lib/money/tone";

/**
 * Where the month's money went.
 *
 * The four figures above say how much was spent. This says on what — which is the
 * question that actually changes behaviour, and the one the ledger below can only
 * answer by being read line by line.
 *
 * Every bar has one meaning and one only: that category's share of this month's
 * spending. Length says it, the percentage beside the amount says it in figures, and
 * nothing else on the row is allowed to touch either.
 *
 * The bar used to turn red when a category passed its limit, which put two unrelated
 * questions on one object — length answering "where did it go", colour answering "was
 * that too much". A 72%-of-the-month fill in the colour that means "over" reads as 72%
 * of a limit, and then the words beside it say "867 over", and the two disagree in
 * front of the person. So the warning moves off the bar and onto the row: a red edge
 * at its left, where it cannot be mistaken for a measurement.
 *
 * That split is also how the rest of the world builds this. Copilot keeps "where it
 * went" in Cash Flow, deliberately free of budgets, and puts the meters in a separate
 * Categories tab where every bar is measured against its own limit; YNAB is
 * budget-first and does not pretend its bars are proportions. Here the same division
 * already existed — Budgets is the meter, this is the picture — it had just leaked.
 *
 * Strength follows rank, the same gold at the same steps the overview's band uses, so
 * the two screens draw one month in one language.
 *
 * Each row is a filter: the ledger underneath is one click from showing only that
 * category, which is the natural next question after seeing a number you did not
 * expect.
 *
 * A capped category still answers the useful budget question in plain language:
 * "4,000 left", "limit reached", or "867 over limit". The detailed meter remains on
 * Budgets, where every bar is measured against a limit and can be compared honestly.
 */

const SHOWN = 8;

export function SpendBreakdown({
  byCategory,
  categories,
  total,
  month,
  activeCategory,
  limits,
}: {
  byCategory: { id: string; spent: number }[];
  categories: MoneyCategory[];
  total: number;
  month: string;
  activeCategory?: string;
  /** Monthly cap per category id, for the ones that have one. */
  limits?: Record<string, number>;
}) {
  const { fmt } = useMoney();
  const nameById = new Map(categories.map((c) => [c.id, c]));

  const rows = byCategory
    .filter((c) => c.spent > 0)
    .map((c) => ({ ...c, category: nameById.get(c.id) ?? null }))
    .sort((a, b) => b.spent - a.spent);

  if (rows.length === 0 || total <= 0) return null;

  // Uncategorized must remain findable even when it is the month's ninth-smallest
  // group. Hiding it under "smaller categories" leaves no route to clean those entries.
  const uncategorized = rows.find((row) => row.id === UNCATEGORIZED_CATEGORY_ID);
  const categorized = rows.filter((row) => row.id !== UNCATEGORIZED_CATEGORY_ID);
  const shown = [
    ...categorized.slice(0, uncategorized ? SHOWN - 1 : SHOWN),
    ...(uncategorized ? [uncategorized] : []),
  ].sort((a, b) => b.spent - a.spent);
  /*
    A row under a fiftieth of the month is a two-pixel fill and a name: it says "small"
    and nothing else, and four of them in a row are four empty troughs. They fold into
    the tail whether or not the list was long enough to need folding.
  */
  const shownIds = new Set(
    shown.filter((r) => r.id === UNCATEGORIZED_CATEGORY_ID || r.spent / total >= 0.02).map((r) => r.id),
  );
  const rest = rows.filter((row) => !shownIds.has(row.id));
  const restTotal = rest.reduce((sum, r) => sum + r.spent, 0);

  return (
    <section className="breakdown">
      <div className="breakdown-head">
        <span className="money-page-kicker">Where it went</span>
        <span className="mono breakdown-total">{fmt(total)}</span>
      </div>

      <div className="breakdown-rows">
        {shown
          .filter((row) => shownIds.has(row.id))
          .map((row, index) => {
          const isUncategorized = row.id === UNCATEGORIZED_CATEGORY_ID;
          const name = isUncategorized ? "Uncategorized" : row.category?.name ?? "Unknown category";
          const on = activeCategory === row.id;
          const limit = limits?.[row.id] ?? 0;
          const over = limit > 0 && row.spent > limit;
          /*
            A limit you are nowhere near is not news.

            Learning had spent a twentieth of its cap and printed "18,956 left" — the
            largest secondary figure on the panel, attached to the row that mattered
            least, while the one that mattered said "867 over" in smaller type. Under
            half used, the limit says nothing at all.
          */
          const limitStatus =
            limit <= 0 || row.spent < limit * 0.5
              ? null
              : over
                ? `${fmt(row.spent - limit)} over limit`
                : row.spent === limit
                  ? "Limit reached"
                  : `${fmt(limit - row.spent)} left`;
          return (
            <Link
              key={row.id}
              href={
                on
                  ? `/private/money?month=${month}`
                  : `/private/money?month=${month}&cat=${row.id}`
              }
              className={`breakdown-row${on ? " breakdown-row-on" : ""}${
                over ? " breakdown-row-over" : ""
              }`}
              style={{ animationDelay: `${180 + index * 45}ms` }}
              aria-label={`${name}, ${fmt(row.spent)}${limitStatus ? `, ${limitStatus}` : ""}. ${
                on ? `Clear the ${name} filter` : `Show only ${name} in the entries below`
              }`}
            >
              {/*
                No dot. The name is written right there — a coloured mark beside a word
                that already says which category this is was decoration, and decoration
                that had run out of distinct colours to be.
              */}
              <span className="breakdown-name">{name}</span>
              <span
                className="breakdown-track"
                role="img"
                aria-label={`${Math.round((row.spent / total) * 100)}% of this month's spending`}
              >
                <span
                  className="breakdown-fill money-progress-segment"
                  style={{
                    width: `${(row.spent / total) * 100}%`,
                    /*
                      Rank, or the grey of the unnamed. Never a status: the moment this
                      takes a colour that means something about limits, its length
                      starts being read as a limit too.
                    */
                    background: isUncategorized ? "var(--color-muted)" : catTone(index),
                  }}
                />
              </span>
              <span className="breakdown-amount">
                <span className="mono breakdown-amount-value">
                  {fmt(row.spent)}
                  {/*
                    The proportion, written down. A 1350px track with a 1% fill is not
                    something anyone measures by eye, and the bar was the only place
                    the share existed.
                  */}
                  <i className="breakdown-share">{Math.round((row.spent / total) * 100)}%</i>
                </span>
                {limitStatus && (
                  <span className={`mono breakdown-limit-status${over ? " is-over" : ""}`}>
                    {limitStatus}
                  </span>
                )}
              </span>
            </Link>
            );
          })}

        {rest.length > 0 && (
          <div className="breakdown-row breakdown-rest">
            <span className="breakdown-name">
              {rest.length} smaller {rest.length === 1 ? "category" : "categories"}
            </span>
            <span className="breakdown-track" aria-hidden>
              <span
                className="breakdown-fill"
                style={{ width: `${(restTotal / total) * 100}%`, background: CAT_REST }}
              />
            </span>
            <span className="mono breakdown-amount">{fmt(restTotal)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
