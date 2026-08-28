"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  monthLabel,
  shiftMonth,
  shortMonthLabel,
  UNCATEGORIZED_CATEGORY_ID,
} from "@/lib/money";
import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import type { MoneyCategory, TransactionRow } from "@/lib/types";
import { TransactionForm, type TxFormData } from "./TransactionForm";
import { OnHandBand } from "./OnHandBand";
import { NetKpi } from "./NetKpi";
import { LoansPanel } from "./LoansPanel";
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
  /*
    Dashed, because these two turn around.

    The solid arrows describe a movement that is finished: the money went into a goal,
    or came back out. A loan has not finished — it left, and it is coming back, or it
    arrived and it is going. The broken line is the only part of the glyph that can
    say "not yet" without a word.
  */
  loan_out: "⇢",
  loan_in: "⇠",
};
/*
  Five kinds, three tiers of loudness.

  Income and spend are coloured because they change what you have. `transfer` does not —
  it is the same money in a different place — so it drops below both, onto `faint`, and
  lets the `\u21c4` do the identifying. An accent of its own would put a movement of nothing
  on the same footing as money arriving, which is the one thing this row must not say.
*/
const TONE: Record<string, string> = {
  expense: "text-spend",
  income: "text-ok",
  saving: "text-held",
  withdraw: "text-muted",
  transfer: "text-faint",
  // Neither spending nor earning, so neither colour. The glyph carries the identity.
  loan_out: "text-muted",
  loan_in: "text-muted",
};

function CategoryFilterRail({
  categories,
  activeCategory,
  base,
  showUncategorized,
}: {
  categories: MoneyCategory[];
  activeCategory?: string;
  base: string;
  showUncategorized: boolean;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false, overflow: false });

  const readEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const overflow = rail.scrollWidth > rail.clientWidth + 2;
    setEdges({
      start: rail.scrollLeft <= 2,
      end: !overflow || rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2,
      overflow,
    });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    readEdges();
    rail.addEventListener("scroll", readEdges, { passive: true });
    const resize = new ResizeObserver(readEdges);
    resize.observe(rail);
    return () => {
      rail.removeEventListener("scroll", readEdges);
      resize.disconnect();
    };
  }, [readEdges, categories.length]);

  useEffect(() => {
    const active = railRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest", inline: "center" });
    readEdges();
  }, [activeCategory, readEdges]);

  const move = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({
      left: direction * Math.max(240, rail.clientWidth * 0.72),
      behavior: reduced ? "auto" : "smooth",
    });
  };

  const chipClass = (active: boolean) =>
    cn(
      "money-chip shrink-0 rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold",
      active
        ? "money-chip-on border-gold/40 bg-active-bg text-gold"
        : "border-line text-muted hover:text-ink",
    );

  return (
    <div
      className={cn(
        "money-chip-rail mb-3",
        !edges.overflow && "is-idle",
        edges.overflow && !edges.start && "has-start-fade",
        edges.overflow && !edges.end && "has-end-fade",
      )}
    >
      <button
        type="button"
        className="money-chip-arrow"
        onClick={() => move(-1)}
        disabled={!edges.overflow || edges.start}
        aria-label="Previous categories"
      >
        <ChevronLeft aria-hidden="true" />
      </button>

      <div ref={railRef} className="money-chips">
        <Link href={base} className={chipClass(!activeCategory)} aria-current={!activeCategory ? "page" : undefined}>
          All
        </Link>
        {showUncategorized && (
          <Link
            href={`${base}&cat=${UNCATEGORIZED_CATEGORY_ID}`}
            className={chipClass(activeCategory === UNCATEGORIZED_CATEGORY_ID)}
            aria-current={activeCategory === UNCATEGORIZED_CATEGORY_ID ? "page" : undefined}
          >
            Uncategorized
          </Link>
        )}
        {categories.map((category) => {
          const active = activeCategory === category.id;
          return (
            <Link
              key={category.id}
              href={`${base}&cat=${category.id}`}
              className={chipClass(active)}
              aria-current={active ? "page" : undefined}
            >
              {category.name}
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        className="money-chip-arrow"
        onClick={() => move(1)}
        disabled={!edges.overflow || edges.end}
        aria-label="Next categories"
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}

function Row({ tx, month }: { tx: TransactionRow; month: string }) {
  const { fmt } = useMoney();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  /*
    The name the entry was given leads; what it belongs to moves to the line underneath.

    Money going into a goal used to show as the goal's bare name — a row reading
    "nesto − 2.000" next to a row reading "Groceries − 670", which is the app telling
    you that you spent money you have not spent. A movement says which direction it
    went in words, and the goal it went to sits under it with the account.
  */
  /*
    What was in the bag, foldable.

    A receipt you cannot read back is half a feature — the list would exist in the
    database and be reachable only by opening the edit form, which is a strange place
    to go to remember whether you bought milk. Folded by default because the ledger is
    a list of movements first, and a row that unfolded itself would turn six entries
    into a page.
  */
  const items = tx.items ?? [];
  const [openItems, setOpenItems] = useState(false);

  const movement =
    tx.kind === "saving" ? "Put aside" : tx.kind === "withdraw" ? "Taken back out" : null;
  /*
    An entry with a list and no shop name is not nameless — it is the list.

    The fallback chain used to end at the category, so a receipt with six things on it
    and no shop typed against it showed as "Groceries", which is the one thing on the
    row you could already see from its colour. The first item and a count says more in
    the same space, and it is the entry's own words.
  */
  const fromList =
    items.length > 0
      ? items.length === 1
        ? items[0].name
        : `${items[0].name} +${items.length - 1}`
      : null;
  const label = tx.title ?? movement ?? fromList ?? tx.category?.name ?? tx.note ?? "—";
  const belongsTo = movement
    ? [tx.title ? movement : null, tx.goal?.name].filter(Boolean).join(" · ") || null
    : tx.title
      ? (tx.category?.name ?? null)
      : null;
  return (
    <div className="money-row group border-b border-line-soft last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span
          className="money-row-spine h-7 w-1 shrink-0 rounded-pill"
          /* Rhythm down the list, not identity: the category is named on the line below. */
          style={{ background: "var(--color-faint)" }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{label}</div>
          <div className="truncate text-[11.5px] text-muted">
            {belongsTo ? `${belongsTo} · ` : ""}
            {tx.account?.name ?? "No account"}
            {tx.note && label !== tx.note ? ` · ${tx.note}` : ""}
            {items.length > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setOpenItems((v) => !v)}
                  aria-expanded={openItems}
                  className="money-row-items-toggle"
                >
                  {items.length} {items.length === 1 ? "item" : "items"}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {/*
            An entry can be logged before its price is known, and a row that showed `0`
            for one would be indistinguishable from a real zero — the month would look
            cheaper than it was and nothing on screen would say why. So it says what it
            is, in the quietest tone here: not an error, an entry still open. Filling it
            in happens on the overview, where they are gathered in one panel.
          */}
          {tx.amount_rsd === null ? (
            <div className="text-[12px] font-semibold text-faint">no price yet</div>
          ) : (
            <>
              <div className={cn("mono text-[13.5px] font-semibold", TONE[tx.kind])}>
                {SIGN[tx.kind]} {fmt(Number(tx.amount_rsd))}
              </div>
              {tx.currency !== "RSD" && (
                <div className="mono text-[11px] text-faint">
                  {formatAmount(Number(tx.amount), tx.currency)}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Link
            href={`/private/money?month=${month}&edit=${tx.id}`}
            aria-label="Edit entry"
            title="Edit entry"
            className="zv-rowctrl"
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
      {openItems && items.length > 0 && (
        <ul className="money-row-items">
          {items.map((item, n) => (
            <li key={`${item.name}-${n}`}>
              <span className="truncate">
                {item.name}
                {item.qty > 1 && <i>×{item.qty}</i>}
              </span>
              {/*
                A line without a figure says so rather than printing zero — the same
                rule the amount column above it follows, for the same reason.
              */}
              <span className="mono">
                {item.amount > 0 ? formatAmount(item.amount, tx.currency) : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
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
  incomeOnFile,
  panel,
  activeCategory,
  limits,
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
  /** Whether anything is on file as income at all — see `monthNetNote`. */
  incomeOnFile: boolean;
  panel: MoneyPanel;
  activeCategory?: string;
  /** Monthly cap per category id, for the ones that have one — see `SpendBreakdown`. */
  limits: Record<string, number>;
}) {
  const { fmt } = useMoney();
  const router = useRouter();
  const base = `/private/money?month=${month}`;
  const hasUncategorized = summary.byCategory.some(
    (category) => category.id === UNCATEGORIZED_CATEGORY_ID,
  );
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
        {/*
          Nothing can be recorded without an account to record it against, so with none
          the button stops offering a form and starts pointing at the one thing that
          has to happen first. A form that cannot be submitted is not an empty state —
          it is a dead end with a cursor in it.
        */}
        {data.accounts.length === 0 ? (
          <Link
            href="/private/setup#setup-accounts"
            className={buttonClasses("primary", "money-premium-button")}
          >
            <Plus className="h-4 w-4" />
            Add an account
          </Link>
        ) : (
          <Link
            href={`${base}&new=expense`}
            className={buttonClasses("primary", "money-premium-button")}
          >
            <Plus className="h-4 w-4" />
            Add
          </Link>
        )}
      </div>

      <div className="mb-4">
        <OnHandBand onHand={onHand} accounts={balances} />
      </div>

      <div className="money-card-grid mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          className="money-card-premium"
          label="Spent"
          value={fmt(summary.expense)}
        />
        <Kpi
          className="money-card-premium"
          label="Income"
          value={fmt(summary.income)}
        />
        <Kpi
          className="money-card-premium"
          label="Put aside"
          value={fmt(summary.saved)}
          hint={
            summary.withdrawn > 0
              ? `After ${fmt(summary.withdrawn)} taken back out`
              : undefined
          }
        />
        <NetKpi
          className="money-card-premium"
          net={summary.net}
          income={summary.income}
          saved={summary.saved}
          incomeOnFile={incomeOnFile}
        />
      </div>

      {/*
        Debts sit above the breakdown, not below the ledger.

        What is owed is a standing fact about the money, closer in kind to the figures
        at the top than to this month's entries — and a panel under a list that can run
        to two hundred rows is a panel nobody scrolls to.
      */}
      <div className="mb-4">
        <LoansPanel loans={data.loans} />
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
          limits={limits}
        />
      </div>

      {/* Category filter */}
      {(categories.length > 0 || hasUncategorized) && (
        <CategoryFilterRail
          categories={categories}
          activeCategory={activeCategory}
          base={base}
          showUncategorized={hasUncategorized}
        />
      )}

      <Panel
        className={transactions.length === 0 ? "money-empty-panel" : "money-summary-panel"}
      >
        {transactions.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={
              data.accounts.length === 0
                ? "No accounts yet"
                : isCurrentMonth
                  ? "Nothing logged this month"
                  : `Nothing logged in ${monthLabel(month)}`
            }
            description={
              data.accounts.length === 0
                ? "Every entry has to land somewhere. Add the account your money sits in and this screen starts working."
                : "Add what you spend as you spend it — that is the whole trick."
            }
            action={
              <Link
                href={
                  data.accounts.length === 0
                    ? "/private/setup#setup-accounts"
                    : `${base}&new=expense`
                }
                className={buttonClasses("primary", "money-premium-button")}
              >
                {data.accounts.length === 0 ? "Go to Setup" : "Add entry"}
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
                      <span className="mono text-[11px] text-faint">−{fmt(dayTotal)}</span>
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
