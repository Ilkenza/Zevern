import Link from "next/link";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { formatRsd, monthLabel } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Forecast, ForecastLine } from "@/lib/data/money";
import type { RecurringRow } from "@/lib/types";
import { DueRecurringPanel } from "./DueRecurringPanel";
import { NEW_RULE_HREF, RULES_HREF, addDays, daysBetween, isRunning, whenLabel } from "./upcoming";

/** Small caps label — column heads and captions, same token as Setup and Goals. */
const caps = "text-[10.5px] font-semibold uppercase tracking-wider text-faint";

/** A category with no colour of its own falls back to a token, never a stray hex. */
const NO_COLOUR = "var(--color-faint)";

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
 * the item that tips it over, and the amount that would have to arrive to stop it.
 *
 * Free, not total — money already put aside for a goal is not available to pay a bill,
 * so counting it here would hide the day this actually happens.
 */
function Shortfall({
  line,
  low,
  from,
  reserved,
}: {
  line: ForecastLine;
  low: ForecastLine;
  from: string;
  reserved: number;
}) {
  const when = whenLabel(daysBetween(from, line.on));
  const deeper = low.on !== line.on && low.balance < line.balance;

  return (
    <section className="rounded-card border border-danger/40 bg-danger-bg px-4 py-3.5">
      <div className="flex items-start gap-3">
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
              after {line.name}
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
    </section>
  );
}

/** One due date: what it is, when it lands, what it costs, what it leaves behind. */
function Row({ line, from }: { line: ForecastLine; from: string }) {
  const days = daysBetween(from, line.on);
  const when = whenLabel(days);
  const income = line.kind === "income";

  return (
    <div className="flex items-start gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0">
      <span
        aria-hidden="true"
        className="mt-0.5 h-8 w-1 shrink-0 rounded-pill"
        style={{ background: line.color ?? NO_COLOUR }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-[13.5px] font-medium text-ink">{line.name}</span>
          {days !== null && days < 0 && <Badge status="danger">Not booked yet</Badge>}
          {days === 0 && <Badge status="active">Today</Badge>}
          {line.estimated && <Badge status="info">Estimate</Badge>}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted">
          <span className="mono">{line.on}</span>
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
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div
          className={cn(
            "mono text-[13.5px] font-semibold",
            income
              ? "text-ok"
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
      group = { key, rows: [], expense: 0, income: 0, saving: 0, closing: line.balance };
      groups.push(group);
    }
    group.rows.push(line);
    if (line.kind === "income") group.income += line.amount;
    else if (line.goal) group.saving += line.amount;
    else group.expense += line.amount;
    group.closing = line.balance;
  }
  return groups;
}

function MonthHead({ group }: { group: MonthGroup }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line-soft bg-white/[0.02] px-4 py-2">
      <span className="text-[11.5px] font-semibold text-ink">
        {monthLabel(group.key)}
        <span className="ml-1.5 font-normal text-faint">
          {group.rows.length} {group.rows.length === 1 ? "item" : "items"}
        </span>
      </span>
      <span className="mono text-[11px] text-muted">
        −{formatRsd(group.expense)}
        {group.income > 0 && <> · +{formatRsd(group.income)}</>}
        {group.saving > 0 && (
          <span className="text-info"> · {formatRsd(group.saving)} aside</span>
        )}
        {" · "}
        <span className={group.closing < 0 ? "text-danger" : "text-faint"}>
          leaves {formatRsd(group.closing)}
        </span>
      </span>
    </div>
  );
}

/**
 * Nothing on the timeline is not the same as nothing to say. Either no rule exists
 * yet, or rules exist and every one of them is out of this window for a reason the
 * rules themselves record — paused, finished, dated later, or variable with no past
 * bookings to estimate from. Say which, and nothing that is not in the data.
 */
function NothingDue({
  items,
  unknown,
  horizon,
}: {
  items: RecurringRow[];
  unknown: number;
  horizon: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing repeats yet"
        description="Rent, hosting, a domain, a phone paid off in instalments. Enter each one once and this turns into a plan instead of a surprise."
        action={
          <Link href={NEW_RULE_HREF} className={buttonClasses("primary")}>
            New recurring
          </Link>
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

  return (
    <>
      <EmptyState
        icon={CalendarClock}
        title={`Nothing falls due before ${horizon}`}
        description={`${items.length} recurring ${items.length === 1 ? "rule exists" : "rules exist"}, and none of them lands inside this window.`}
        action={
          <Link href={RULES_HREF} className={buttonClasses("secondary")}>
            Open the rules
          </Link>
        }
      />
      {reasons.length > 0 && (
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
      )}
    </>
  );
}

export function UpcomingTimeline({
  forecast,
  items,
  due,
}: {
  forecast: Forecast;
  items: RecurringRow[];
  due: RecurringRow[];
}) {
  const { lines, windows, startingBalance, onAccounts, reserved, estimated, unknown, from } =
    forecast;

  // Windows come back sorted, shortest first — the last one is how far this looks.
  const longest = windows.length > 0 ? windows[windows.length - 1].days : 0;
  const horizon = addDays(from, longest);

  const shortfall = lines.find((l) => l.balance < 0) ?? null;
  const low = lines.reduce<ForecastLine | null>(
    (worst, l) => (worst === null || l.balance < worst.balance ? l : worst),
    null,
  );

  const groups = byMonth(lines);
  const running = items.filter(isRunning).length;

  return (
    <>
      {shortfall && low && (
        <Shortfall line={shortfall} low={low} from={from} reserved={reserved} />
      )}

      <DueRecurringPanel due={due} />

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
              {running} {running === 1 ? "rule" : "rules"} running ·{" "}
            </span>
            from <span className="mono text-ink">{formatRsd(startingBalance)}</span> free
          </PanelMeta>
        }
      >
        {lines.length === 0 ? (
          <NothingDue items={items} unknown={unknown} horizon={horizon} />
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

      {/* When the timeline is empty the empty state has already said all of this. */}
      {lines.length > 0 && (estimated > 0 || unknown > 0) && (
        <p className="text-[11.5px] leading-relaxed text-muted">
          {estimated > 0 && (
            <>
              {estimated} variable {estimated === 1 ? "item is" : "items are"} shown at the average
              of their last bookings — marked <span className="text-info">Estimate</span> in the
              list.{" "}
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
