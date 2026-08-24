"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Wallet, Pencil } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { buttonClasses } from "@/components/ui/Button";
import { removeTransaction } from "@/app/(app)/private/actions";
import { formatAmount, formatRsd, isGoalKind, monthLabel, monthKey, shiftMonth } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MoneyCategory, TransactionRow } from "@/lib/types";
import { TransactionForm, type TxFormData } from "./TransactionForm";
import type { MonthSummary } from "@/lib/data/money";

export type MoneyPanel =
  | { mode: "new"; kind: string }
  | { mode: "edit"; tx: TransactionRow }
  | null;

/** → into a goal, ← back out of one: the arrow says which way, not whether. */
const SIGN: Record<string, string> = {
  expense: "−",
  income: "+",
  saving: "→",
  withdraw: "←",
  transfer: "⇄",
};
const TONE: Record<string, string> = {
  expense: "text-ink",
  income: "text-ok",
  saving: "text-info",
  withdraw: "text-muted",
  transfer: "text-muted",
};

function Row({ tx, month }: { tx: TransactionRow; month: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const label =
    tx.category?.name ?? (isGoalKind(tx.kind) ? tx.goal?.name : null) ?? tx.note ?? "—";
  return (
    <div className="group border-b border-line-soft last:border-b-0 hover:bg-white/2">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span
          className="h-7 w-1 shrink-0 rounded-pill"
          style={{ background: tx.category?.color ?? "var(--color-faint)" }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{label}</div>
          <div className="truncate text-[11.5px] text-muted">
            {tx.account?.name ?? "No account"}
            {tx.note && label !== tx.note ? ` · ${tx.note}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn("mono text-[13.5px] font-semibold", TONE[tx.kind])}>
            {SIGN[tx.kind]} {formatRsd(Number(tx.amount_rsd))}
          </div>
          {tx.currency !== "RSD" && (
            <div className="mono text-[11px] text-faint">
              {formatAmount(Number(tx.amount), tx.currency)}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Link
            href={`/private/money?month=${month}&edit=${tx.id}`}
            aria-label="Edit entry"
            title="Edit entry"
            className="inline-flex rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
          >
            <Pencil className="h-3.75 w-3.75" />
          </Link>
          <DeleteButton
            compact
            label="Delete entry"
            confirmText="Delete this entry? Balances and this month's totals are recalculated without it."
            action={async () => {
              const result = await removeTransaction(tx.id);
              if (result?.error) setError(result.error);
              else router.refresh();
            }}
          />
        </div>
      </div>
      {error && <p className="px-4 pb-2 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

export function MoneyView({
  month,
  transactions,
  summary,
  categories,
  data,
  panel,
  activeCategory,
}: {
  month: string;
  transactions: TransactionRow[];
  summary: MonthSummary;
  categories: MoneyCategory[];
  data: TxFormData;
  panel: MoneyPanel;
  activeCategory?: string;
}) {
  const router = useRouter();
  const base = `/private/money?month=${month}`;
  const close = () => router.push(base + (activeCategory ? `&cat=${activeCategory}` : ""));

  const days = [...new Set(transactions.map((t) => t.occurred_on))];

  return (
    <div className="mx-auto max-w-300">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
            Money
          </h1>
          <div className="flex items-center gap-1 rounded-ctrl border border-line bg-white/[0.03] px-1 py-0.5">
            <Link
              href={`/private/money?month=${shiftMonth(month, -1)}`}
              aria-label="Previous month"
              className="rounded-ctrl p-1 text-muted hover:bg-white/5 hover:text-ink"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="min-w-32 text-center text-[12.5px] font-semibold text-ink">
              {monthLabel(month)}
            </span>
            <Link
              href={`/private/money?month=${shiftMonth(month, 1)}`}
              aria-label="Next month"
              className="rounded-ctrl p-1 text-muted hover:bg-white/5 hover:text-ink"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          {month !== monthKey() && (
            <Link href="/private/money" className="text-[12px] font-semibold text-gold-hi">
              Today
            </Link>
          )}
        </div>
        <Link href={`${base}&new=expense`} className={buttonClasses("primary")}>
          <Plus className="h-4 w-4" />
          Add
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Spent" value={formatRsd(summary.expense)} />
        <Kpi label="Income" value={formatRsd(summary.income)} />
        <Kpi
          label="Put aside"
          value={formatRsd(summary.saved)}
          hint={
            summary.withdrawn > 0
              ? `After ${formatRsd(summary.withdrawn)} taken back out`
              : undefined
          }
        />
        <Kpi
          label="Left over"
          value={formatRsd(summary.net)}
          hint={summary.net < 0 ? <span className="text-danger">Over budget</span> : undefined}
        />
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Link
            href={base}
            className={cn(
              "rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
              !activeCategory
                ? "border-gold/40 bg-active-bg text-gold"
                : "border-line text-muted hover:text-ink",
            )}
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`${base}&cat=${c.id}`}
              className={cn(
                "rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                activeCategory === c.id
                  ? "border-gold/40 bg-active-bg text-gold"
                  : "border-line text-muted hover:text-ink",
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <Panel>
        {transactions.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nothing logged this month"
            description="Add what you spend as you spend it — that is the whole trick."
            action={
              <Link href={`${base}&new=expense`} className={buttonClasses("primary")}>
                Add entry
              </Link>
            }
          />
        ) : (
          <div>
            {days.map((day) => {
              const rows = transactions.filter((t) => t.occurred_on === day);
              const dayTotal = rows
                .filter((t) => t.kind === "expense")
                .reduce((sum, t) => sum + (Number(t.amount_rsd) || 0), 0);
              return (
                <div key={day}>
                  <div className="flex items-center justify-between border-b border-line-soft bg-white/[0.02] px-4 py-2">
                    <span className="mono text-[11px] font-semibold text-muted">{day}</span>
                    {dayTotal > 0 && (
                      <span className="mono text-[11px] text-faint">−{formatRsd(dayTotal)}</span>
                    )}
                  </div>
                  {rows.map((t) => (
                    <Row key={t.id} tx={t} month={month} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.mode === "edit" ? "Edit entry" : "New entry"}
      >
        <TransactionForm
          tx={panel?.mode === "edit" ? panel.tx : undefined}
          defaultKind={panel?.mode === "new" ? panel.kind : "expense"}
          data={data}
        />
      </SlideOver>
    </div>
  );
}
