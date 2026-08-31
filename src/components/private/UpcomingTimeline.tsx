"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { ListBar } from "@/components/ui/ListBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";

import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import type { Forecast, ForecastLine } from "@/lib/data/money";
import type { PlannedRow, RecurringRow } from "@/lib/types";
import { DueRecurringPanel } from "./DueRecurringPanel";
import { PlannedDuePanel } from "./PlannedDuePanel";
import { SpendingBasisPanel } from "./SpendingBasisPanel";
import { ForecastOutlook } from "./ForecastOutlook";
import { addDays, isRunning } from "./upcoming";
import { PanelMeta, caps } from "./upcoming/ui";
import { Row, Shortfall } from "./upcoming/TimelineRow";
import { MonthHead, byMonth } from "./upcoming/months";
import { NothingDue } from "./upcoming/NothingDue";
import { NoIncome } from "./upcoming/NoIncome";
import { BeyondHorizon } from "./upcoming/BeyondHorizon";

export function UpcomingTimeline({
  forecast,
  items,
  due,
  plannedDue,
  planned,
}: {
  forecast: Forecast;
  items: RecurringRow[];
  due: RecurringRow[];
  plannedDue: PlannedRow[];
  /** Every one-off still waiting — the window shows most of them, not all. */
  planned: PlannedRow[];
}) {
  const { fmt, fmtShort } = useMoney();
  const {
    lines,
    windows,
    startingBalance,
    onAccounts,
    reserved,
    estimated,
    unknown,
    planned: plannedOnLine,
    spending,
    from,
  } = forecast;

  // Windows come back sorted, shortest first — the last one is how far this looks.
  const longest = windows.length > 0 ? windows[windows.length - 1].days : 0;
  const horizon = addDays(from, longest);

  const shortfallIndex = lines.findIndex((l) => l.balance < 0);
  const shortfall = shortfallIndex >= 0 ? lines[shortfallIndex] : null;
  const low = lines.reduce<ForecastLine | null>(
    (worst, l) => (worst === null || l.balance < worst.balance ? l : worst),
    null,
  );

  /*
    The timeline can be narrowed, and only the timeline.

    Everything above the panel — the shortfall banner, the runway card, the three windows,
    the starting balance — is read off the whole schedule and stays that way. A forecast
    that re-ran itself against a search box would be answering a different question from
    the one it is for: what is coming is what is coming, whether or not you are currently
    looking for the word "rent".
  */
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [source, setSource] = useState("");
  const [order, setOrder] = useState<"soon" | "big" | "name">("soon");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  // A standing order into a goal books a saving, whatever the rule behind it says.
  const lineKind = (line: ForecastLine) => (line.goal ? "saving" : line.kind);

  const term = q.trim().toLowerCase();
  const matching = lines.filter((line) => {
    if (
      term &&
      ![line.name, line.category ?? "", line.goal ?? ""].some((value) =>
        value.toLowerCase().includes(term),
      )
    ) {
      return false;
    }
    if (source && line.source !== source) return false;
    if (kind && lineKind(line) !== kind) return false;
    return true;
  });

  const compare = (a: ForecastLine, b: ForecastLine) => {
    if (order === "big") return b.amount - a.amount || a.on.localeCompare(b.on);
    if (order === "name") return a.name.localeCompare(b.name) || a.on.localeCompare(b.on);
    return a.on.localeCompare(b.on) || a.name.localeCompare(b.name);
  };
  // Backwards is the comparison with its arguments swapped, so ties keep their order.
  const shownLines = [...matching].sort(dir === "asc" ? compare : (a, b) => compare(b, a));
  const narrowed = shownLines.length !== lines.length;

  /*
    Months only survive in date order, running forwards.

    `byMonth` cuts the list where the month changes, and the closing balance it prints is
    the balance after the last row it saw. Sorted by size the months interleave; run
    backwards, the "leaves" figure would be the balance at the *start* of the month with
    the month's name over it. Either way the heading stops being true, so it goes.
  */
  const grouped = order === "soon" && dir === "asc";
  const groups = byMonth(shownLines);
  const running = items.filter(isRunning).length;
  const everydayTotal = lines
    .filter((l) => l.source === "everyday")
    .reduce((sum, l) => sum + l.amount, 0);

  const noIncome = forecast.windows.every((w) => w.income === 0);

  return (
    <>
      {/*
        A shortfall is only a shortfall when both sides have been entered.

        `windows` carries the income the forecast actually found; if every horizon has
        none, there is no income modelled at all and the falling line is arithmetic over
        half the picture. The red banner stands down and says so instead — see `NoIncome`.
      */}
      {noIncome && <NoIncome />}

      {!noIncome && shortfall && low && (
        <Shortfall
          line={shortfall}
          low={low}
          from={from}
          reserved={reserved}
          lines={lines}
          index={shortfallIndex}
        />
      )}

      <DueRecurringPanel due={due} />
      <PlannedDuePanel due={plannedDue} />

      {/* One answer here: how long the current money covers the schedule. The detailed
          totals and dated items already live directly below it. */}
      {lines.length > 0 && (
        <ForecastOutlook forecast={forecast} days={longest || 90} outgoingOnly={noIncome} />
      )}

      {/* Three zeroes above an empty timeline say nothing the empty state does not. */}
      {lines.length > 0 && (
        <div className="grid gap-3 min-[560px]:grid-cols-3">
          {windows.map((w) => {
            const leaves = startingBalance + w.net;
            return (
              <Kpi
                key={w.days}
                label={`Next ${w.days} days`}
                value={fmt(w.expense)}
                /*
                  One line under the figure, and it is the answer.

                  There were four: how many items, what is coming in, what goes into goals,
                  what everyday spending is projected at, and then what it all leaves. Every
                  one of them is true and only the last is the reason anybody looks at this
                  card — the other three are the working, and the working is on the timeline
                  directly underneath, item by item, where it can actually be checked.

                  Three cards of four dense lines is twelve lines of figures above a panel
                  that says the same thing at length. What survives is the count, because it
                  says how much is behind the number, and what it leaves, because that is
                  the question. The rest is a hover away.
                */
                hint={
                  <span
                    className="block"
                    title={[
                      w.income > 0 ? `${fmt(w.income)} coming in` : null,
                      w.saving > 0 ? `${fmt(w.saving)} into goals` : null,
                      w.everyday > 0 ? `${fmt(w.everyday)} projected for living` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  >
                    {w.count} {w.count === 1 ? "item" : "items"} · leaves{" "}
                    <span className={cn("mono", leaves < 0 ? "text-danger" : "text-ink")}>
                      {fmtShort(leaves)}
                    </span>{" "}
                    free
                  </span>
                }
              />
            );
          })}
        </div>
      )}

      {/* Where the running balance starts, said in full so it can be checked against
          the Goals screen and the Overview without doing arithmetic in your head. */}
      {lines.length > 0 && reserved > 0 && (
        <p className="text-[11.5px] leading-relaxed text-muted">
          Starting from <span className="mono text-ink">{fmt(startingBalance)}</span>:{" "}
          <span className="mono">{fmt(onAccounts)}</span> on the accounts, less{" "}
          <span className="mono text-held">{fmt(reserved)}</span> already set aside for
          goals. That money has not gone anywhere — it just cannot pay a bill.
        </p>
      )}

      <Panel
        className="money-summary-panel upcoming-panel"
        title={longest > 0 ? `Next ${longest} days` : "Timeline"}
        action={
          <PanelMeta>
            <span className="hidden min-[420px]:inline">
              {running} {running === 1 ? "rule" : "rules"} running
              {plannedOnLine > 0 && ` · ${plannedOnLine} planned`} ·{" "}
            </span>
            from <span className="mono text-ink">{fmt(startingBalance)}</span> free
          </PanelMeta>
        }
      >
        {lines.length === 0 ? (
          <NothingDue
            items={items}
            unknown={unknown}
            horizon={horizon}
            spendingOff={spending.basis === "off"}
          />
        ) : (
          <div>
            {/* Under a dozen rows every one of them is already on the screen, and a bar
                over them is furniture. */}
            {lines.length >= 12 && (
              <ListBar
                inPanel
                query={q}
                onQuery={setQ}
                searchLabel="Search by name, category or goal…"
                filters={[
                  {
                    value: kind,
                    onChange: setKind,
                    label: "Filter by what it books",
                    all: `All ${lines.length}`,
                    options: [
                      { value: "expense", label: "Going out" },
                      { value: "income", label: "Coming in" },
                      { value: "saving", label: "Into goals" },
                    ],
                  },
                  {
                    value: source,
                    onChange: setSource,
                    label: "Filter by where it comes from",
                    all: "Rules and one-offs",
                    options: [
                      { value: "recurring", label: "Repeating" },
                      { value: "planned", label: "Planned once" },
                      { value: "everyday", label: "Everyday living" },
                    ],
                  },
                ]}
                sort={{
                  value: order,
                  onChange: (value) => setOrder(value as typeof order),
                  label: "Order the timeline",
                  options: [
                    { value: "soon", label: "Soonest first", reverse: "Furthest off first" },
                    { value: "big", label: "Largest first", reverse: "Smallest first" },
                    { value: "name", label: "Name A–Z", reverse: "Name Z–A" },
                  ],
                  direction: dir,
                  onDirection: setDir,
                }}
                shown={shownLines.length}
                total={lines.length}
                onClear={() => {
                  setQ("");
                  setKind("");
                  setSource("");
                }}
              />
            )}

            {shownLines.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Nothing here matches"
                description={`All ${lines.length} are still coming — the search or a filter is hiding them.`}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setQ("");
                      setKind("");
                      setSource("");
                    }}
                    className={buttonClasses("secondary")}
                  >
                    Clear the filters
                  </button>
                }
              />
            ) : (
              <>
                <div
                  aria-hidden="true"
                  className="hidden items-center justify-between border-b border-line-soft px-4 py-1.5 min-[480px]:flex"
                >
                  <span className={caps}>What falls due</span>
                  <span className={caps}>Amount / left after</span>
                </div>

                {grouped ? (
                  groups.map((group) => (
                    <div key={group.key}>
                      <MonthHead group={group} narrowed={narrowed} />
                      {group.rows.map((line, i) => (
                        <Row key={`${line.id}-${line.on}-${i}`} line={line} from={from} />
                      ))}
                    </div>
                  ))
                ) : (
                  <div>
                    {shownLines.map((line, i) => (
                      <Row key={`${line.id}-${line.on}-${i}`} line={line} from={from} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Panel>

      <BeyondHorizon items={planned.filter((p) => p.due_on > horizon)} horizon={horizon} />

      <SpendingBasisPanel spending={spending} />

      {/* When the timeline is empty the empty state has already said all of this. */}
      {lines.length > 0 && (estimated > 0 || unknown > 0 || everydayTotal > 0) && (
        <p className="text-[11.5px] leading-relaxed text-muted">
          {estimated > 0 && (
            <>
              {estimated} variable {estimated === 1 ? "item is" : "items are"} shown at the average
              of their last bookings — marked <span className="text-held">Estimate</span> in the
              list, and every one of them opens to show the bookings behind it.{" "}
            </>
          )}
          {everydayTotal > 0 && (
            <>
              <span className="mono">{fmt(everydayTotal)}</span> of the total is projected
              everyday spending, marked <span className="text-draft">Projection</span> — a rate
              spread over the days, not something dated that will actually happen.{" "}
            </>
          )}
          {unknown > 0 && (
            <>
              {unknown} variable {unknown === 1 ? "item has" : "items have"} no history yet, so{" "}
              {unknown === 1 ? "it is" : "they are"} left out of the timeline entirely — the real
              total will be higher than this.
            </>
          )}
        </p>
      )}
    </>
  );
}

