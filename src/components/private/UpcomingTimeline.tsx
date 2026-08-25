"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Flag,
  Pencil,
  Repeat,
  TriangleAlert,
  Utensils,
} from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { formatAmount, formatRsd, monthLabel } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Forecast, ForecastLine } from "@/lib/data/money";
import type { PlannedRow, RecurringRow } from "@/lib/types";
import { DueRecurringPanel } from "./DueRecurringPanel";
import { PlannedDuePanel } from "./PlannedDuePanel";
import { ShortfallActions } from "./ShortfallActions";
import { SpendingBasisPanel } from "./SpendingBasisPanel";
import {
  NEW_PLAN_HREF,
  NEW_RULE_HREF,
  RULES_HREF,
  addDays,
  daysBetween,
  isRunning,
  planHref,
  shortfallLevers,
  whenLabel,
} from "./upcoming";

/** Small caps label — column heads and captions, same token as Setup and Goals. */
const caps = "text-[10.5px] font-semibold uppercase tracking-wider text-faint";

/** A category with no colour of its own falls back to a token, never a stray hex. */
const NO_COLOUR = "var(--color-faint)";

/**
 * The marker down the left of a row, and the whole of what it says: a solid bar is a
 * rule that repeats, a broken one is a one-off that has been planned, and a faint
 * dotted one is the projection. Solid means the date and the amount are both known.
 */
function Marker({ source, color }: { source: string; color: string | null }) {
  const shade = color ?? NO_COLOUR;
  if (source === "everyday") {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 h-8 w-1 shrink-0 rounded-pill"
        style={{
          background: `repeating-linear-gradient(to bottom, var(--color-faint) 0 2px, transparent 2px 5px)`,
        }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 h-8 w-1 shrink-0 rounded-pill"
      style={{
        background:
          source === "planned"
            ? `repeating-linear-gradient(to bottom, ${shade} 0 5px, transparent 5px 8px)`
            : shade,
      }}
    />
  );
}

/** The line beside a panel title: how many of the thing there are. */
function PanelMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11.5px] font-semibold whitespace-nowrap text-muted">{children}</span>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-faint">
      ·
    </span>
  );
}

/**
 * The one thing on this screen that cannot wait: the first date the free money runs
 * out. It gets its own card above everything else, with the figure at headline size,
 * the item that tips it over, the amount that would have to arrive to stop it — and
 * the moves that would actually change the date.
 *
 * Free, not total — money already put aside for a goal is not available to pay a bill,
 * so counting it here would hide the day this actually happens.
 */
function Shortfall({
  line,
  low,
  from,
  reserved,
  lines,
  index,
}: {
  line: ForecastLine;
  low: ForecastLine;
  from: string;
  reserved: number;
  lines: ForecastLine[];
  index: number;
}) {
  const when = whenLabel(daysBetween(from, line.on));
  const deeper = low.on !== line.on && low.balance < line.balance;
  const levers = shortfallLevers(lines, index, from);

  return (
    <section className="overflow-hidden rounded-card border border-danger/40 bg-danger-bg">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <TriangleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13.5px] font-bold text-danger">
            You run out of free money on <span className="mono">{line.on}</span>
          </h2>

          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="mono text-[26px] font-semibold tracking-[-0.5px] text-danger">
              {formatRsd(line.balance)}
            </span>
            <span className="text-[12.5px] text-muted">
              after{" "}
              {line.source === "everyday"
                ? `${line.days} ${line.days === 1 ? "day" : "days"} of everyday spending`
                : line.name}
              {when && <> · {when}</>}
            </span>
          </div>

          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            <span className="mono text-ink">{formatRsd(-line.balance)}</span> has to come in
            before then.
            {deeper && (
              <>
                {" "}
                It keeps falling after that — down to{" "}
                <span className="mono text-ink">{formatRsd(low.balance)}</span> on{" "}
                <span className="mono">{low.on}</span>.
              </>
            )}
            {reserved > 0 && (
              <>
                {" "}
                There is <span className="mono text-ink">{formatRsd(reserved)}</span> set aside
                for goals on top of this. Close a goal or take money back out and it counts
                again.
              </>
            )}
          </p>
        </div>
      </div>

      <ShortfallActions levers={levers} on={line.on} />
    </section>
  );
}

/**
 * The bookings an estimate was averaged from — dates and amounts, from the row that
 * uses them. An average of six readings can hide one freak winter bill, and there is no
 * way to tell a steady figure from a dragged one without seeing the readings.
 */
function EstimateDetail({ line }: { line: ForecastLine }) {
  const amounts = line.samples.map((s) => s.amount);
  const lowest = Math.min(...amounts);
  const highest = Math.max(...amounts);
  const spread = highest - lowest;

  return (
    <div className="mt-2 rounded-ctrl border border-line-soft bg-white/[0.02] px-3 py-2">
      <div className={caps}>
        Averaged from the last {line.samples.length}{" "}
        {line.samples.length === 1 ? "booking" : "bookings"}
      </div>
      <div className="mt-1.5 space-y-0.5">
        {line.samples.map((s, i) => (
          <div
            key={`${s.on}-${i}`}
            className="flex items-baseline justify-between gap-3 text-[11.5px]"
          >
            <span className="mono text-muted">{s.on}</span>
            <span className="mono text-faint">{formatRsd(s.amount)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
        Lowest <span className="mono">{formatRsd(lowest)}</span>, highest{" "}
        <span className="mono">{formatRsd(highest)}</span>
        {spread > 0 ? (
          <>
            {" "}
            — <span className="mono">{formatRsd(spread)}</span> between them. The timeline uses
            the average of all {line.samples.length}.
          </>
        ) : (
          <> — every one the same. The timeline uses that figure.</>
        )}
      </p>
    </div>
  );
}

/** One due date: what it is, when it lands, what it costs, what it leaves behind. */
function Row({ line, from }: { line: ForecastLine; from: string }) {
  const [open, setOpen] = useState(false);
  const days = daysBetween(from, line.on);
  const when = whenLabel(days);
  const income = line.kind === "income";
  const everyday = line.source === "everyday";
  const planned = line.source === "planned";
  const inspectable = line.samples.length > 0;

  return (
    <div
      className={cn(
        "flex items-start gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0",
        everyday && "bg-white/[0.015]",
      )}
    >
      <Marker source={line.source} color={line.color} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {planned && <Flag aria-hidden="true" className="h-3.25 w-3.25 shrink-0 text-muted" />}
          {everyday && (
            <Utensils aria-hidden="true" className="h-3.25 w-3.25 shrink-0 text-faint" />
          )}
          <span
            className={cn(
              "min-w-0 truncate text-[13.5px]",
              everyday ? "font-normal text-muted" : "font-medium text-ink",
            )}
          >
            {line.name}
          </span>

          {!everyday && days !== null && days < 0 && <Badge status="danger">Not booked yet</Badge>}
          {!everyday && days === 0 && <Badge status="active">Today</Badge>}
          {everyday && <Badge status="draft">Projection</Badge>}

          {/* The estimate opens onto the bookings it was averaged from — six readings
              hide one freak winter bill, and the average alone cannot show that. */}
          {!everyday &&
            line.estimated &&
            (inspectable ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-label={`${open ? "Hide" : "Show"} the bookings behind the estimate for ${line.name}`}
                className="inline-flex items-center rounded-pill transition-opacity hover:opacity-80"
              >
                <Badge status="info">
                  Estimate
                  {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Badge>
              </button>
            ) : (
              <Badge status="info">Estimate</Badge>
            ))}

          {planned && (
            <Link
              href={planHref(line.id)}
              aria-label={`Edit ${line.name}`}
              title={`Edit ${line.name}`}
              className="rounded-ctrl p-0.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
            >
              <Pencil className="h-3.25 w-3.25" />
            </Link>
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted">
          <span className="mono">{line.on}</span>
          {everyday ? (
            <>
              <Dot />
              <span>
                {line.days} {line.days === 1 ? "day" : "days"} of ordinary living
              </span>
            </>
          ) : (
            <>
              {when && (
                <>
                  <Dot />
                  <span>{when}</span>
                </>
              )}
              <Dot />
              {line.goal ? (
                <span className="min-w-0 truncate text-info">Into {line.goal}</span>
              ) : (
                <span className="min-w-0 truncate">{line.category ?? "No category"}</span>
              )}
              <Dot />
              <span className="inline-flex items-center gap-1 text-faint">
                {line.source === "recurring" ? (
                  <>
                    <Repeat aria-hidden="true" className="h-3 w-3" />
                    Repeats
                  </>
                ) : (
                  <>One-off</>
                )}
              </span>
            </>
          )}
        </div>

        {open && inspectable && <EstimateDetail line={line} />}
      </div>

      <div className="shrink-0 text-right">
        <div
          className={cn(
            "mono text-[13.5px] font-semibold",
            income
              ? "text-ok"
              : everyday
                ? "text-muted"
                : line.goal
                  ? "text-info"
                  : line.estimated
                    ? "text-muted"
                    : "text-ink",
          )}
        >
          {income ? "+" : "−"} {formatRsd(line.amount)}
        </div>
        <div className={cn("mono text-[11px]", line.balance < 0 ? "text-danger" : "text-faint")}>
          <span className="sr-only">leaves </span>
          {formatRsd(line.balance)}
        </div>
      </div>
    </div>
  );
}

type MonthGroup = {
  key: string;
  rows: ForecastLine[];
  expense: number;
  income: number;
  /** What the month sets aside rather than spends — counted apart, still deducted. */
  saving: number;
  /** Projected everyday spending — kept apart from the dated items on purpose. */
  everyday: number;
  /** The running balance after the last row of the month — where the month ends up. */
  closing: number;
};

/** The lines arrive sorted by date, so one pass is enough to cut them into months. */
function byMonth(lines: ForecastLine[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const line of lines) {
    const key = line.on.slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        rows: [],
        expense: 0,
        income: 0,
        saving: 0,
        everyday: 0,
        closing: line.balance,
      };
      groups.push(group);
    }
    group.rows.push(line);
    if (line.source === "everyday") group.everyday += line.amount;
    else if (line.kind === "income") group.income += line.amount;
    else if (line.goal) group.saving += line.amount;
    else group.expense += line.amount;
    group.closing = line.balance;
  }
  return groups;
}

function MonthHead({ group }: { group: MonthGroup }) {
  const dated = group.rows.filter((r) => r.source !== "everyday").length;

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line-soft bg-white/[0.02] px-4 py-2">
      <span className="text-[11.5px] font-semibold text-ink">
        {monthLabel(group.key)}
        <span className="ml-1.5 font-normal text-faint">
          {dated} {dated === 1 ? "item" : "items"}
        </span>
      </span>
      <span className="mono text-[11px] text-muted">
        −{formatRsd(group.expense)}
        {group.income > 0 && <> · +{formatRsd(group.income)}</>}
        {group.saving > 0 && <span className="text-info"> · {formatRsd(group.saving)} aside</span>}
        {group.everyday > 0 && <> · {formatRsd(group.everyday)} living</>}
        {" · "}
        <span className={group.closing < 0 ? "text-danger" : "text-faint"}>
          leaves {formatRsd(group.closing)}
        </span>
      </span>
    </div>
  );
}

/**
 * Nothing on the timeline is not the same as nothing to say. Either nothing has been
 * entered yet, or things exist and every one of them is out of this window for a reason
 * the data itself records — paused, finished, dated later, or variable with no past
 * bookings to estimate from. Say which, and nothing that is not in the data.
 */
function NothingDue({
  items,
  unknown,
  horizon,
  spendingOff,
}: {
  items: RecurringRow[];
  unknown: number;
  horizon: string;
  spendingOff: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing on the line yet"
        description="Rent, hosting, a phone paid off in instalments — enter each one once. A dentist bill or an invoice you know is landing goes on as a one-off."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={NEW_RULE_HREF} className={buttonClasses("primary")}>
              New recurring
            </Link>
            <Link href={NEW_PLAN_HREF} className={buttonClasses("secondary")}>
              Plan a one-off
            </Link>
          </div>
        }
      />
    );
  }

  let paused = 0;
  let finished = 0;
  let earliest: string | null = null;

  for (const item of items) {
    const total = item.installments_total;
    const done = item.installments_done ?? 0;
    if ((total != null && done >= total) || (item.ends_on != null && item.next_on > item.ends_on)) {
      finished++;
    } else if (!item.active) {
      paused++;
    } else if (item.next_on > horizon && (earliest === null || item.next_on < earliest)) {
      earliest = item.next_on;
    }
  }

  const reasons: string[] = [];
  if (paused > 0) reasons.push(`${paused} ${paused === 1 ? "rule is" : "rules are"} paused.`);
  if (finished > 0)
    reasons.push(
      `${finished} ${finished === 1 ? "rule has" : "rules have"} finished — the instalments ran out, or the end date passed.`,
    );
  if (earliest) reasons.push(`The earliest date left is ${earliest}, past the end of this window.`);
  if (unknown > 0)
    reasons.push(
      `${unknown} variable ${unknown === 1 ? "rule has" : "rules have"} no past bookings, so there is nothing to estimate ${unknown === 1 ? "it" : "them"} from.`,
    );
  reasons.push("Nothing has been planned as a one-off inside this window either.");
  if (spendingOff)
    reasons.push("Everyday spending is switched off, so nothing is projected for it.");

  return (
    <>
      <EmptyState
        icon={CalendarClock}
        title={`Nothing falls due before ${horizon}`}
        description={`${items.length} recurring ${items.length === 1 ? "rule exists" : "rules exist"}, and none of them lands inside this window.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={RULES_HREF} className={buttonClasses("secondary")}>
              Open the rules
            </Link>
            <Link href={NEW_PLAN_HREF} className={buttonClasses("secondary")}>
              Plan a one-off
            </Link>
          </div>
        }
      />
      <div className="border-t border-line-soft px-5 py-4">
        <div className={caps}>Why</div>
        <ul className="mt-2.5 space-y-2 text-[12.5px] text-muted">
          {reasons.map((reason) => (
            <li key={reason} className="flex gap-2.5">
              <span aria-hidden="true" className="shrink-0 text-faint">
                ·
              </span>
              <span className="min-w-0">{reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * One-offs dated past the end of the window. They are not on the line yet and they do
 * not change any figure on this screen — but they exist, and something that exists with
 * no way back to it is how a plan quietly becomes unreachable.
 */
function BeyondHorizon({ items, horizon }: { items: PlannedRow[]; horizon: string }) {
  if (items.length === 0) return null;

  return (
    <Panel
      title="Further out"
      action={
        <PanelMeta>
          {items.length} planned past <span className="mono">{horizon}</span>
        </PanelMeta>
      }
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 border-b border-line-soft px-4 py-2 last:border-b-0"
        >
          <Marker source="planned" color={item.category?.color ?? null} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-ink">{item.name}</div>
            <div className="mono text-[11.5px] text-muted">
              {item.due_on} · {item.category?.name ?? "No category"}
            </div>
          </div>
          <span
            className={cn(
              "mono shrink-0 text-[13px] font-semibold",
              item.kind === "income" ? "text-ok" : "text-ink",
            )}
          >
            {item.kind === "income" ? "+" : "−"} {formatAmount(Number(item.amount), item.currency)}
          </span>
          <Link
            href={planHref(item.id)}
            aria-label={`Edit ${item.name}`}
            title={`Edit ${item.name}`}
            className="shrink-0 rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
          >
            <Pencil className="h-3.75 w-3.75" />
          </Link>
        </div>
      ))}
    </Panel>
  );
}

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

  return (
    <>
      {shortfall && low && (
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

      {/* Three zeroes above an empty timeline say nothing the empty state does not. */}
      {lines.length > 0 && (
        <div className="grid gap-3 min-[560px]:grid-cols-3">
          {windows.map((w) => {
            const leaves = startingBalance + w.net;
            return (
              <Kpi
                key={w.days}
                label={`Next ${w.days} days`}
                value={formatRsd(w.expense)}
                hint={
                  <>
                    <span className="block">
                      {w.count} {w.count === 1 ? "item" : "items"}
                      {w.income > 0 && <> · {formatRsd(w.income)} coming in</>}
                      {w.saving > 0 && (
                        <span className="text-info"> · {formatRsd(w.saving)} into goals</span>
                      )}
                    </span>
                    {w.everyday > 0 && (
                      <span className="block font-normal text-faint">
                        plus {formatRsd(w.everyday)} projected for living
                      </span>
                    )}
                    <span className="block">
                      leaves{" "}
                      <span className={cn("mono", leaves < 0 ? "text-danger" : "text-ink")}>
                        {formatRsd(leaves)}
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
          Starting from <span className="mono text-ink">{formatRsd(startingBalance)}</span>:{" "}
          <span className="mono">{formatRsd(onAccounts)}</span> on the accounts, less{" "}
          <span className="mono text-info">{formatRsd(reserved)}</span> already set aside for
          goals. That money has not gone anywhere — it just cannot pay a bill.
        </p>
      )}

      <Panel
        title={longest > 0 ? `Next ${longest} days` : "Timeline"}
        action={
          <PanelMeta>
            <span className="hidden min-[420px]:inline">
              {running} {running === 1 ? "rule" : "rules"} running
              {plannedOnLine > 0 && ` · ${plannedOnLine} planned`} ·{" "}
            </span>
            from <span className="mono text-ink">{formatRsd(startingBalance)}</span> free
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
              of their last bookings — marked <span className="text-info">Estimate</span> in the
              list, and every one of them opens to show the bookings behind it.{" "}
            </>
          )}
          {everydayTotal > 0 && (
            <>
              <span className="mono">{formatRsd(everydayTotal)}</span> of the total is projected
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
