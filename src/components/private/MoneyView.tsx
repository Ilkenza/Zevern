"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CornerUpLeft, Plus, Wallet, Pencil } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { buttonClasses } from "@/components/ui/Button";
import { removeTransaction } from "@/app/(app)/private/actions";
import {
  formatAmount,
  formatRsd,
  isGoalKind,
  monthLabel,
  shiftMonth,
  shortMonthLabel,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MoneyCategory, TransactionRow } from "@/lib/types";
import { TransactionForm, type TxFormData } from "./TransactionForm";
import { OnHandBand } from "./OnHandBand";
import { SpendBreakdown } from "./SpendBreakdown";
import type { AccountBalance, MonthSummary, OnHand } from "@/lib/data/money";

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
    <div className="money-row group border-b border-line-soft last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span
          className="money-row-spine h-7 w-1 shrink-0 rounded-pill"
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
  currentMonth,
  transactions,
  summary,
  categories,
  data,
  balances,
  onHand,
  panel,
  activeCategory,
}: {
  month: string;
  /** Decided on the server, so hydration can never disagree about what today is. */
  currentMonth: string;
  transactions: TransactionRow[];
  summary: MonthSummary;
  categories: MoneyCategory[];
  data: TxFormData;
  balances: AccountBalance[];
  onHand: OnHand;
  panel: MoneyPanel;
  activeCategory?: string;
}) {
  const router = useRouter();
  const base = `/private/money?month=${month}`;
  const close = () => router.push(base + (activeCategory ? `&cat=${activeCategory}` : ""));

  const days = [...new Set(transactions.map((t) => t.occurred_on))];
  const isCurrentMonth = month === currentMonth;
  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  return (
    <div className="money-premium mx-auto max-w-300">
      <div className="money-page-head mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="money-page-kicker">Private · Money</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            {monthLabel(month)}
          </h1>
          {/*
            The month you are on is the heading above, so the switcher does not repeat
            it — it names where each step lands instead.
          */}
          <div className="money-month-nav mt-3">
            <Link
              href={`/private/money?month=${prevMonth}`}
              aria-label={`Go to ${monthLabel(prevMonth)}`}
              className="money-month-arrow"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{shortMonthLabel(prevMonth, month)}</span>
            </Link>
            <Link
              href={`/private/money?month=${nextMonth}`}
              aria-label={`Go to ${monthLabel(nextMonth)}`}
              className="money-month-arrow"
            >
              <span>{shortMonthLabel(nextMonth, month)}</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
            {/*
              This used to say "Today", which is a day and not a month — sitting beside
              "July 2026" it read as a claim about July rather than a way back.
            */}
            {!isCurrentMonth && (
              <Link href="/private/money" className="money-month-back">
                <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />
                This month
              </Link>
            )}
          </div>
        </div>
        <Link
          href={`${base}&new=expense`}
          className={buttonClasses("primary", "money-premium-button")}
        >
          <Plus className="h-4 w-4" />
          Add
        </Link>
      </div>

      <div className="mb-4">
        <OnHandBand onHand={onHand} accounts={balances} />
      </div>

      <div className="money-card-grid mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          className="money-card-premium"
          label="Spent"
          value={formatRsd(summary.expense)}
        />
        <Kpi
          className="money-card-premium"
          label="Income"
          value={formatRsd(summary.income)}
        />
        <Kpi
          className="money-card-premium"
          label="Put aside"
          value={formatRsd(summary.saved)}
          hint={
            summary.withdrawn > 0
              ? `After ${formatRsd(summary.withdrawn)} taken back out`
              : undefined
          }
        />
        {/*
          "Over budget" was a lie this page had no way of telling.

          `net` is income less spending less what was put aside. It has never consulted
          a budget — this screen does not load one, and the limits that do exist live on
          Budgets. So a month with no income recorded said "Over budget" after a single
          grocery run, to someone comfortably inside every limit they had set.

          What the figure actually says is the sentence below, and it is worth saying:
          a month that takes out more than it brings in is a real thing to notice, it
          is just not a budget being broken.
        */}
        <Kpi
          className="money-card-premium"
          label="Left over"
          value={formatRsd(summary.net)}
          hint={
            summary.net < 0 ? (
              <span className="text-danger">More went out than came in</span>
            ) : undefined
          }
        />
      </div>

      {/*
        The figures above say how much. This says on what — and each row is a filter,
        so the ledger below is one click from showing only the category whose number
        just surprised you.
      */}
      <div className="mb-4">
        <SpendBreakdown
          byCategory={summary.byCategory}
          categories={categories}
          total={summary.expense}
          month={month}
          activeCategory={activeCategory}
        />
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="money-chips mb-3 flex flex-wrap gap-1.5">
          <Link
            href={base}
            className={cn(
              "money-chip rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold",
              !activeCategory
                ? "money-chip-on border-gold/40 bg-active-bg text-gold"
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
                "money-chip rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold",
                activeCategory === c.id
                  ? "money-chip-on border-gold/40 bg-active-bg text-gold"
                  : "border-line text-muted hover:text-ink",
              )}
            >
              {/* The dot is the same colour the row's spine uses, so a filter and the
                  entries it selects are visibly the same thing. */}
              <i className="money-chip-dot" style={{ background: c.color ?? "var(--color-faint)" }} />
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <Panel
        className={transactions.length === 0 ? "money-empty-panel" : "money-summary-panel"}
      >
        {transactions.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={
              isCurrentMonth ? "Nothing logged this month" : `Nothing logged in ${monthLabel(month)}`
            }
            description="Add what you spend as you spend it — that is the whole trick."
            action={
              <Link
                href={`${base}&new=expense`}
                className={buttonClasses("primary", "money-premium-button")}
              >
                Add entry
              </Link>
            }
          />
        ) : (
          <div className="money-ledger">
            {days.map((day) => {
              const rows = transactions.filter((t) => t.occurred_on === day);
              const dayTotal = rows
                .filter((t) => t.kind === "expense")
                .reduce((sum, t) => sum + (Number(t.amount_rsd) || 0), 0);
              return (
                <div key={day} className="money-day">
                  <div className="money-day-head flex items-center justify-between border-b border-line-soft px-4 py-2">
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
