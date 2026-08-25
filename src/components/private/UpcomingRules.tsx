"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pause, Pencil, Play, Repeat, Search } from "lucide-react";
import { removeRecurring, toggleRecurring } from "@/app/(app)/private/actions";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { buttonClasses } from "@/components/ui/Button";
import { formatAmount, formatRsd, toRsd, type Rates } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { RecurringTotals } from "@/lib/data/money";
import type { RecurringRow } from "@/lib/types";
import { NEW_RULE_HREF, RULES_HREF, daysBetween, isRunning, whenLabel } from "./upcoming";

/** Small caps label — column heads and captions, same token as Setup and Goals. */
const caps = "text-[10.5px] font-semibold uppercase tracking-wider text-faint";

/** A category with no colour of its own falls back to a token, never a stray hex. */
const NO_COLOUR = "var(--color-faint)";

/**
 * Weekly and yearly rules normalised to a month, so one figure can be compared.
 * Mirrors PER_MONTH in `@/lib/data/money.ts` — the per-row figure and the total above
 * it have to be worked out the same way or the column would not add up to the KPI.
 */
const PER_MONTH: Record<string, number> = { week: 52 / 12, month: 1, year: 1 / 12 };

const EVERY_LABEL: Record<string, string> = {
  week: "Every week",
  month: "Every month",
  year: "Every year",
};

const EVERY_SHORT: Record<string, string> = { week: "a week", month: "a month", year: "a year" };

/**
 * One column template, shared by the head strip and every row — they only line up if
 * both are measured the same way. Under 760px a rule stacks: name and controls, then
 * where and how often, then the two figures side by side under their own labels.
 */
const ruleCols =
  "grid grid-cols-2 gap-x-3 gap-y-2 min-[760px]:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem_6.5rem] min-[760px]:items-center";

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

type Reading = {
  running: boolean;
  settled: boolean;
  /** Dinars in an average month. Null when the amount is not known in advance. */
  monthly: number | null;
  /** The instalment countdown, when the rule keeps one. */
  countdown: { status: "ok" | "draft"; label: string } | null;
  /** True when this one puts money aside instead of paying for something. */
  toGoal: boolean;
};

/**
 * Dinars in an average month, or null when there is no honest figure — a variable rule
 * has no per-item amount here, and guessing one would put a number in the column that
 * nothing behind it supports.
 *
 * Its own function because the row prints it and the "costs most" sort ranks by it:
 * two readings of the same thing would eventually disagree, and a list sorted by a
 * figure other than the one it shows is worse than no sort at all.
 */
function monthlyFor(item: RecurringRow, rates: Rates): number | null {
  const amount = Number(item.amount);
  if (item.variable || !(amount > 0)) return null;
  return toRsd(amount, item.currency, rates) * (PER_MONTH[item.every] ?? 1);
}

/**
 * Everything a row says, worked out from what a rule actually carries: its amount and
 * currency, how often it repeats, the instalments booked so far and its end date.
 * A variable rule has no per-item amount to show — there is no honest monthly figure
 * for it here, so the column says so rather than guessing one.
 */
function read(item: RecurringRow, rates: Rates): Reading {
  const total = item.installments_total;
  const done = item.installments_done ?? 0;
  const settled = total != null && done >= total;

  const monthly = monthlyFor(item, rates);

  const left = total != null ? Math.max(total - done, 0) : null;
  const countdown = settled
    ? { status: "ok" as const, label: `Paid off · ${total} of ${total}` }
    : left != null
      ? { status: "draft" as const, label: `${left} of ${total} left` }
      : null;

  return { running: isRunning(item), settled, monthly, countdown, toGoal: item.goal != null };
}

function RuleRow({ item, rates, today }: { item: RecurringRow; rates: Rates; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const r = read(item, rates);
  const income = item.kind === "income";

  const flip = () => {
    startTransition(async () => {
      await toggleRecurring(item.id, !item.active);
      router.refresh();
    });
  };

  const controls = (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={flip}
        disabled={pending}
        aria-label={item.active ? `Pause ${item.name}` : `Resume ${item.name}`}
        title={item.active ? "Pause — stop booking this one" : "Resume"}
        className="inline-flex rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink disabled:opacity-50"
      >
        {item.active ? <Pause className="h-3.75 w-3.75" /> : <Play className="h-3.75 w-3.75" />}
      </button>
      <Link
        href={`${RULES_HREF}&edit=${item.id}`}
        aria-label={`Edit ${item.name}`}
        title="Edit"
        className="inline-flex rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
      >
        <Pencil className="h-3.75 w-3.75" />
      </Link>
      <DeleteButton
        compact
        label={`Delete ${item.name}`}
        confirmText="Delete this recurring item? It stops repeating from now on — entries already booked from it stay in Money."
        action={async () => {
          await removeRecurring(item.id);
          router.refresh();
        }}
      />
    </div>
  );

  // A paused rule keeps its next date — that is where it picks up again — but saying
  // how many days off it is would promise something that is not going to happen.
  const when = r.settled
    ? "finished"
    : !item.active
      ? "paused"
      : whenLabel(daysBetween(today, item.next_on));
  const overdue = r.running && item.next_on < today;

  return (
    <div
      className={cn(
        ruleCols,
        "border-b border-line-soft px-4 py-3 last:border-b-0 hover:bg-white/2",
        !r.running && "bg-white/[0.015]",
      )}
    >
      <div className="col-span-2 flex min-w-0 items-start gap-3 min-[760px]:col-span-1">
        <span
          aria-hidden="true"
          className={cn("mt-0.5 h-8 w-1 shrink-0 rounded-pill", !r.running && "opacity-45")}
          style={{ background: item.goal?.color ?? item.category?.color ?? NO_COLOUR }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "min-w-0 truncate text-[13.5px] font-semibold",
                  r.running ? "text-ink" : "text-muted",
                )}
              >
                {item.name}
              </span>
              {item.variable && <Badge status="info">Variable</Badge>}
              {r.toGoal && <Badge status="info">Into a goal</Badge>}
              {r.countdown && <Badge status={r.countdown.status}>{r.countdown.label}</Badge>}
              {!item.active && !r.settled && <Badge status="draft">Paused</Badge>}
            </div>
            <div className="ml-auto min-[760px]:hidden">{controls}</div>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-muted">
            <span>{EVERY_LABEL[item.every] ?? item.every}</span>
            <Dot />
            {item.goal ? (
              <span className="min-w-0 truncate text-info">{item.goal.name}</span>
            ) : (
              <span className="min-w-0 truncate">{item.category?.name ?? "No category"}</span>
            )}
            <Dot />
            <span className="min-w-0 truncate">{item.account?.name ?? "No account"}</span>
            {item.ends_on && (
              <>
                <Dot />
                <span className="mono">until {item.ends_on}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 min-[760px]:justify-end">
        <span className={cn(caps, "min-[760px]:hidden")}>Per month</span>
        <div className="text-right">
          {r.monthly === null ? (
            <span className="text-[12.5px] text-faint">changes</span>
          ) : (
            <>
              <div
                className={cn(
                  "mono text-[13.5px] font-semibold",
                  !r.running
                    ? "text-faint"
                    : income
                      ? "text-ok"
                      : r.toGoal
                        ? "text-info"
                        : "text-ink",
                )}
              >
                {income && "+ "}
                {formatRsd(r.monthly)}
              </div>
              {(item.currency !== "RSD" || item.every !== "month") && (
                <div className="mono text-[11px] text-faint">
                  {formatAmount(Number(item.amount), item.currency)} {EVERY_SHORT[item.every] ?? ""}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 min-[760px]:justify-end">
        <span className={cn(caps, "min-[760px]:hidden")}>Next due</span>
        <div className="text-right">
          <div
            className={cn(
              "mono text-[12.5px]",
              r.settled ? "text-faint" : r.running ? "text-ink" : "text-muted",
            )}
          >
            {r.settled ? "—" : item.next_on}
          </div>
          {when && (
            <div className={cn("text-[11px]", overdue ? "text-danger" : "text-faint")}>{when}</div>
          )}
        </div>
      </div>

      <div className="hidden justify-end min-[760px]:flex">{controls}</div>
    </div>
  );
}

function RuleHead() {
  return (
    <div
      aria-hidden="true"
      className="hidden border-b border-line-soft px-4 py-1.5 min-[760px]:grid min-[760px]:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem_6.5rem] min-[760px]:items-center min-[760px]:gap-x-3"
    >
      <span className={caps}>Rule</span>
      <span className={cn(caps, "text-right")}>Per month</span>
      <span className={cn(caps, "text-right")}>Next due</span>
      <span />
    </div>
  );
}

/* ------------------------------------------------------------ the handles */

/**
 * Below this many rules the register is read, not searched. A filter bar over five
 * rows is chrome standing in front of the thing it is meant to help with; over thirty
 * it is the only way to answer a question without reading everything.
 */
const FILTERS_FROM = 6;

type SortKey = "due" | "cost" | "name";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "due", label: "Next due first" },
  { value: "cost", label: "Costs most first" },
  { value: "name", label: "Name A–Z" },
];

const EVERY_FILTER: { value: string; label: string }[] = [
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

/**
 * What a rule is *for*, as one value: a category, a goal, or neither.
 *
 * A standing order into a goal carries no category — the row puts the goal's name
 * where the category would be — so both live in one select, keyed apart by prefix so
 * a goal and a category sharing a name stay two different filters.
 */
function purposeKey(item: RecurringRow): string {
  if (item.goal) return `g:${item.goal.name}`;
  return item.category ? `c:${item.category.name}` : "none";
}

function purposeLabel(item: RecurringRow): string {
  if (item.goal) return item.goal.name;
  return item.category?.name ?? "No category";
}

function accountKey(item: RecurringRow): string {
  return item.account ? `a:${item.account.name}` : "none";
}

function accountLabel(item: RecurringRow): string {
  return item.account?.name ?? "No account";
}

/**
 * The values a select can honestly offer: the ones this register actually contains.
 * Offering "Subscriptions" to someone who has no subscription rule is a filter that
 * can only ever return nothing.
 */
function optionsFrom(
  items: RecurringRow[],
  key: (item: RecurringRow) => string,
  label: (item: RecurringRow) => string,
): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const item of items) if (!seen.has(key(item))) seen.set(key(item), label(item));
  return [...seen]
    .map(([value, text]) => ({ value, label: text }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * How much a rule takes off the account in an average month, for the "costs most"
 * sort. Money coming in is not a cost, so it is ranked by the negative of its figure:
 * the bills descend from the top and income settles at the far end, biggest last.
 * Null — a variable rule with no set amount — has no rank and sinks below both.
 */
function costRank(item: RecurringRow, rates: Rates): number | null {
  const monthly = monthlyFor(item, rates);
  if (monthly === null) return null;
  return item.kind === "income" ? -monthly : monthly;
}

const control =
  "rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-[12.5px] text-ink scheme-dark focus:border-gold focus:shadow-ring";

function Filter({
  value,
  onChange,
  label,
  all,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  all: string;
  options: { value: string; label: string }[];
}) {
  // One real choice is not a choice — a select offering "All accounts" and the single
  // account every rule already uses can only ever be a no-op.
  if (options.length < 2) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={control}
    >
      <option value="" className="bg-surface">
        {all}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-surface">
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Nothing recurring yet — so the panel has to explain what a rule is for on its own. */
function NoRules() {
  const steps = [
    "Name it, say what it costs and when it next falls due.",
    "Fixed amounts book themselves the first time you open this after the date passes. Variable ones — electricity, water — wait for you to type the amount.",
    "Give it a number of payments or an end date and it stops on its own when it is done.",
  ];

  return (
    <>
      <EmptyState
        icon={Repeat}
        title="Nothing repeats yet"
        description="Hosting, domains, subscriptions, rent, a phone paid off in instalments — enter each one once and never type it again."
        action={
          <Link href={NEW_RULE_HREF} className={buttonClasses("primary")}>
            New recurring
          </Link>
        }
      />
      <div className="border-t border-line-soft px-5 py-4">
        <div className={caps}>How a rule works</div>
        <ol className="mt-2.5 space-y-2 text-[12.5px] text-muted">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-2.5">
              <span className="mono shrink-0 text-[11.5px] text-faint">{i + 1}</span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

export function UpcomingRules({
  items,
  totals,
  rates,
}: {
  items: RecurringRow[];
  totals: RecurringTotals;
  rates: Rates;
}) {
  // Read the same way Setup and Goals read today — UTC on both sides, so nothing disagrees.
  const today = new Date().toISOString().slice(0, 10);

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

  const running = items.filter(isRunning);
  const stopped = items.filter((i) => !isRunning(i));

  const purposes = optionsFrom(items, purposeKey, purposeLabel);
  const accounts = optionsFrom(items, accountKey, accountLabel);
  const intervals = EVERY_FILTER.filter((o) => items.some((i) => i.every === o.value));

  const term = q.trim().toLowerCase();
  const narrowed = Boolean(term || purpose || account || every);

  const matching = items.filter((item) => {
    if (term && !item.name.toLowerCase().includes(term)) return false;
    if (purpose && purposeKey(item) !== purpose) return false;
    if (account && accountKey(item) !== account) return false;
    if (every && item.every !== every) return false;
    return true;
  });

  const sorted = [...matching].sort((a, b) => {
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
  });

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
  };

  const toolbar = items.length >= FILTERS_FROM && (
    <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-white/[0.02] px-4 py-2.5">
      <div className="relative min-w-40 flex-1 min-[560px]:max-w-56">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 h-3.75 w-3.75 -translate-y-1/2 text-faint"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          placeholder="Search by name…"
          aria-label="Search rules by name"
          className={cn(control, "w-full py-1.5 pr-2.5 pl-8 placeholder:text-faint")}
        />
      </div>

      <Filter
        value={purpose}
        onChange={setPurpose}
        label="Filter by category or goal"
        all="All categories"
        options={purposes}
      />
      <Filter
        value={account}
        onChange={setAccount}
        label="Filter by account"
        all="All accounts"
        options={accounts}
      />
      <Filter
        value={every}
        onChange={setEvery}
        label="Filter by how often it repeats"
        all="Any interval"
        options={intervals}
      />

      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as SortKey)}
        aria-label="Sort rules"
        className={control}
      >
        {SORTS.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface">
            {o.label}
          </option>
        ))}
      </select>

      {/* What is being left out, said out loud. A list that quietly shrank is a list
          you cannot trust to be complete when you go looking for something. */}
      {narrowed && (
        <div className="ml-auto flex items-center gap-2 whitespace-nowrap">
          <span aria-live="polite" className="mono text-[11.5px] text-muted">
            {sorted.length} of {items.length}
            <span className="sr-only"> rules shown</span>
          </span>
          <button
            type="button"
            onClick={clear}
            className="rounded-ctrl px-2 py-1 text-[11.5px] font-semibold text-gold-hi transition-colors hover:bg-active-bg"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* The two figures and the sentence that separates them are one block. */}
      {items.length > 0 && (
        <div className="space-y-2.5">
          <div className="grid gap-3 min-[560px]:grid-cols-2 lg:grid-cols-3">
            <Kpi
              label="Per month, on average"
              value={formatRsd(totals.expense)}
              hint="A run rate — a yearly bill spread over twelve, a weekly one multiplied up. Running rules only."
            />
            <Kpi
              label="Falls due within a year"
              value={formatRsd(totals.yearExpense)}
              hint={`${totals.yearCount} ${totals.yearCount === 1 ? "date" : "dates"} between today and ${totals.yearHorizon}`}
            />
            {totals.saving > 0 && (
              <Kpi
                label="Into goals, per month"
                value={formatRsd(totals.saving)}
                hint={`${formatRsd(totals.yearSaving)} over the next year. Not spent — set aside.`}
              />
            )}
            {(totals.income > 0 || totals.saving > 0) && (
              <Kpi
                label="Net per month"
                value={formatRsd(totals.net)}
                hint={
                  totals.income > 0
                    ? `After ${formatRsd(totals.income)} a month coming in${totals.saving > 0 ? ", and what goes into goals" : ""}`
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
