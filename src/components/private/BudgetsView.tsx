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

  return (
    <div className="mx-auto max-w-220">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
            Budgets
          </h1>
          <p className="text-[12.5px] text-muted">
            Monthly limit per category · {monthLabel(month)}
          </p>
        </div>
        <Link href="/private/money" className={buttonClasses("secondary", "border")}>
          See entries
        </Link>
      </div>

      {lines.length === 0 ? (
        <Panel>
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
            title={`Total ${formatRsd(totalSpent)} of ${formatRsd(totalLimit)}`}
            action={
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Saving…" : "Save limits"}
              </Button>
            }
          >
            <div>
              {lines.map((line) => {
                const used = line.limit > 0 ? Math.min(line.spent / line.limit, 1) : 0;
                const left = line.limit - line.spent;
                return (
                  <div
                    key={line.category.id}
                    className="border-b border-line-soft px-4 py-3 last:border-b-0"
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
                        className="w-24 rounded-ctrl border border-line bg-white/[0.035] px-2 py-1.5 text-right text-[12.5px] text-ink placeholder:text-faint focus:border-gold focus:outline-none"
                      />
                    </div>
                    {line.limit > 0 && (
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-white/6">
                          <div
                            className={cn("h-full rounded-pill", tone(line.spent, line.limit, pace))}
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
