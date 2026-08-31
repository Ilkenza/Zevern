"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListBar } from "@/components/ui/ListBar";
import { buttonClasses } from "@/components/ui/Button";
import { type Rates } from "@/lib/money";
import { useMoney } from "@/lib/money/currency";
import type { RecurringTotals } from "@/lib/data/money";
import type { RecurringRow } from "@/lib/types";
import { isRunning } from "./upcoming";
import { PanelMeta, caps } from "./upcoming/ui";
import { RuleHead, RuleRow } from "./upcoming/RuleRow";
import {
  EVERY_FILTER,
  FILTERS_FROM,
  SORTS,
  accountKey,
  accountLabel,
  costRank,
  optionsFrom,
  purposeKey,
  purposeLabel,
  type SortKey,
} from "./upcoming/rule-filters";
import { NoRules } from "./upcoming/NoRules";
import { todayISO } from "@/lib/format";

export function UpcomingRules({
  items,
  totals,
  rates,
}: {
  items: RecurringRow[];
  totals: RecurringTotals;
  rates: Rates;
}) {
  const { fmt } = useMoney();
  // Read the same way Setup and Goals read today — UTC on both sides, so nothing disagrees.
  const today = todayISO();

  // The register's own state, and nowhere else. The page's `searchParams` already
  // carry the view, the open form and the rule being edited; putting a search term in
  // there too would make every keystroke a navigation and every filter a history entry
  // to step back out of. Nothing here is worth a URL — it is a way of reading a list,
  // not a place.
  const [q, setQ] = useState("");
  const [purpose, setPurpose] = useState("");
  const [account, setAccount] = useState("");
  const [every, setEvery] = useState("");
  const [sort, setSort] = useState<SortKey>("due");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const running = items.filter(isRunning);
  const stopped = items.filter((i) => !isRunning(i));

  const purposes = optionsFrom(items, purposeKey, purposeLabel);
  const accounts = optionsFrom(items, accountKey, accountLabel);
  const intervals = EVERY_FILTER.filter((o) => items.some((i) => i.every === o.value));

  const term = q.trim().toLowerCase();

  const matching = items.filter((item) => {
    if (term && !item.name.toLowerCase().includes(term)) return false;
    if (purpose && purposeKey(item) !== purpose) return false;
    if (account && accountKey(item) !== account) return false;
    if (every && item.every !== every) return false;
    return true;
  });

  const compare = (a: (typeof matching)[number], b: (typeof matching)[number]) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "cost") {
      const ra = costRank(a, rates);
      const rb = costRank(b, rates);
      if (ra === null || rb === null) {
        if (ra === rb) return a.name.localeCompare(b.name);
        return ra === null ? 1 : -1;
      }
      return rb - ra || a.name.localeCompare(b.name);
    }
    return a.next_on.localeCompare(b.next_on) || a.name.localeCompare(b.name);
  };

  // Backwards is the comparison with its arguments swapped, which keeps every tie-break
  // the right way round — `reverse()` would turn ties over too, and two rules that tie
  // on cost would trade places for no reason the screen could explain.
  const sorted = [...matching].sort(dir === "asc" ? compare : (a, b) => compare(b, a));

  // The split survives the filter: paused and finished rules go on sitting under their
  // own heading at the bottom, because they mean something different from the rest and
  // are left out of the figures above whether they are being searched or not.
  const shownRunning = sorted.filter(isRunning);
  const shownStopped = sorted.filter((i) => !isRunning(i));

  const clear = () => {
    setQ("");
    setPurpose("");
    setAccount("");
    setEvery("");
    setDir("asc");
  };

  /*
    The toolbar this screen used to own is `ui/ListBar` now.

    It was written here first and turned out to be the shape the whole app wanted — three
    axes, a search, an order and a live count of what is being left out. So it moved out
    rather than being copied: Budgets, Goals, Setup and Tasks use the same component, and
    the register that invented it stopped being the one screen that spoke differently.
  */
  const toolbar = items.length >= FILTERS_FROM && (
    <ListBar
      inPanel
      query={q}
      onQuery={setQ}
      searchLabel="Search by name…"
      filters={[
        {
          value: purpose,
          onChange: setPurpose,
          label: "Filter by category or goal",
          all: "All categories",
          options: purposes,
        },
        {
          value: account,
          onChange: setAccount,
          label: "Filter by account",
          all: "All accounts",
          options: accounts,
        },
        {
          value: every,
          onChange: setEvery,
          label: "Filter by how often it repeats",
          all: "Any interval",
          options: intervals,
        },
      ]}
      sort={{
        value: sort,
        onChange: (v) => setSort(v as SortKey),
        label: "Sort rules",
        options: SORTS,
        direction: dir,
        onDirection: setDir,
      }}
      shown={sorted.length}
      total={items.length}
      onClear={clear}
    />
  );

  return (
    <>
      {/* The two figures and the sentence that separates them are one block. */}
      {items.length > 0 && (
        <div className="space-y-2.5">
          <div className="grid gap-3 min-[560px]:grid-cols-2 lg:grid-cols-3">
            <Kpi
              label="Per month, on average"
              value={fmt(totals.expense)}
              hint="A run rate — a yearly bill spread over twelve, a weekly one multiplied up. Running rules only."
            />
            <Kpi
              label="Falls due within a year"
              value={fmt(totals.yearExpense)}
              hint={`${totals.yearCount} ${totals.yearCount === 1 ? "date" : "dates"} between today and ${totals.yearHorizon}`}
            />
            {totals.saving > 0 && (
              <Kpi
                label="Into goals, per month"
                value={fmt(totals.saving)}
                hint={`${fmt(totals.yearSaving)} over the next year. Not spent — set aside.`}
              />
            )}
            {(totals.income > 0 || totals.saving > 0) && (
              <Kpi
                label="Net per month"
                value={fmt(totals.net)}
                hint={
                  totals.income > 0
                    ? `After ${fmt(totals.income)} a month coming in${totals.saving > 0 ? ", and what goes into goals" : ""}`
                    : "After the bills and what goes into goals"
                }
              />
            )}
          </div>

          <p className="text-[11.5px] leading-relaxed text-muted">
            The two figures answer different questions. The monthly one is a pace, so one number
            can be held against another month. The yearly one walks the real dates instead: a
            four-payment credit counts four times and then stops, a domain renewed once a year
            counts once.
            {totals.saving > 0 && (
              <span className="mt-1 block">
                Standing orders into goals are counted on their own and left out of both
                spending figures. The money is not gone — it is on the account, spoken for —
                but it cannot pay a bill, so it still comes off what is left over.
              </span>
            )}
            {(totals.estimated > 0 || totals.unknown > 0) && (
              <span className="mt-1 block">
                {totals.estimated > 0 && (
                  <>
                    {totals.estimated} variable {totals.estimated === 1 ? "rule is" : "rules are"}{" "}
                    counted at the average of {totals.estimated === 1 ? "its" : "their"} last
                    bookings.{" "}
                  </>
                )}
                {totals.unknown > 0 && (
                  <span className="text-draft">
                    {totals.unknown} variable {totals.unknown === 1 ? "rule has" : "rules have"} no
                    history yet and {totals.unknown === 1 ? "is" : "are"} left out of both figures.
                  </span>
                )}
              </span>
            )}
          </p>
        </div>
      )}

      <Panel
        className="money-summary-panel upcoming-panel"
        title="What repeats"
        action={
          items.length > 0 ? (
            <PanelMeta>
              {running.length} running
              {stopped.length > 0 && ` · ${stopped.length} stopped`}
            </PanelMeta>
          ) : undefined
        }
      >
        {items.length === 0 ? (
          <NoRules />
        ) : (
          <div>
            {toolbar}

            {sorted.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No rule matches"
                description={`All ${items.length} are still here — the search or a filter is hiding them.`}
                action={
                  <button type="button" onClick={clear} className={buttonClasses("secondary")}>
                    Clear the filters
                  </button>
                }
              />
            ) : (
              <>
                <RuleHead />
                {shownRunning.map((item) => (
                  <RuleRow key={item.id} item={item} rates={rates} today={today} />
                ))}

                {shownStopped.length > 0 && (
                  <>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line-soft bg-white/[0.02] px-4 py-2">
                      <span className={caps}>Paused and finished</span>
                      <span className="text-[11px] text-faint">
                        Nothing books from these, and they are not in the figures above
                      </span>
                    </div>
                    {shownStopped.map((item) => (
                      <RuleRow key={item.id} item={item} rates={rates} today={today} />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}


