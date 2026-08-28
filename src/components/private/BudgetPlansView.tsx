"use client";

import { useState } from "react";
import { Plus, Target, Pencil } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { useMoney } from "@/lib/money/currency";
import { clockLabel } from "@/lib/money/budget-periods";
import { cn } from "@/lib/utils";
import type { BudgetPlanLine, MoneyAccount, MoneyCategory } from "@/lib/types";
import { BudgetPlanForm } from "./budgets/BudgetPlanForm";
import {
  PLAN_STATUS_LABEL,
  PLAN_STATUS_TONE,
  readPlan,
  windowLabel,
} from "./budgets/plan-reading";

/**
 * One budget, said in three lines: what it is, where it stands, what that leaves.
 *
 * The bar is the whole card, in the sense that it is the only part anybody reads in
 * passing. So it carries two marks rather than one: the fill, which is the money, and a
 * tick, which is where the period has got to. A fill short of the tick is fine however
 * red the number looks; a fill past it is the warning, and it is visible at a glance
 * without reading a single figure.
 */
function BudgetCard({
  line,
  today,
  onEdit,
}: {
  line: BudgetPlanLine;
  today: string;
  onEdit: () => void;
}) {
  const { fmt } = useMoney();
  const reading = readPlan(line, today, fmt);
  const limit = Number(line.plan.amount_rsd) || 0;
  const accent = line.plan.color ?? "var(--color-gold)";

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span
          className="mt-1 h-8 w-1 shrink-0 rounded-pill"
          style={{ background: accent }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[14.5px] font-bold text-ink">{line.plan.name}</span>
            {line.plan.membership === "added" && (
              <span className="shrink-0 rounded-pill border border-line px-1.5 py-0.5 text-[10.5px] font-semibold text-faint">
                added only
              </span>
            )}
          </div>
          <div className="truncate text-[11.5px] text-muted">
            {windowLabel(line.window)} · {clockLabel({
              period: line.plan.period as "custom" | "day" | "week" | "month" | "year",
              period_count: line.plan.period_count,
              starts_on: line.plan.starts_on,
              ends_on: line.plan.ends_on,
            })}
            {line.window.ended ? " · finished" : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${line.plan.name}`}
          title="Edit budget"
          className="zv-rowctrl shrink-0"
        >
          <Pencil className="h-3.75 w-3.75" />
        </button>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="mono text-[16px] font-semibold text-ink">
          {fmt(line.used)}
          <span className="text-[12.5px] font-medium text-faint"> of {fmt(limit)}</span>
        </span>
        <span className={cn("text-[11.5px] font-bold", PLAN_STATUS_TONE[reading.status])}>
          {PLAN_STATUS_LABEL[reading.status]}
        </span>
      </div>

      <div className="relative mt-2 h-2 overflow-hidden rounded-pill bg-white/[0.06]">
        <span
          className="absolute inset-y-0 left-0 rounded-pill transition-[width]"
          style={{
            width: `${reading.pct * 100}%`,
            background:
              reading.status === "over" || reading.status === "behind"
                ? "var(--color-danger)"
                : accent,
          }}
        />
        {/* Where the period has got to. Without it a half-full bar says nothing at all. */}
        {!line.window.ended && (
          <span
            className="absolute inset-y-0 w-px bg-ink/45"
            style={{ left: `${reading.pace * 100}%` }}
            aria-hidden
          />
        )}
      </div>

      <p className="mt-2 text-[12px] text-muted">{reading.note}</p>
    </div>
  );
}

export function BudgetPlansView({
  lines,
  categories,
  accounts,
  today,
}: {
  lines: BudgetPlanLine[];
  categories: MoneyCategory[];
  accounts: MoneyAccount[];
  /** Read on the server, so the client cannot disagree about which period is current. */
  today: string;
}) {
  const [panel, setPanel] = useState<{ mode: "new" } | { mode: "edit"; line: BudgetPlanLine } | null>(
    null,
  );

  const spending = lines.filter((l) => l.plan.kind === "expense");
  const saving = lines.filter((l) => l.plan.kind === "savings");

  return (
    <div className="pb-10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
            Budgets
          </h1>
          <p className="text-[12.5px] text-muted">
            Each one keeps its own clock, so they do not all have to be months.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPanel({ mode: "new" })}
          className={buttonClasses("primary", "shrink-0")}
        >
          <Plus className="h-4 w-4" /> New budget
        </button>
      </div>

      {lines.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No budgets yet"
          description="A budget can be a month of groceries, a fortnight of eating out, or one holiday with an end date. Start with the one you would actually check."
        />
      ) : (
        <div className="space-y-5">
          {spending.length > 0 && (
            <section>
              <h2 className="money-page-kicker mb-2">Spending</h2>
              <div className="grid gap-2.5 md:grid-cols-2">
                {spending.map((line) => (
                  <BudgetCard
                    key={line.plan.id}
                    line={line}
                    today={today}
                    onEdit={() => setPanel({ mode: "edit", line })}
                  />
                ))}
              </div>
            </section>
          )}

          {saving.length > 0 && (
            <section>
              <h2 className="money-page-kicker mb-2">Saving</h2>
              <div className="grid gap-2.5 md:grid-cols-2">
                {saving.map((line) => (
                  <BudgetCard
                    key={line.plan.id}
                    line={line}
                    today={today}
                    onEdit={() => setPanel({ mode: "edit", line })}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <SlideOver
        open={panel !== null}
        onClose={() => setPanel(null)}
        title={panel?.mode === "edit" ? "Edit budget" : "New budget"}
      >
        {panel && (
          <BudgetPlanForm
            plan={panel.mode === "edit" ? panel.line.plan : undefined}
            categoryIds={panel.mode === "edit" ? panel.line.categoryIds : []}
            accountIds={panel.mode === "edit" ? panel.line.accountIds : []}
            categories={categories}
            accounts={accounts}
            onSaved={() => setPanel(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}
