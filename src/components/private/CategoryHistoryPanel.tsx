"use client";

/**
 * One category across a year: what it costs in a normal month, and every entry behind it.
 *
 * The ledger already answers "what did I buy in August". It cannot answer "is August
 * unusual", and that is the question a large figure actually raises — 14.737 on eating
 * out is either a bad month or simply what eating out costs here, and the two want
 * opposite reactions. Twelve bars and one average settle it in a glance; the list under
 * them is there for when the answer was surprising.
 *
 * Everything is in hand once the panel opens, so searching and sorting are a filter over
 * an array and the answer arrives as you type. The rules live in `entry-search`, tested
 * without a screen: a search that quietly misses a match is worse than no search, because
 * nobody notices it happening.
 */

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { FilterChip, LedgerControls } from "./LedgerControls";
import { useMoney } from "@/lib/money/currency";
import { siftEntries, totalsByMonth, type EntrySort } from "@/lib/money/entry-search";
import type { CategoryHistory } from "@/lib/data/money";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-08` as `Aug`, and as `Aug 26` when the year is not the one we are standing in. */
function monthTick(key: string, thisYear: string): string {
  const [year, month] = key.split("-");
  const name = MONTHS[Number(month) - 1] ?? key;
  return year === thisYear ? name : `${name} ${year.slice(2)}`;
}

const SIGN: Record<string, string> = {
  income: "+",
  saving: "→",
  withdraw: "←",
  transfer: "⇄",
  expense: "−",
};

export function CategoryHistoryPanel({
  history,
  name,
  loading,
}: {
  history: CategoryHistory | null;
  name: string;
  loading: boolean;
}) {
  const { fmt, fmtShort } = useMoney();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<EntrySort>("newest");
  const [account, setAccount] = useState("");
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");

  const entries = useMemo(() => history?.entries ?? [], [history]);

  // Only the accounts this category has actually been paid from. Offering the others
  // would be offering filters that can only ever return nothing.
  const accounts = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entries) if (e.account?.name) seen.add(e.account.name);
    return [...seen].sort();
  }, [entries]);

  const hasUnpriced = useMemo(() => entries.some((e) => e.amount_rsd === null), [entries]);

  const shown = useMemo(
    () =>
      siftEntries(
        entries,
        { query, accountName: account, unpricedOnly, from: fromDay, to: toDay },
        sort,
      ),
    [entries, query, account, unpricedOnly, sort, fromDay, toDay],
  );

  /*
    What each chip is worth, against everything else that is already on — the same rule the
    ledger's chips follow, because this is the same list seen through a different window.
  */
  const facets = useMemo(() => {
    const rows = (over: { account?: string; unpriced?: boolean }) =>
      siftEntries(
        entries,
        {
          query,
          accountName: over.account ?? account,
          unpricedOnly: over.unpriced ?? unpricedOnly,
          from: fromDay,
          to: toDay,
        },
        "newest",
      );
    return {
      account: (a: string) => rows({ account: a }).length,
      unpriced: () => rows({ unpriced: true }).length,
    };
  }, [entries, query, account, unpricedOnly, fromDay, toDay]);

  const filtered =
    query.trim() !== "" || account !== "" || unpricedOnly || fromDay !== "" || toDay !== "";

  /*
    The bars and the two figures describe whatever is on the list, not the whole year.

    That is the more useful reading by some distance: type "kafa" and the chart becomes
    when you buy coffee and what it costs, which is a question the app could not answer at
    all before. The count line under the controls says how much of the year is being
    looked at, so the narrowing is never silent.
  */
  const totals = useMemo(() => totalsByMonth(shown), [shown]);
  const monthKeys = history?.months.map((m) => m.month) ?? [];
  const bars = monthKeys.map((month) => ({
    month,
    spent: Math.round((totals.get(month) ?? 0) * 100) / 100,
    current: history?.months.find((m) => m.month === month)?.current ?? false,
  }));

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-6 text-[12.5px] text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Reading the last year…
      </p>
    );
  }

  if (!history) {
    return (
      <p className="py-6 text-[12.5px] leading-[1.6] text-muted">
        Nothing on <b className="font-semibold text-ink">{name}</b> in the last year. It has a
        name and no history — which is a fine thing for a category to be.
      </p>
    );
  }

  const peak = Math.max(1, ...bars.map((b) => b.spent));
  const thisYear = monthKeys[monthKeys.length - 1].slice(0, 4);
  const lived = bars.filter((b) => !b.current && b.spent > 0);
  const typical = lived.length
    ? Math.round(lived.reduce((sum, b) => sum + b.spent, 0) / lived.length)
    : 0;
  const busiest = bars.reduce((a, b) => (b.spent > a.spent ? b : a));

  /*
    Grouping by month only survives while the order is chronological. Sorted by size the
    months interleave, and a heading that appears three times down the list is a heading
    that has stopped meaning anything — so the date moves onto the row instead.
  */
  const grouped = sort === "newest" || sort === "oldest";
  const byMonth = new Map<string, typeof shown>();
  if (grouped) {
    for (const entry of shown) {
      const key = entry.occurred_on.slice(0, 7);
      (byMonth.get(key) ?? byMonth.set(key, []).get(key)!).push(entry);
    }
  }

  return (
    <div>
      <LedgerControls
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        from={fromDay}
        to={toDay}
        onFrom={setFromDay}
        onTo={setToDay}
        minDate={history?.from ?? ""}
        maxDate={history?.entries[0]?.occurred_on ?? ""}
        placeholder="Search name, note, account or amount"
        label={`Search ${name}`}
      >
        {accounts.length > 1 &&
          accounts.map((a) => (
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

      {filtered && (
        <p className="mt-2 flex items-baseline gap-2 text-[11.5px] text-muted">
          <span>
            {shown.length} of {entries.length}{" "}
            {entries.length === 1 ? "entry" : "entries"}
          </span>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setAccount("");
              setUnpricedOnly(false);
              setFromDay("");
              setToDay("");
            }}
            className="font-semibold text-gold-hi"
          >
            Clear
          </button>
        </p>
      )}

      {shown.length === 0 ? (
        <p className="py-6 text-[12.5px] leading-[1.6] text-muted">
          Nothing on <b className="font-semibold text-ink">{name}</b> matches that.
        </p>
      ) : (
        <>
          <div className="mb-3 mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-ctrl border border-line bg-white/[0.02] px-3 py-2.5">
              {/*
                The average of finished months that had something in them. Counting the
                empty ones answers a different question — "what does this cost me across a
                year" — and would tell somebody who eats out twice a year that dinner costs
                1.200.
              */}
              <span className="block text-[11px] font-semibold text-muted">
                {filtered ? "A month with these" : "A month like this"}
              </span>
              <span className="mono text-[15px] font-semibold text-ink">
                {typical > 0 ? fmt(typical) : "—"}
              </span>
            </div>
            <div className="rounded-ctrl border border-line bg-white/[0.02] px-3 py-2.5">
              <span className="block text-[11px] font-semibold text-muted">Most it has been</span>
              <span className="mono text-[15px] font-semibold text-ink">
                {fmt(busiest.spent)}
                <span className="text-[11.5px] font-medium text-faint">
                  {" "}
                  {monthTick(busiest.month, thisYear)}
                </span>
              </span>
            </div>
          </div>

          <div className="mb-1 flex items-end gap-1" style={{ minHeight: "56px" }}>
            {bars.map((m) => (
              <span
                key={m.month}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${monthTick(m.month, thisYear)} · ${fmt(m.spent)}${
                  m.current ? " · still running" : ""
                }`}
              >
                <span className="mono text-[9.5px] text-faint">
                  {m.spent > 0 ? fmtShort(m.spent) : ""}
                </span>
                <span
                  className="block w-full rounded-t-[3px]"
                  style={{
                    // Floored so a month with one small entry is still a mark. Zero stays
                    // zero: a month you spent nothing in should look like nothing, not
                    // like a little.
                    height: m.spent > 0 ? `${Math.max(4, (m.spent / peak) * 34)}px` : "2px",
                    background: m.spent > 0 ? "var(--color-gold)" : "rgba(255,255,255,.07)",
                    opacity: m.current ? 1 : 0.45,
                  }}
                />
              </span>
            ))}
          </div>
          <div className="mb-4 flex gap-1">
            {bars.map((m) => (
              <span key={m.month} className="flex-1 text-center text-[9px] text-faint">
                {monthTick(m.month, thisYear).slice(0, 3)}
              </span>
            ))}
          </div>

          {grouped ? (
            <div className="space-y-3">
              {[...byMonth.entries()].map(([month, rows]) => {
                const total = rows.reduce((sum, e) => sum + (Number(e.amount_rsd) || 0), 0);
                return (
                  <div key={month}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 px-0.5">
                      <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-faint">
                        {monthTick(month, thisYear)}
                      </span>
                      <span className="mono text-[11.5px] text-muted">{fmt(total)}</span>
                    </div>
                    <ul className="overflow-hidden rounded-ctrl border border-line">
                      {rows.map((entry) => (
                        <EntryRow key={entry.id} entry={entry} fmt={fmt} />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <ul className="overflow-hidden rounded-ctrl border border-line">
              {shown.map((entry) => (
                <EntryRow key={entry.id} entry={entry} fmt={fmt} withMonth thisYear={thisYear} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  fmt,
  withMonth,
  thisYear,
}: {
  entry: CategoryHistory["entries"][number];
  fmt: (value: number) => string;
  withMonth?: boolean;
  thisYear?: string;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-line-soft bg-white/[0.02] px-3 py-2 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-ink">
          {entry.title ?? entry.category?.name ?? entry.note ?? "—"}
        </span>
        <span className="mono mt-0.5 block text-[10.5px] text-faint">
          {withMonth && thisYear
            ? `${monthTick(entry.occurred_on.slice(0, 7), thisYear)} ${entry.occurred_on.slice(8)}`
            : `${entry.occurred_on.slice(8)}.${entry.occurred_on.slice(5, 7)}.`}
          {entry.occurred_at ? ` ${entry.occurred_at.slice(0, 5)}` : ""}
          {entry.account?.name ? ` · ${entry.account.name}` : ""}
        </span>
      </span>
      {/*
        An entry logged without a price has no figure to show, and `0` would be a lie the
        row cannot take back — the same mark the ledger uses.
      */}
      {entry.amount_rsd === null ? (
        <span className="text-[11px] font-semibold text-faint">no price</span>
      ) : (
        <span className="mono shrink-0 text-[12px] text-muted">
          {SIGN[entry.kind] ?? "−"} {fmt(Number(entry.amount_rsd))}
        </span>
      )}
    </li>
  );
}


