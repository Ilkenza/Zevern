"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Utensils } from "lucide-react";
import { saveSpendingBasis } from "@/app/(app)/private/actions";
import { Panel } from "@/components/ui/Panel";
import { formatRsd, monthLabel } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { SpendingProjection } from "@/lib/data/money";
import type { SpendingBasis } from "@/lib/types";

/** Small caps label — column heads and captions, same token as Setup and Goals. */
const caps = "text-[10.5px] font-semibold uppercase tracking-wider text-faint";

const OPTIONS: { value: SpendingBasis; label: string; blurb: string }[] = [
  {
    value: "history",
    label: "History",
    blurb: "The middle of what recent months actually cost.",
  },
  {
    value: "budgets",
    label: "Budgets",
    blurb: "What the category limits say a month should cost.",
  },
  {
    value: "off",
    label: "Off",
    blurb: "Project nothing. The line counts only dated items.",
  },
];

/** Days left in this month, today excluded — today is already on the accounts. */
function daysLeftThisMonth(): number {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(last - now.getDate(), 0);
}

function Option({
  option,
  current,
  disabled,
  onPick,
}: {
  option: { value: SpendingBasis; label: string };
  current: boolean;
  disabled: boolean;
  onPick: (value: SpendingBasis) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(option.value)}
      aria-pressed={current}
      disabled={disabled}
      className={cn(
        "rounded-pill px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-50",
        current ? "bg-active-bg text-gold-hi" : "text-muted hover:bg-white/5 hover:text-ink",
      )}
    >
      {option.label}
    </button>
  );
}

/**
 * Groceries, fuel, coffee and everything else nobody enters one item at a time —
 * usually the largest slice of a month, and until now the one thing the timeline
 * subtracted nothing for.
 *
 * The setting lives here rather than in Setup because this is the only screen the
 * answer changes anything on, and because the figure it produces has to be readable
 * next to the working behind it.
 */
export function SpendingBasisPanel({ spending }: { spending: SpendingProjection }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pick = (value: SpendingBasis) => {
    if (value === spending.basis) return;
    setError(null);
    startTransition(async () => {
      const result = await saveSpendingBasis(value);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  };

  const blurb = OPTIONS.find((o) => o.value === spending.basis)?.blurb ?? "";
  const left = daysLeftThisMonth();
  const remaining = Math.max(spending.monthly - spending.spentThisMonth, 0);
  const perDay = left > 0 ? remaining / left : 0;

  return (
    <Panel
      title="Everyday spending"
      action={
        <div className="flex items-center gap-0.5 rounded-pill border border-line bg-white/[0.03] p-0.5">
          {OPTIONS.map((option) => (
            <Option
              key={option.value}
              option={option}
              current={spending.basis === option.value}
              disabled={pending}
              onPick={pick}
            />
          ))}
        </div>
      }
    >
      <div className="px-4 py-3.5">
        {spending.basis === "off" ? (
          <p className="text-[12.5px] leading-relaxed text-muted">
            Nothing is projected for groceries, fuel or eating out, so the timeline
            counts only what repeats and what you have planned. What it leaves at the
            end of a month will read higher than what you will actually have.
          </p>
        ) : !spending.ready ? (
          <p className="text-[12.5px] leading-relaxed text-muted">
            {spending.basis === "budgets"
              ? "No category limits are set, so there is nothing to project from. Set them in Budgets, or switch to History."
              : "No complete month of entries yet, so there is nothing to take a middle of. Switch to Budgets, or come back once a month has passed."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="mono text-[24px] font-semibold tracking-[-0.5px] text-ink">
                {formatRsd(spending.monthly)}
              </span>
              <span className="text-[12.5px] text-muted">a month · {blurb}</span>
            </div>

            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              This month has already seen{" "}
              <span className="mono text-ink">{formatRsd(spending.spentThisMonth)}</span> of it.
              {left > 0 ? (
                <>
                  {" "}
                  The remaining <span className="mono text-ink">{formatRsd(remaining)}</span> is
                  spread over the {left} {left === 1 ? "day" : "days"} left — about{" "}
                  <span className="mono">{formatRsd(perDay)}</span> a day — rather than dropped
                  on one date.
                </>
              ) : (
                <> The month is over, so nothing more is projected onto it.</>
              )}
            </p>

            {spending.basis === "history" && spending.months.length > 0 && (
              <div className="mt-3">
                <div className={caps}>
                  The middle of {spending.months.length}{" "}
                  {spending.months.length === 1 ? "month" : "months"}
                </div>
                <div className="mt-1.5 grid gap-x-4 gap-y-0.5 min-[420px]:grid-cols-2">
                  {spending.months.map((m) => (
                    <div
                      key={m.month}
                      className="flex items-baseline justify-between gap-3 text-[11.5px]"
                    >
                      <span className="min-w-0 truncate text-muted">{monthLabel(m.month)}</span>
                      <span className="mono text-faint">{formatRsd(m.spent)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                  Bills a rule booked, and anything that settled a planned item, are left
                  out of these figures — they are on the timeline in their own right, and
                  counting them here as well would subtract them twice.
                </p>
              </div>
            )}

            {spending.basis === "budgets" && spending.categories.length > 0 && (
              <div className="mt-3">
                <div className={caps}>Limit less what already repeats</div>
                <div className="mt-1.5 space-y-0.5">
                  {spending.categories.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-baseline justify-between gap-3 text-[11.5px]"
                    >
                      <span className="min-w-0 truncate text-muted">{c.name}</span>
                      <span className="mono shrink-0 text-faint">
                        {formatRsd(c.limit)}
                        {c.recurring > 0 && (
                          <>
                            {" − "}
                            {formatRsd(c.recurring)}
                            {" = "}
                            <span className="text-ink">
                              {formatRsd(Math.max(c.limit - c.recurring, 0))}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                  A rule that books into a category is already on the timeline, so its
                  share of that limit is taken off here instead of being counted twice.
                  A planned one-off in a budgeted category comes off its own month the
                  same way, up to whatever that category was still contributing.
                </p>
              </div>
            )}
          </>
        )}

        <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-faint">
          <Utensils aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Everyday spending is shown on the timeline as a projection, never as a dated
            fact. Nothing here books anything.
          </span>
        </p>

        {error && <p className="mt-2 text-[11.5px] text-danger">{error}</p>}
      </div>
    </Panel>
  );
}
