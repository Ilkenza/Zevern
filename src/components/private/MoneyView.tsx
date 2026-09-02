"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ChevronLeft, ChevronRight, CornerUpLeft, Loader2, Pencil, Plus, Wallet } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { loadCategoryHistory } from "@/app/(app)/private/actions";
import type { CategoryHistory } from "@/lib/data/money";
import { CategoryHistoryPanel } from "./CategoryHistoryPanel";
import { ListBar } from "@/components/ui/ListBar";
import { SortPicker } from "@/components/ui/SortPicker";
import {
  ENTRY_SORTS,
  siftEntries,
  type EntrySort,
  type SortWay,
} from "@/lib/money/entry-search";
import { RANGE_OPTIONS, type RangeKey } from "@/lib/money/date-range";
import { sumEntries } from "@/lib/money/summary";
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
  shiftMonth,
  shortMonthLabel,
} from "@/lib/money";
import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import type { MoneyCategory, TransactionRow } from "@/lib/types";
import { TransactionForm, type TxFormData } from "./TransactionForm";
import { AccountsStrip } from "./AccountsStrip";
import { NetKpi } from "./NetKpi";
import { LoansPanel } from "./LoansPanel";
import { SpendBreakdown } from "./SpendBreakdown";
import type { AccountBalance, MonthSummary } from "@/lib/data/money";

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

/**
 * How many rows are drawn at once. Everything else on the screen still counts them all.
 *
 * `All time` is nineteen hundred entries and rising, and every one of them was being
 * rendered into the page whether or not anybody scrolled that far — about five megabytes
 * of markup for a screen whose first question is answered by the figures at the top. A
 * hundred is more than an ordinary month holds, so the usual view is untouched, and it is
 * deep enough that "what did I spend last week" is never behind a button.
 */
const LEDGER_PAGE = 100;

/*
  One empty array, shared.

  It is a default for a prop that several memos depend on, and `= []` in the parameter
  list builds a new one on every render — which makes every one of those memos recompute
  every time anything on this screen changes. A single frozen instance is the same default
  and a stable identity.
*/
const NO_CATEGORIES: string[] = [];

/**
 * The ledger, drawn a page at a time.
 *
 * What is drawn is not what is counted: the figures, the breakdown and the chip counts
 * above all read the whole filtered span, and the search still runs over every row in it.
 * This only governs how much of the answer is put on screen at once — so nothing here can
 * make a number wrong, which is the property that had to hold before the window was worth
 * having at all.
 *
 * Its own component so the window can be reset by remounting it: the caller keys it on
 * the filters, and a new key is a fresh first page without an effect to keep in step.
 */
function Ledger({
  rows,
  grouped,
  base,
}: {
  rows: TransactionRow[];
  /** Date order, where the day headings mean something. */
  grouped: boolean;
  base: string;
}) {
  const { fmt } = useMoney();
  const [drawn, setDrawn] = useState(LEDGER_PAGE);

  /*
    The cut is rounded up to the end of a day.
    
    A day heading carries that day's total, and a day split across the boundary would
    print the whole day's total over some of its rows — a heading that does not add up to
    what is under it. Whole days cost a handful of extra rows and keep the arithmetic on
    screen true.
  */
  let cut = Math.min(drawn, rows.length);
  if (grouped && cut > 0 && cut < rows.length) {
    const day = rows[cut - 1].occurred_on;
    while (cut < rows.length && rows[cut].occurred_on === day) cut += 1;
  }
  const visible = rows.slice(0, cut);
  const rest = rows.length - visible.length;
  const days = [...new Set(visible.map((t) => t.occurred_on))];

  return (
    <div className="money-ledger">
      {grouped ? (
        days.map((day) => {
          const dayRows = visible.filter((t) => t.occurred_on === day);
          const dayTotal = dayRows
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
              {dayRows.map((t) => (
                <Row key={t.id} tx={t} base={base} />
              ))}
            </div>
          );
        })
      ) : (
        /*
          Sorted by size the days no longer run in order, so there is nothing for a day
          heading to head. The date is already on every row's second line, which is where
          it has to be read from here.
        */
        <div className="money-day">
          {visible.map((t) => (
            <Row key={t.id} tx={t} base={base} dated />
          ))}
        </div>
      )}

      {/*
        The count says how many are still behind it, because a list that stops without
        saying so is a screen quietly lying about the size of your year.
      */}
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setDrawn(cut + LEDGER_PAGE)}
          className="zv-more"
        >
          <span className="inline-flex items-center gap-1.5">
            Show {Math.min(rest, LEDGER_PAGE)} more
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="mono text-[11px] text-faint">
            {visible.length} of {rows.length} drawn
          </span>
        </button>
      )}
    </div>
  );
}

function Row({
  tx,
  base,
  dated = false,
}: {
  tx: TransactionRow;
  /** The screen's own address, span and all — the edit form has to come back to it. */
  base: string;
  /**
   * Carry the day, because nothing above the row is carrying it.
   *
   * In date order the day is a heading over a group of rows and printing it again on each
   * of them would be the same word six times. Ordered by size there are no groups and no
   * headings — and the list lost the date entirely: ten identical `Plata — Milica` rows at
   * `94.500 RSD`, with nothing on screen to say which month any of them was.
   */
  dated?: boolean;
}) {
  const { fmt } = useMoney();
  const [error, setError] = useState<string | null>(null);
  /*
    On its way out, and saying so.

    Three arrangements were tried. Closing the dialog when the action resolved left the row
    on screen afterwards; holding the dialog open until the refresh landed left the
    confirmation up after the decision; hiding the row on the spot made both instant and
    told a small lie — the entry was still in the database for another second, and if the
    delete failed the row reappeared out of nowhere.

    So the row neither stays nor vanishes: it goes quiet and spins where its buttons were,
    from the moment you confirm until the moment it is actually gone. The dialog closes at
    once, because its question has been answered, and nothing on screen claims anything
    that is not true yet.
  */
  const [removing, setRemoving] = useState(false);
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
    <div
      className={cn(
        "money-row group border-b border-line-soft last:border-b-0",
        removing && "is-removing",
      )}
      aria-busy={removing || undefined}
    >
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
            {dated && <span className="mono text-faint">{tx.occurred_on} · </span>}
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
          {/*
            While it is going, the two controls are replaced rather than disabled.

            A greyed-out bin still reads as a button you may press again, and pressing it
            twice is a second delete of a row that is already halfway out. One spinner in
            their place says the only true thing: this is in progress, and there is nothing
            to do about it but wait.
          */}
          {removing ? (
            <span className="money-row-going" role="status" aria-label="Deleting this entry">
              <Loader2 className="h-3.75 w-3.75 animate-spin" aria-hidden="true" />
            </span>
          ) : (
            <>
          <Link
            href={`${base}&edit=${tx.id}`}
            aria-label="Edit entry"
            title="Edit entry"
            className="zv-rowctrl"
          >
            <Pencil className="h-3.75 w-3.75" />
          </Link>
          <DeleteButton
            compact
            label="Delete entry"
            confirmText="Delete this entry? Balances and the totals above are recalculated without it."
            action={async () => {
              setRemoving(true);
              const result = await removeTransaction(tx.id);
              // On success the row leaves with the next list; only a refusal puts it back.
              if (result?.error) {
                setRemoving(false);
                setError(result.error);
              }
            }}
          />
            </>
          )}
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

/*
  What each kind is called in this list, in the ledger's voice rather than the form's.

  `Spent` and `Came in` rather than `Expense` and `Income`, because the filter is asking
  what happened, not what to file. The two debt kinds were simply missing, so the toolbar
  printed the column values — `loan_in (2)`, `loan_out (3)` — which is the database
  answering a question the reader asked in English. They are named for the direction the
  money went, which is the only thing the ledger knows: the story is on the debt.
*/
const KIND_LABEL: Record<string, string> = {
  expense: "Spent",
  income: "Came in",
  saving: "Into a goal",
  withdraw: "Out of a goal",
  transfer: "Moved",
  loan_out: "Out on a debt",
  loan_in: "In on a debt",
  correction: "Balance correction",
};

export function MoneyView({
  month,
  currentMonth,
  today,
  range,
  spanFrom,
  spanTo,
  transactions,
  summary,
  categories,
  data,
  balances,
  incomeOnFile,
  panel,
  activeCategories = NO_CATEGORIES,
  limits,
}: {
  month: string;
  /** Decided on the server, so hydration can never disagree about what today is. */
  currentMonth: string;
  today: string;
  /*
    Which span the screen is standing in, and the two days it works out to.

    It lives in the address rather than in this component, because it is not a filter
    over what has been loaded — it decides what gets loaded. Keeping it there is what
    makes the figures at the top, the breakdown and the list read the same window by
    construction instead of by agreement, and it makes a span something you can link to.
  */
  range: RangeKey;
  spanFrom: string;
  spanTo: string;
  transactions: TransactionRow[];
  summary: MonthSummary;
  categories: MoneyCategory[];
  data: TxFormData;
  balances: AccountBalance[];
  /** Whether anything is on file as income at all — see `monthNetNote`. */
  incomeOnFile: boolean;
  panel: MoneyPanel;
  /**
   * The categories the screen is standing in, from the address.
   *
   * A list rather than one id, because "groceries and eating out, together" is a question
   * a ledger is asked constantly and answering it one category at a time is arithmetic
   * done in the reader's head. Empty is every category.
   */
  activeCategories?: string[];
  /** Monthly cap per category id, for the ones that have one — see `SpendBreakdown`. */
  limits: Record<string, { limit: number; counted: number }>;
}) {
  const { fmt } = useMoney();
  const router = useRouter();
  /*
    The scope, as the address writes it — and the prefix under every link on this page,
    so following a category out of the breakdown does not silently put you back on a
    month you were not looking at.
  */
  const scope =
    range === "month"
      ? `month=${month}`
      : range === "custom"
        ? `range=custom${spanFrom ? `&from=${spanFrom}` : ""}${spanTo ? `&to=${spanTo}` : ""}`
        : `range=${range}`;
  const base = `/private/money?${scope}`;
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

  /*
    The one category being looked at, when there is exactly one.

    Several things on this screen are about a single category and stay that way on
    purpose: the door to its year, the chip lit in the breakdown, the empty state that
    names it. None of them has a sensible reading over three at once — "is this month
    normal for groceries, eating out and taxis" is not a question — so they are drawn for
    one and absent for several, rather than made vague enough to cover both.
  */
  const oneCategory = activeCategories.length === 1 ? activeCategories[0] : null;
  /** What to hang on an address to keep the current categories on it. */
  const catQuery = activeCategories.length ? `&cat=${activeCategories.join(",")}` : "";

  // `Uncategorized` is not in the category list — it is the absence of one — so it has
  // to be named here or the door would never appear on the one filter that needs it most.
  const activeCategoryName =
    oneCategory === UNCATEGORIZED_CATEGORY_ID
      ? "Uncategorized"
      : (categories.find((c) => c.id === oneCategory)?.name ?? null);

  const railCategories = useMemo(() => {
    const spent = new Map(summary.byCategory.map((c) => [c.id, c.spent]));
    return categories
      .filter((c) => (spent.get(c.id) ?? 0) > 0 || activeCategories.includes(c.id))
      .sort((a, b) => (spent.get(b.id) ?? 0) - (spent.get(a.id) ?? 0));
  }, [categories, summary.byCategory, activeCategories]);
  const close = () => router.push(base + catQuery);

  /*
    Searching and ordering the month you are already looking at.

    Every entry is in hand, so this is a filter over an array and the list narrows as you
    type — no query, no waiting. Scoped to the month on purpose: the picker at the top of
    this screen governs everything under it, and a search that quietly reached across
    twelve months would be the one control on the page that ignored it. A category's whole
    year is one tap away, under the rail, where it is labelled as a year.
  */
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<EntrySort>("date");
  const [way, setWay] = useState<SortWay>("asc");
  /*
    Accounts and kinds are answered with a list too, for the same reason the categories
    are: `Bank and Cash` and `spent or set aside` are ordinary questions, and a control
    that only takes one answer turns them into two readings to hold side by side. Empty is
    every one of them, which is what makes "no filter" and "all of them" the same state
    rather than two.
  */
  const [onAccounts, setOnAccounts] = useState<string[]>([]);
  const [onKinds, setOnKinds] = useState<string[]>([]);
  const [unpricedOnly, setUnpricedOnly] = useState(false);

  /*
    Changing the span is a navigation, not a keystroke.

    The server reads the ledger by span, so "Last 3 months" is a different request and
    not a filter over the month already in hand. Pushing it into the address is what
    keeps the four figures at the top, the breakdown and the list from ever describing
    different windows — they are all rendered from one read — and it makes a span a
    thing you can bookmark or send to your accountant.
  */
  const goRange = (next: RangeKey, from = spanFrom, to = spanTo) => {
    /*
      The category rides along.

      It did not, and that was a real fault rather than a rough edge: picking a category
      and then asking for `All time` threw the category away and quietly answered a
      different question — the whole ledger, presented as though you had narrowed it.
      Every one of these controls has to survive every other one, or "filter" means
      "the last thing you touched".
    */
    const cat = catQuery;
    if (next === "month") return router.push(`/private/money?month=${month}${cat}`);
    if (next === "custom") {
      const params = new URLSearchParams({ range: "custom" });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return router.push(`/private/money?${params.toString()}${cat}`);
    }
    router.push(`/private/money?range=${next}${cat}`);
  };

  /** Narrowing by category is a different read, so the figures follow it too. */
  const goCategories = (next: string[]) =>
    router.push(base + (next.length ? `&cat=${next.join(",")}` : ""));

  /*
    Every account you have, in the order the strip above shows them.

    This used to be built from the rows on screen, on the rule that a filter which can
    only return nothing should not be offered. That rule is right for a kind and wrong for
    an account, and the difference is what the thing is: a kind is a property of an entry,
    while an account is something you own and expect to find in a list of your accounts.
    Because the category is read on the server, standing in `Shopping` left this select
    holding two of eight — the six that had never bought anything had quietly stopped
    existing, which reads as a bug in the app rather than a fact about shopping.

    So the list is yours and it does not move; the counts beside each name say which have
    anything here, and `(0)` is an answer — "nothing on the brokerage account was
    shopping" is worth being able to ask.

    Anything the rows mention that is not in your accounts any more is kept on the end,
    so a renamed or deleted account cannot leave its own entries unfilterable.
  */
  const accountNames = useMemo(() => {
    const names = balances.map((a) => a.name);
    const seen = new Set(names);
    for (const t of transactions) {
      const name = t.account?.name;
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    return names;
  }, [balances, transactions]);

  // A kind, by contrast, is a property of an entry and not a thing you own: offering
  // `Income` inside a category that has never had any is a dead end nobody asked for.

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
    /*
      No dates here any more. The span is applied by the read that fetched these rows,
      and filtering by it a second time on the client would be two implementations of
      one window — the kind of pair that agrees until the day it does not.
    */
    const sifted = siftEntries(
      transactions,
      { query, accountNames: onAccounts, unpricedOnly },
      sort,
      way,
    );
    return onKinds.length ? sifted.filter((t) => onKinds.includes(t.kind)) : sifted;
  }, [transactions, query, onAccounts, unpricedOnly, sort, way, onKinds]);

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
          accountNames: over.account ? [over.account] : onAccounts,
          unpricedOnly: over.unpriced ?? unpricedOnly,
        },
        // Counting, not showing: the order does not matter, only how many survive.
        "date",
      );
    const ofKind = (list: { kind: string }[]) =>
      onKinds.length ? list.filter((t) => onKinds.includes(t.kind)) : list;
    return {
      // Its own facet swapped in: the count is what ticking this one on its own gives.
      kind: (k: string) => rows({}).filter((t) => t.kind === k).length,
      account: (a: string) => ofKind(rows({ account: a })).length,
      unpriced: () => ofKind(rows({ unpriced: true })).length,
    };
  }, [transactions, query, onAccounts, onKinds, unpricedOnly]);

  // The span is not counted as narrowing: it is what the screen is *of*, and it says so
  // in the heading. What is counted is everything that hides rows from the span on screen.
  const narrowed =
    query.trim() !== "" || onAccounts.length > 0 || onKinds.length > 0 || unpricedOnly;

  /*
    Anything at all is on — a category, a span, a search, a chip.

    The bar used to be drawn only when there were more than two entries to sort, which is
    a fine rule for a screen that has just loaded and a trap for one that has been used:
    the category and the span are read on the server, so picking a quiet category leaves
    two rows on the page, and the bar that held the only way back disappears with them.
    A control that hides itself because of what it did is the one thing a filter must
    never do.
  */
  const anythingOn = narrowed || activeCategories.length > 0 || range !== "month";

  /*
    The four figures, over what is actually on screen.

    They used to be the span's totals and nothing else, so filtering to one account, or
    to `Spent`, or searching for "Sardinija", changed the list underneath and left
    `Spent $463,901` sitting above it — a heading describing a page you are no longer
    looking at. Worse than useless: you read the top of the screen and the bottom of the
    screen and take them for one answer, because on every other view of this page they
    are.

    Same arithmetic as the server's, deliberately — expense and income and what went
    into goals, with `withdraw` taken back off what was put away, and `net` as income
    less spending and nothing else. Two readings of one ledger have to be the same
    reading, or the number changes meaning the moment you touch a chip.

    Unnarrowed it hands back the server's own object untouched, so the ordinary case is
    not a client-side re-derivation of a figure that was already correct.
  */
  const scoped = useMemo(() => {
    /*
      A category counts here even though it is not "narrowing" below.

      The span's summary comes off the server without a category in it, so standing in
      one category left the four figures describing everything — the same disagreement
      between the top of the screen and the bottom, arriving by a different door.
    */
    if (!narrowed && activeCategories.length === 0) return summary;
    // The same arithmetic the server ran over the whole span, over the rows left standing.
    return { ...summary, ...sumEntries(shown) };
  }, [narrowed, activeCategories, shown, summary]);

  /*
    Grouping by day only survives while the order is chronological. Sorted by size the days
    interleave, and a heading that appears three times down one list has stopped being a
    heading — so the date moves onto the row instead.
  */
  const grouped = sort === "date";
  const isCurrentMonth = month === currentMonth;
  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  return (
    <div className="money-premium mx-auto max-w-300">
      <div className="money-page-head mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="money-page-kicker">Private · Money</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            {/*
              `Pick dates…` is an instruction on a menu, not a name for a page. Printed
              as the heading it read as though the screen were asking, while the two
              dates it was already showing sat underneath it.
            */}
            {range === "month"
              ? monthLabel(month)
              : range === "custom"
                ? "Chosen dates"
                : (RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "Money")}
          </h1>
          {/*
            A span says which days it turned out to be.

            "Last 3 months" is the instruction, not the answer — and on the 1st of a month
            the two are far enough apart that a figure can look wrong until you know the
            dates. `All time` has no ends to print, so it prints what it has.
          */}
          {range !== "month" && (
            <div className="money-month-nav mt-3">
              <span className="money-month-span">
                {spanFrom || spanTo
                  ? `${spanFrom || "the beginning"} → ${spanTo || "today"}`
                  : "Everything on the ledger"}
              </span>
              <Link href={`/private/money?month=${currentMonth}`} className="money-month-back">
                <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />
                This month
              </Link>
            </div>
          )}
          {/*
            The month you are on is the heading above, so the switcher does not repeat
            it — it names where each step lands instead.
          */}
          <div className="money-month-nav mt-3" hidden={range !== "month"}>
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


      {/*
        Every control on this screen, above everything they change.

        This sat just above the list, which was right for as long as it only filtered the
        list. It stopped being right the moment these started re-scoping the four figures
        and the breakdown: a control *below* the numbers it moves means you press
        something at the bottom of the page and a total quietly changes off-screen above
        you. Whatever decides what the page is has to be readable in the same glance as
        the page.

        Selects, which is the standard on every other list in here, and the only shape
        that survives five axes — a chip row carrying dates, category, kind, account and
        a flag is a wall you read rather than a control you use. Each keeps its count in
        its own label, so the census a chip row showed at rest is one click away.

        Every filter also survives every other one now. Category and span used to be
        mutually destructive: asking for `All time` after picking a category threw the
        category away and answered a different question with a straight face.
      */}
      {(transactions.length > 2 || anythingOn) && (
        <div className="mb-4">
          <ListBar
            query={query}
            onQuery={setQuery}
            searchLabel={
              range === "month" ? `Search ${monthLabel(month)}` : "Search these entries"
            }
            dateRange={{
              value: range,
              onChange: (next) => goRange(next as RangeKey),
              from: spanFrom,
              to: spanTo,
              onFrom: (value) => goRange("custom", value, spanTo),
              onTo: (value) => goRange("custom", spanFrom, value),
              maxDate: today,
            }}
            filters={[
              {
                value: oneCategory ?? "",
                onChange: (next) => goCategories(next ? [next] : []),
                values: activeCategories,
                onValues: goCategories,
                many: "categories",
                label: "Filter by category",
                all: "All categories",
                options: [
                  ...railCategories.map((c) => ({ value: c.id, label: c.name })),
                  ...(hasUncategorized
                    ? [{ value: UNCATEGORIZED_CATEGORY_ID, label: "Uncategorised" }]
                    : []),
                ],
              },
              {
                value: onKinds[0] ?? "",
                onChange: (next) => setOnKinds(next ? [next] : []),
                values: onKinds,
                onValues: setOnKinds,
                many: "kinds",
                label: "Filter by kind",
                all: "Every kind",
                options: kinds.map((k) => ({
                  value: k,
                  label: `${KIND_LABEL[k] ?? k} (${facets.kind(k)})`,
                })),
              },
              {
                value: onAccounts[0] ?? "",
                onChange: (next) => setOnAccounts(next ? [next] : []),
                values: onAccounts,
                onValues: setOnAccounts,
                many: "accounts",
                label: "Filter by account",
                all: "Every account",
                options: accountNames.map((a) => ({
                  value: a,
                  label: `${a} (${facets.account(a)})`,
                })),
              },
              {
                value: unpricedOnly ? "unpriced" : "",
                onChange: (value) => setUnpricedOnly(value === "unpriced"),
                label: "Whether the price is in yet",
                all: "Priced and not",
                // One option, and still a real question: the two sides are on and off,
                // not two values of a field.
                always: hasUnpriced,
                options: hasUnpriced
                  ? [{ value: "unpriced", label: `No price yet (${facets.unpriced()})` }]
                  : [],
              },
            ]}
            shown={shown.length}
            total={transactions.length}
            /*
              Drawn whenever anything is on, not only when the list is shorter than the
              read that fetched it.

              Standing in one category, the server hands back only that category — so the
              rows on screen are all the rows there are, `86 of 86`, and the bar concluded
              nothing was narrowed and took the way out away with it. The one filter that
              needs an escape hatch most had none.
            */
            alwaysClear={anythingOn}
            onClear={() => {
              setQuery("");
              setOnAccounts([]);
              setOnKinds([]);
              setUnpricedOnly(false);
              // The category lives in the address, so clearing it is a navigation.
              if (activeCategories.length > 0) goCategories([]);
            }}
          />
        </div>
      )}
      <div className="mb-4">
        <AccountsStrip accounts={balances} only={onAccounts} />
      </div>

      <div className="money-card-grid mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          className="money-card-premium"
          label="Spent"
          value={fmt(scoped.expense)}
        />
        <Kpi
          className="money-card-premium"
          label="Income"
          value={fmt(scoped.income)}
        />
        <Kpi
          className="money-card-premium"
          label="Put aside"
          value={fmt(scoped.saved)}
          hint={
            scoped.withdrawn > 0
              ? `After ${fmt(scoped.withdrawn)} taken back out`
              : undefined
          }
        />
        <NetKpi
          className="money-card-premium"
          net={scoped.net}
          income={scoped.income}
          saved={scoped.saved}
          incomeOnFile={incomeOnFile}
          scope={range === "month" ? "month" : range === "all" ? "all" : "span"}
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
          byCategory={scoped.byCategory}
          categories={categories}
          total={scoped.expense}
          base={base}
          activeCategory={oneCategory ?? undefined}
          limits={limits}
        />
      </div>

      {/*
        The door to the year, and only once a category is actually being looked at.

        The rail's job is to filter what is on screen, and it should keep doing exactly
        that — turning every chip into a menu would make the common action ambiguous. But
        once you have picked a category, the question that follows is always the same one:
        is this normal for it. That question gets one line, here, where it is asked.

        What is behind the door does not change with the span: the panel is twelve months
        of that category, month by month, whatever this screen is currently showing. So the
        line says what it opens rather than one sentence for every case — on a month that
        is more than you can see and reads as "the last year"; on `All time` it is less
        than you can see, and what it adds is the shape month by month, which is what it
        says instead. A door that promised "the last year" over a four-year figure would be
        offering to show you less while sounding like more.
      */}
      {activeCategoryName && (
        <button
          type="button"
          onClick={() => openHistory(oneCategory!, activeCategoryName)}
          className="money-cat-year"
        >
          <span className="money-cat-year-name">{activeCategoryName}</span>
          <span className="money-cat-year-say">
            {range === "month"
              ? "Is this month normal for it? See the last year"
              : range === "all"
                ? "See it month by month, over the last year"
                : "Is this normal for it? See the last year, month by month"}
          </span>
          <span className="money-cat-year-go" aria-hidden>
            →
          </span>
        </button>
      )}

      {/*
        The order belongs to the list, and only to the list.

        Everything on the bar at the top of this screen re-scopes the whole page — the
        span, the category, the account, the search all move the four figures and the
        breakdown as well as the rows. The order moves nothing but the rows, and a control
        that re-arranges one panel while sitting eight hundred pixels above it is a press
        with no visible effect. It sits on the list's own header instead, which is also
        where a shop, a mailbox and a file browser all put it.
      */}
      <Panel
        className={shown.length === 0 ? "money-empty-panel" : "money-summary-panel"}
        title={shown.length > 0 ? "Entries" : undefined}
        action={
          shown.length > 0 ? (
            <SortPicker
              value={sort}
              onChange={(value) => setSort(value as EntrySort)}
              label="Order the entries"
              options={ENTRY_SORTS}
              direction={way}
              onDirection={setWay}
            />
          ) : undefined
        }
      >
        {transactions.length > 0 && shown.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nothing matches that"
            description="Try fewer words, or clear the filters above."
          />
        ) : transactions.length === 0 && anythingOn && data.accounts.length > 0 ? (
          /*
            Empty because of a filter is not the same as empty.

            The read is done on the server for the category and the span, so both can come
            back with nothing — and the message underneath used to be "Nothing logged this
            month", which is a statement about the month and was false. It is a statement
            about the filter.
          */
          <EmptyState
            icon={Wallet}
            title="Nothing here under this filter"
            description={
              activeCategoryName
                ? `${activeCategoryName} has nothing in this span. The bar above still has every other one.`
                : "Nothing on the ledger falls in this span. The bar above can widen it."
            }
            action={
              <Link
                href={`/private/money?month=${currentMonth}`}
                className={buttonClasses("secondary")}
              >
                Back to this month
              </Link>
            }
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
          /*
            The window is keyed on what is being shown, so changing a filter starts the
            list at the top again rather than leaving you eight hundred rows deep in a
            list you have just replaced.
          */
          <Ledger
            key={`${scope}|${query}|${onAccounts.join()}|${onKinds.join()}|${unpricedOnly}|${sort}|${way}|${activeCategories.join()}`}
            rows={shown}
            grouped={grouped}
            base={base}
          />
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
            today={today}
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


















