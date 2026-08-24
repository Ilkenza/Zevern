"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Target } from "lucide-react";
import { saveBudgets, type MoneyState } from "@/app/(app)/private/actions";
import { Panel } from "@/components/ui/Panel";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRsd, monthLabel, monthProgress } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BudgetLine } from "@/lib/types";

/** Bar tone: green while on pace, gold when ahead of pace, red once over. */
function tone(spent: number, limit: number, pace: number) {
  if (limit <= 0) return "bg-white/10";
  const used = spent / limit;
  if (used > 1) return "bg-danger";
  if (used > pace + 0.15) return "bg-gold";
  return "bg-ok";
}

export function BudgetsView({ month, lines }: { month: string; lines: BudgetLine[] }) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveBudgets, undefined);
  const pace = monthProgress(month);

  const totalLimit = lines.reduce((s, l) => s + l.limit, 0);
  const totalSpent = lines.reduce((s, l) => s + l.spent, 0);
  const totalUsed = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;

  return (
    <div className="money-premium money-budgets mx-auto max-w-220">
      <div className="money-page-head mb-5 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="money-page-kicker">Monthly control</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            Budgets
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Set the guardrails, then let every category show its pace · {monthLabel(month)}
          </p>
        </div>
        <Link href="/private/money" className={buttonClasses("secondary", "money-premium-button border")}>
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
              <Link href="/private/setup" className={buttonClasses("primary")}>
                Go to Setup
              </Link>
            }
          />
        </Panel>
      ) : (
        <form action={formAction}>
          <Panel
            className="money-summary-panel budget-panel-premium"
            title={`Total ${formatRsd(totalSpent)} of ${formatRsd(totalLimit)}`}
            action={
              <Button type="submit" variant="primary" className="money-premium-button" disabled={pending}>
                {pending ? "Saving…" : "Save limits"}
              </Button>
            }
          >
            {totalLimit > 0 && (
              <div className="budget-overview border-b border-line-soft px-4 py-4">
                <div className="mb-2.5 flex items-end justify-between gap-4">
                  <div>
                    <span className="money-page-kicker">Month used</span>
                    <p className="mono mt-1 text-[25px] font-semibold tracking-[-0.8px] text-ink">
                      {totalUsed}%
                    </p>
                  </div>
                  <p className="text-right text-[11.5px] text-muted">
                    {formatRsd(Math.max(totalLimit - totalSpent, 0))} available
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-pill bg-white/6">
                  <div
                    className={cn("money-progress-fill h-full rounded-pill", tone(totalSpent, totalLimit, pace))}
                    style={{ width: `${Math.min(totalUsed, 100)}%` }}
                  />
                </div>
              </div>
            )}
            <div>
              {lines.map((line, index) => {
                const used = line.limit > 0 ? Math.min(line.spent / line.limit, 1) : 0;
                const left = line.limit - line.spent;
                return (
                  <div
                    key={line.category.id}
                    className="budget-row-premium border-b border-line-soft px-4 py-3.5 last:border-b-0"
                    style={{ animationDelay: `${150 + index * 55}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: line.category.color ?? "#565c6b" }}
                      />
                      <span className="flex-1 truncate text-[13.5px] font-semibold text-ink">
                        {line.category.name}
                      </span>
                      <span className="mono text-[12.5px] text-muted">
                        {formatRsd(line.spent)}
                      </span>
                      <span className="text-[12px] text-faint">of</span>
                      <input
                        name={`limit_${line.category.id}`}
                        defaultValue={line.limit > 0 ? String(line.limit) : ""}
                        inputMode="numeric"
                        placeholder="—"
                        aria-label={`Monthly limit for ${line.category.name}`}
                        className="w-24 rounded-ctrl border border-line bg-white/[0.035] px-2 py-1.5 text-right text-[12.5px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring focus:outline-none"
                      />
                    </div>
                    {line.limit > 0 && (
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-white/6">
                          <div
                            className={cn("money-progress-fill h-full rounded-pill", tone(line.spent, line.limit, pace))}
                            style={{ width: `${used * 100}%` }}
                          />
                        </div>
                        <span
                          className={cn(
                            "mono w-28 text-right text-[11.5px]",
                            left < 0 ? "text-danger" : "text-muted",
                          )}
                        >
                          {left < 0 ? `${formatRsd(-left)} over` : `${formatRsd(left)} left`}
                        </span>
                      </div>
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
          {state?.ok && <p className="mt-3 text-[12px] text-ok">Limits saved.</p>}
          <p className="mt-3 text-[12px] text-muted">
            Leave a limit empty to track a category without capping it.
          </p>
        </form>
      )}
    </div>
  );
}
