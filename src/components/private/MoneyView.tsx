"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CornerUpLeft, Plus, Wallet, Pencil } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { loadCategoryHistory } from "@/app/(app)/private/actions";
import type { CategoryHistory } from "@/lib/data/money";
import { CategoryHistoryPanel } from "./CategoryHistoryPanel";
import { FilterChip, LedgerControls } from "./LedgerControls";
import { siftEntries, type EntrySort } from "@/lib/money/entry-search";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { buttonClasses } from "@/components/ui/Button";
import { removeTransaction } from "@/app/(app)/private/actions";
import {
  UNCATEGORIZED_CATEGORY_ID,
  formatAmount,
  monthLabel,
  monthRange,
  shiftMonth,
  shortMonthLabel,
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
            {/*
              The time leads the line when there is one — it is the only part of a row
              that says *when within the day*, and reading it first is how a list of a
              Saturday's spending turns back into a Saturday.
            */}
            {tx.occurred_at ? `${String(tx.occurred_at).slice(0, 5)} · ` : ""}
            {belongsTo ? `${belongsTo} · ` : ""}
            {tx.account?.name ?? "No account"}
            {/*
              Which budget it was filed into, on the row itself.

              This is the fact that makes the rest of the app add up. An entry put into a
              budget by hand is counted by that budget and by nothing else — so a 14.737
              dinner filed into `na moru` is real Eating out spending in the breakdown and
              not a dinar against the monthly Eating out limit. Both readings are correct
              and together they look like the app moving money about, until the row says
              where the money went. It is drawn like the filing it is, not like a category.
            */}
            {tx.budget?.name && (
              <>
                {" · "}
                <span className="money-row-filed">{tx.budget.name}</span>
              </>
            )}
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

const KIND_LABEL: Record<string, string> = {
  expense: "Spent",
  income: "Came in",
  saving: "Into a goal",
  withdraw: "Out of a goal",
  transfer: "Moved",
};

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
  limits: Record<string, { limit: number; counted: number }>;
}) {
  const { fmt } = useMoney();
  const router = useRouter();
  const base = `/private/money?month=${month}`;
  const hasUncategorized = summary.byCategory.some(
    (category) => category.id === UNCATEGORIZED_CATEGORY_ID,
  );

  /*
    The rail offers the categories this month actually has, biggest first.

    It used to list every category on the profile. That is a rail of forty chips, most of
    which filter to nothing — a control whose commonest outcome is an empty screen, and
    which buries the four you spent on behind twenty you did not. Worse, it is a horizontal
    scroll: the chips that matter are not even the ones you can see.

    Ordering by what was spent makes it read the same way as the breakdown above it, so
    the panel and its filter agree about what this month was. The one you are filtered to
    is kept whatever it cost, because a chip that vanishes when you press it is a chip
    that cannot be pressed again to leave.
  */
  /*
    Which category's year is open, if any. Held apart from the entry panel: they are two
    different things in the same drawer, and folding them into one state would mean
    closing a history to edit an entry and losing the history.
  */
  const [historyOf, setHistoryOf] = useState<{ id: string; name: string } | null>(null);
  const [history, setHistory] = useState<CategoryHistory | null>(null);
  const [historyPending, startHistory] = useTransition();

  /*
    Read where the click is, not in an effect inside the panel.

    A panel that fetches for itself has to work out when its answer has gone stale, and
    two categories opened in quick succession would race to fill the same drawer — the
    slower one winning, which is the wrong one. Here the request belongs to the click
    that made it, and the panel is handed a result or a wait.
  */
  const openHistory = (id: string, name: string) => {
    setHistoryOf({ id, name });
    setHistory(null);
    startHistory(async () => {
      const data = await loadCategoryHistory(id);
      setHistory(data);
    });
  };

  // `Uncategorized` is not in the category list — it is the absence of one — so it has
  // to be named here or the door would never appear on the one filter that needs it most.
  const activeCategoryName =
    activeCategory === UNCATEGORIZED_CATEGORY_ID
      ? "Uncategorized"
      : (categories.find((c) => c.id === activeCategory)?.name ?? null);

  const railCategories = useMemo(() => {
    const spent = new Map(summary.byCategory.map((c) => [c.id, c.spent]));
    return categories
      .filter((c) => (spent.get(c.id) ?? 0) > 0 || c.id === activeCategory)
      .sort((a, b) => (spent.get(b.id) ?? 0) - (spent.get(a.id) ?? 0));
  }, [categories, summary.byCategory, activeCategory]);
  const close = () => router.push(base + (activeCategory ? `&cat=${activeCategory}` : ""));

  /*
    Searching and ordering the month you are already looking at.

    Every entry is in hand, so this is a filter over an array and the list narrows as you
    type — no query, no waiting. Scoped to the month on purpose: the picker at the top of
    this screen governs everything under it, and a search that quietly reached across
    twelve months would be the one control on the page that ignored it. A category's whole
    year is one tap away, under the rail, where it is labelled as a year.
  */
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<EntrySort>("newest");
  const [account, setAccount] = useState("");
  const [kind, setKind] = useState("");
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");

  // Only the accounts and kinds this month actually contains — a filter that can only
  // ever return nothing is a filter that should not be offered.
  const accountNames = useMemo(() => {
    const seen = new Set<string>();
    for (const t of transactions) if (t.account?.name) seen.add(t.account.name);
    return [...seen].sort();
  }, [transactions]);

  const kinds = useMemo(() => {
    const seen = new Set<string>();
    for (const t of transactions) seen.add(t.kind);
    return [...seen].sort();
  }, [transactions]);

  const hasUnpriced = useMemo(
    () => transactions.some((t) => t.amount_rsd === null),
    [transactions],
  );

  const shown = useMemo(() => {
    const sifted = siftEntries(
      transactions,
      { query, accountName: account, unpricedOnly, from: fromDay, to: toDay },
      sort,
    );
    return kind ? sifted.filter((t) => t.kind === kind) : sifted;
  }, [transactions, query, account, unpricedOnly, sort, kind, fromDay, toDay]);

  /*
    What each chip is worth, against everything else that is already on.

    A count over the whole month would be the easy number and the wrong one: search
    "kafa", and a `Bank` chip still promising 33 is promising the month, not the search.
    So every count is taken with that chip's own facet swapped in and the rest of the
    filters left standing — which makes it exactly the number of rows you get for
    pressing it. A chip that comes out at zero stays drawn and stops being pressable,
    because a row that reshuffles itself as you narrow is worse than a quiet dead chip.
  */
  const facets = useMemo(() => {
    const rows = (over: { account?: string; unpriced?: boolean }) =>
      siftEntries(
        transactions,
        {
          query,
          accountName: over.account ?? account,
          unpricedOnly: over.unpriced ?? unpricedOnly,
          from: fromDay,
          to: toDay,
        },
        "newest",
      );
    const ofKind = (list: { kind: string }[]) => (kind ? list.filter((t) => t.kind === kind) : list);
    return {
      // Its own facet swapped in: pressing this kind replaces whichever kind is on.
      kind: (k: string) => rows({}).filter((t) => t.kind === k).length,
      account: (a: string) => ofKind(rows({ account: a })).length,
      unpriced: () => ofKind(rows({ unpriced: true })).length,
    };
  }, [transactions, query, account, kind, unpricedOnly, fromDay, toDay]);

  const narrowed =
    query.trim() !== "" || account !== "" || kind !== "" || unpricedOnly || fromDay !== "" || toDay !== "";

  /*
    Grouping by day only survives while the order is chronological. Sorted by size the days
    interleave, and a heading that appears three times down one list has stopped being a
    heading — so the date moves onto the row instead.
  */
  const grouped = sort === "newest" || sort === "oldest";
  const days = [...new Set(shown.map((t) => t.occurred_on))];
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
      {(railCategories.length > 0 || hasUncategorized) && (
        <CategoryFilterRail
          categories={railCategories}
          activeCategory={activeCategory}
          base={base}
          showUncategorized={hasUncategorized}
        />
      )}

      {/*
        The door to the year, and only once a category is actually being looked at.

        The rail's job is to filter this month, and it should keep doing exactly that —
        turning every chip into a menu would make the common action ambiguous. But once
        you have picked a category, the question that follows is always the same one: is
        this month normal for it. That question gets one line, here, where it is asked.
      */}
      {activeCategoryName && (
        <button
          type="button"
          onClick={() => openHistory(activeCategory!, activeCategoryName)}
          className="money-cat-year"
        >
          <span className="money-cat-year-name">{activeCategoryName}</span>
          <span className="money-cat-year-say">
            Is this month normal for it? See the last year
          </span>
          <span className="money-cat-year-go" aria-hidden>
            →
          </span>
        </button>
      )}

      {/*
        The month you are looking at, narrowed.

        Above the list rather than inside it: this is how you decide what the list should
        be, and a control buried among its own results is one people stop finding. It only
        appears once there is something to search — a screen with three entries does not
        need a search box, it needs the three entries.
      */}
      {transactions.length > 2 && (
        <div className="mb-3">
          <LedgerControls
            query={query}
            onQuery={setQuery}
            sort={sort}
            onSort={setSort}
            from={fromDay}
            to={toDay}
            onFrom={setFromDay}
            onTo={setToDay}
            minDate={monthRange(month).from}
            maxDate={monthRange(month).to}
            placeholder="Search name, note, account or amount"
            label={`Search ${monthLabel(month)}`}
          >
            {kinds.length > 1 &&
              kinds.map((k) => (
                <FilterChip
                  key={k}
                  on={kind === k}
                  count={facets.kind(k)}
                  onClick={() => setKind(kind === k ? "" : k)}
                >
                  {KIND_LABEL[k] ?? k}
                </FilterChip>
              ))}
            {accountNames.length > 1 &&
              accountNames.map((a) => (
                <FilterChip
                  key={a}
                  on={account === a}
                  count={facets.account(a)}
                  onClick={() => setAccount(account === a ? "" : a)}
                >
                  {a}
                </FilterChip>
              ))}
            {hasUnpriced && (
              <FilterChip
                on={unpricedOnly}
                count={facets.unpriced()}
                onClick={() => setUnpricedOnly(!unpricedOnly)}
              >
                No price yet
              </FilterChip>
            )}
          </LedgerControls>

          {/*
            What the narrowing costs and what it found, said out loud. A list that is
            quietly showing a fifth of the month is how somebody concludes the month was
            cheap.
          */}
          {narrowed && (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11.5px] text-muted">
              <span>
                {shown.length} of {transactions.length}{" "}
                {transactions.length === 1 ? "entry" : "entries"}
              </span>
              <span className="mono">
                {fmt(
                  shown
                    .filter((t) => t.kind === "expense")
                    .reduce((sum, t) => sum + (Number(t.amount_rsd) || 0), 0),
                )}{" "}
                <span className="text-faint">spent</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setAccount("");
                  setKind("");
                  setUnpricedOnly(false);
                  setFromDay("");
                  setToDay("");
                }}
                className="ml-auto font-semibold text-gold-hi"
              >
                Clear
              </button>
            </p>
          )}
        </div>
      )}

      <Panel
        className={shown.length === 0 ? "money-empty-panel" : "money-summary-panel"}
      >
        {transactions.length > 0 && shown.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nothing matches that"
            description="Try fewer words, or clear the filters above."
          />
        ) : transactions.length === 0 ? (
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
            {grouped ? (
              days.map((day) => {
                const rows = shown.filter((t) => t.occurred_on === day);
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
              })
            ) : (
              /*
                Sorted by size the days no longer run in order, so there is nothing for a
                day heading to head. The date is already on every row's second line, which
                is where it has to be read from here.
              */
              <div className="money-day">
                {shown.map((t) => (
                  <Row key={t.id} tx={t} month={month} />
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>

      <SlideOver
        open={historyOf !== null}
        onClose={() => setHistoryOf(null)}
        title={historyOf ? `${historyOf.name} · last 12 months` : ""}
      >
        {historyOf && (
          <CategoryHistoryPanel
            history={history}
            name={historyOf.name}
            loading={historyPending}
          />
        )}
      </SlideOver>

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




