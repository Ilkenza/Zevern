"use client";

import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";

import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import type { Forecast, ForecastLine } from "@/lib/data/money";
import type { PlannedRow, RecurringRow } from "@/lib/types";
import { DueRecurringPanel } from "./DueRecurringPanel";
import { PlannedDuePanel } from "./PlannedDuePanel";
import { SpendingBasisPanel } from "./SpendingBasisPanel";
import { ForecastCurve } from "./ForecastCurve";
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
  const { fmt } = useMoney();
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

  const groups = byMonth(lines);
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

      {/*
        The windows below say what each period does to the balance. This says the shape
        of it — where the money dips, how long it stays down, whether the line ever
        crosses zero. That is what a column of dates cannot answer at a glance, and
        every figure it draws was already being computed and thrown away.
      */}
      {lines.length > 0 && (
        <ForecastCurve forecast={forecast} days={longest || 90} outgoingOnly={noIncome} />
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
                hint={
                  <>
                    <span className="block">
                      {w.count} {w.count === 1 ? "item" : "items"}
                      {w.income > 0 && <> · {fmt(w.income)} coming in</>}
                      {w.saving > 0 && (
                        <span className="text-held"> · {fmt(w.saving)} into goals</span>
                      )}
                    </span>
                    {w.everyday > 0 && (
                      <span className="block font-normal text-faint">
                        plus {fmt(w.everyday)} projected for living
                      </span>
                    )}
                    <span className="block">
                      leaves{" "}
                      <span className={cn("mono", leaves < 0 ? "text-danger" : "text-ink")}>
                        {fmt(leaves)}
                      </span>{" "}
                      free
                    </span>
                  </>
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
            <div
              aria-hidden="true"
              className="hidden items-center justify-between border-b border-line-soft px-4 py-1.5 min-[480px]:flex"
            >
              <span className={caps}>What falls due</span>
              <span className={caps}>Amount / left after</span>
            </div>

            {groups.map((group) => (
              <div key={group.key}>
                <MonthHead group={group} />
                {group.rows.map((line, i) => (
                  <Row key={`${line.id}-${line.on}-${i}`} line={line} from={from} />
                ))}
              </div>
            ))}
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
