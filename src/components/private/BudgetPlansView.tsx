"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Plus, Target, Pencil, Receipt } from "lucide-react";
import { deleteBudgetPlan, loadBudgetEntries } from "@/app/(app)/private/actions";
import { SlideOver } from "@/components/ui/SlideOver";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { ListBar } from "@/components/ui/ListBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { useMoney } from "@/lib/money/currency";
import { clockLabel } from "@/lib/money/budget-periods";
import { boostNote, filedNote } from "@/lib/money/budget-boosts";
import { cn } from "@/lib/utils";
import { fold } from "@/lib/money/entry-search";
import type {
  BudgetPlanLine,
  MoneyAccount,
  MoneyBudgetBoost,
  MoneyCategory,
} from "@/lib/types";
import type { BudgetEntry, BudgetPast } from "@/lib/data/money";
import { BudgetPlanForm } from "./budgets/BudgetPlanForm";
import {
  PLAN_STATUS_LABEL,
  PLAN_STATUS_TONE,
  readPlan,
  shortDate,
  windowLabel,
} from "./budgets/plan-reading";

/**
 * The windows behind this one, as six small bars.
 *
 * A card only knows about today, and today cannot tell an unusual month from a limit that
 * was always too low. Those are opposite problems: one wants you to spend less this week,
 * the other wants the number changed. Six bars answer it at a glance and take one row.
 *
 * Each bar is drawn against the amount that window actually ran under, not today's — a
 * strip redrawn every time the limit is edited would be a strip that quietly agrees with
 * whatever you last decided.
 */
/**
 * How many slots the strip always draws, filled or not.
 *
 * Fixed rather than "however many windows exist", because a single bar stretched across
 * a whole card is not a small chart — it is a gold slab, and it reads as a component that
 * broke. Six slots means the first month is one sixth wide with five faint marks waiting
 * beside it, which says "this fills up" without a word.
 */
const PAST_SLOTS = 6;

/**
 * The states that get a word beside the figure.
 *
 * Being fine is the ordinary case and does not need announcing; the two that do are the
 * ceiling broken and the floor missed, plus a budget with no amount, which is not a
 * verdict at all but a thing left unfinished.
 */
const LOUD_STATUS = new Set(["over", "ahead", "behind", "unset"]);

/**
 * Every state a budget can be standing in, worst first.
 *
 * The same order the page's own `Need` sort uses, so the chip row reads top-down in the
 * order the cards under it are already in. `finished` is not a status — a window that has
 * closed has whatever verdict it ended on — but it is the one state you sort *away* from
 * rather than toward, so it sits at the end on its own.
 */
const STATE_ORDER = ["over", "unset", "ahead", "behind", "ontrack", "met", "finished"] as const;

type BudgetState = (typeof STATE_ORDER)[number];

/**
 * The word for each, taken from the card rather than invented for the chip.
 *
 * `PLAN_STATUS_LABEL` is what a card prints beside its figure, so a chip saying `Over`
 * and a card saying `Over` cannot drift apart — there is one place either word is
 * written. The quiet states have a word here too, even though a quiet card prints none:
 * being on track is not worth announcing on eleven cards, and is worth naming once on a
 * chip that tells you how many of them there are.
 */
const STATE_LABEL: Record<BudgetState, string> = {
  ...PLAN_STATUS_LABEL,
  finished: "Finished",
};

/**
 * The windows behind this one, as six small bars.
 *
 * A card only knows about today, and today cannot tell an unusual month from a limit that
 * was always too low. Those are opposite problems: one wants you to spend less this week,
 * the other wants the number changed. Six bars answer it at a glance and take one row.
 *
 * Each bar is drawn against the amount that window actually ran under, not today's — a
 * strip redrawn every time the limit is edited would be a strip that quietly agrees with
 * whatever you last decided.
 */
function PastStrip({ past, onOpen }: { past: BudgetPast[]; onOpen: () => void }) {
  const { fmt } = useMoney();
  const finished = past.filter((p) => !p.current);

  /*
    Nothing behind it yet, so nothing is drawn.

    This used to render on the first day of a budget's life: six empty slots, one bar, and
    a line reading "First period — the strip fills as months finish". Three elements and a
    third of the card's height spent reporting that there is nothing to report — on every
    card at once, because budgets tend to be made in one sitting. The strip is worth its
    room the moment it has a month to compare against, and not one day before.
  */
  if (finished.length === 0) return null;

  // The record goes back a year; the card shows the tail of it. The rest is one tap away.
  const shown = past.slice(-PAST_SLOTS);
  const over = finished.filter((p) => p.limitRsd > 0 && p.used > p.limitRsd).length;
  // Empty slots go on the left, where older months would be, so the running one stays at
  // the right-hand end where the eye already looks for "now".
  const blanks = Math.max(0, PAST_SLOTS - shown.length);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="zv-past mt-3 w-full border-t border-line-soft pt-2.5 text-left"
      aria-label="See every period"
    >
      <div className="grid grid-cols-6 items-end gap-1.5" style={{ minHeight: "28px" }}>
        {Array.from({ length: blanks }).map((_, i) => (
          <span
            key={`blank-${i}`}
            className="block h-0.5 w-full rounded-pill bg-white/[0.05]"
            aria-hidden
          />
        ))}
        {shown.map((p) => {
          const share = p.limitRsd > 0 ? p.used / p.limitRsd : 0;
          const isOver = p.limitRsd > 0 && p.used > p.limitRsd;
          /*
            Height is the fill, floored so a quiet month is still a bar rather than a gap —
            an invisible bar reads as a month that failed to load, not one that cost
            nothing. How far past the limit is in the title, because six bars cannot carry
            six numbers.
          */
          const height = Math.max(3, Math.min(1, share) * 26);
          return (
            <span
              key={p.window.from}
              className="block w-full rounded-t-[3px]"
              title={`${windowLabel(p.window)}${p.current ? " · still running" : ""} · ${fmt(
                p.used,
              )} of ${fmt(p.limitRsd)}${
                p.boostedBy.length ? ` · raised by ${p.boostedBy.join(", ")}` : ""
              }`}
              style={{
                height: `${height}px`,
                background: isOver ? "var(--color-danger)" : "var(--color-gold)",
                // The window still running is the brightest, because it is the only one you
                // can still do anything about. History is there to be compared against.
                opacity: p.current ? 1 : isOver ? 0.85 : 0.4,
              }}
            />
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-faint">
        {/*
          The sentence the bars cannot say. Four of the last six over the line is not an
          overspend, it is a limit set too low — and a card that only knows about today
          reads those two as the same thing.
        */}
        {finished.length === 0
          ? "First period — the strip fills as months finish"
          : over === 0
            ? `Inside it all ${finished.length} finished ${finished.length === 1 ? "period" : "periods"}`
            : `${over} of the last ${finished.length} went over`}
        <span className="zv-past-more">every period →</span>
      </p>
    </button>
  );
}

/**
 * How full, against how far along — the one picture this app draws of a budget.
 *
 * Written once and used by the card and by the panel the card opens, because a detail
 * view whose instrument is a second implementation of the summary's instrument is a pair
 * that will drift: same numbers, subtly different bar, and no way to tell which is right.
 */
function Meter({ line, fill, pace }: { line: BudgetPlanLine; fill: number; pace: number }) {
  /*
    Where `Today` hangs off its tick. Centred over it reads best, and at either end of a
    period it would hang off the bar and land on the date printed there — so near the ends
    it pins to the side that still has room, without moving the tick, which must stay
    honest.
  */
  const nowAt = Math.min(1, Math.max(0, pace));
  const nowSide = nowAt > 0.86 ? "is-end" : nowAt < 0.14 ? "is-start" : "";
  return (
    <div className="bud-span">
      <span className="bud-edge">{shortDate(line.window.from)}</span>
      <div className="bud-track">
        <span className="bud-fill" style={{ width: `${fill * 100}%` }} />
        {!line.window.ended && (
          <span className={cn("bud-now", nowSide)} style={{ left: `${nowAt * 100}%` }}>
            <i>Today</i>
          </span>
        )}
      </div>
      <span className="bud-edge">{shortDate(line.window.to)}</span>
    </div>
  );
}

/**
 * How full the bar runs, and whether it runs red.
 *
 * Red is for the two things that have already happened — a ceiling broken and a month
 * that went backwards — not for `behind`, which is a pace warning whose own word prints
 * gold; a bar going red beside a gold verdict is the card disagreeing with itself. A
 * savings month below zero has no `pct` to draw and used to draw nothing at all, which
 * made the worst card on the screen look like one nobody had started; the hole is drawn
 * instead, capped at full, because past that only the figure can say how far past.
 */
function readingOf(line: BudgetPlanLine, reading: { status: string; pct: number }) {
  const bad = reading.status === "over" || (line.plan.kind === "savings" && line.used < 0);
  const deficit =
    line.plan.kind === "savings" && line.used < 0 && line.limitRsd > 0
      ? Math.min(1, -line.used / line.limitRsd)
      : 0;
  return { bad, fill: deficit > 0 ? deficit : reading.pct };
}

/**
 * One budget, on one line of time.
 *
 * The card is read in passing, so its picture has to explain itself with nothing beside
 * it — which a ring never did. A circle has no beginning the eye can find, so both the
 * fill and the mark for today had to be learned before either meant anything, and the
 * mark for today came back around to sit beside the start at the end of every period.
 * A line has two ends, and here each one is labelled with the date it actually is. The
 * fill is the money. The tick is today, and it says the word. Nothing has to be taught.
 */
function BudgetCard({
  line,
  past,
  today,
  onEdit,
  onHistory,
}: {
  line: BudgetPlanLine;
  past: BudgetPast[];
  today: string;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const { fmt } = useMoney();
  const reading = readPlan(line, today, fmt);
  const limit = line.limitRsd;
  const note = boostNote({ extra: line.extra, sources: line.boostedBy }, fmt);
  const filed = filedNote(line.filed, line.filedIn, fmt);
  const { bad, fill } = readingOf(line, reading);

  return (
    <div className={cn("bud-card", bad && "is-bad")}>
      <div className="bud-head">
        <span className="bud-title">
          {/*
            The name is a label, not the headline. Nobody opens this screen to find out
            what their budgets are called — the figure is what the card is for.
          */}
          <b>{line.plan.name}</b>
          {line.plan.membership === "added" && <em>added only</em>}
        </span>
        {/*
          How often it comes back, and nothing about dates: the bar underneath is made of
          dates and says them at both ends. A budget with fixed dates repeats never, which
          its own heading already says, so it prints nothing here at all.
        */}
        {(line.plan.period !== "custom" || line.window.ended) && (
          <span className="bud-clock">
            {line.plan.period === "custom"
              ? ""
              : clockLabel({
                  period: line.plan.period as "day" | "week" | "month" | "year",
                  period_count: line.plan.period_count,
                  starts_on: line.plan.starts_on,
                  ends_on: line.plan.ends_on,
                })}
            {line.window.ended
              ? line.plan.period === "custom"
                ? "finished"
                : " · finished"
              : ""}
          </span>
        )}
      </div>

      {/*
        The unit once. `5.237 RSD of 20.000 RSD` said RSD twice on every card.

        And `of` only where something is being consumed. A savings budget is a floor to
        reach, not a ceiling to eat into — `-28.123 of 20.000` described a month that had
        spent minus twenty-eight thousand of its allowance, which is not a sentence.
      */}
      <span className="bud-used">
        {fmt(line.used).replace(/\s*RSD$/, "")}
        <i>
          {line.plan.kind === "savings" ? "toward" : "of"} {fmt(limit)}
        </i>
      </span>

      <Meter line={line} fill={fill} pace={reading.pace} />

      <p className="bud-note">
        {reading.note}
        {filed && <i> · {filed}</i>}
        {note && <em> · {note}</em>}
      </p>

      {/*
        The verdict, only when it is one — and the controls only when the pointer is here.
        On a quiet month the card carries no word at all: the bar has already said it.
      */}
      <div className="bud-corner">
        {LOUD_STATUS.has(reading.status) && (
          <span
            className={cn(
              "bud-verdict",
              bad ? "text-danger" : PLAN_STATUS_TONE[reading.status],
            )}
          >
            {PLAN_STATUS_LABEL[reading.status]}
          </span>
        )}
        {/*
          What is in the figure. The card answers "how much"; this is the only door in the
          app to "which" — and it is the question a number you did not expect always asks.
        */}
        <button
          type="button"
          onClick={onHistory}
          aria-label={`What is in ${line.plan.name}`}
          title="See what is in it"
          className="zv-rowctrl bud-edit"
        >
          <Receipt className="h-3.75 w-3.75" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${line.plan.name}`}
          title="Edit budget"
          className="zv-rowctrl bud-edit"
        >
          <Pencil className="h-3.75 w-3.75" />
        </button>
        {/*
          Deleting from the card, beside editing, rather than only from inside the panel.
          The bin still asks before it does anything — the confirm is the safety here, not
          the distance.
        */}
        <DeleteButton
          compact
          className="bud-edit"
          action={async () => {
            await deleteBudgetPlan(line.plan.id);
          }}
          label={`Delete ${line.plan.name}`}
          confirmText="Delete this budget? The entries it counted stay in the ledger."
        />
      </div>

      <PastStrip past={past} onOpen={onHistory} />
    </div>
  );
}

/**
 * One budget, opened.
 *
 * It leads with the same instrument the card leads with — the figure, the limit, the line
 * of time — because you arrived here from that picture and the panel that answers for it
 * should be anchored by it. Under that, what is actually in the figure. Under that, the
 * windows behind this one, and only once there are any: a "history" of the single period
 * you are standing in is the same numbers a third time.
 */
function HistoryPanel({
  line,
  entries,
  past,
  today,
}: {
  line: BudgetPlanLine;
  /** Null while the read is in flight — an empty list means the window really is empty. */
  entries: BudgetEntry[] | null;
  past: BudgetPast[];
  today: string;
}) {
  const { fmt } = useMoney();
  const reading = readPlan(line, today, fmt);
  const { bad, fill } = readingOf(line, reading);

  const [sort, setSort] = useState<"new" | "big" | "cat">("new");
  const [tag, setTag] = useState<string | null>(null);

  /*
    The things a row is already tagged with, offered as the way to narrow it.

    Not an invented filter vocabulary: every chip here is a word printed on the rows
    below, so what a chip will do is visible before it is pressed. Categories first,
    because that is what a sweeping budget is made of, then the budgets an entry was filed
    into by hand — which is the row-level answer to "14.737 covered by na moru".
  */
  const tags = useMemo(() => {
    if (!entries) return [] as string[];
    const weight = new Map<string, number>();
    const rows = new Map<string, number>();
    const kept = new Set<string>();
    for (const e of entries) {
      for (const t of [e.category, e.filedInto]) {
        if (!t) continue;
        weight.set(t, (weight.get(t) ?? 0) + Math.abs(e.amount));
        rows.set(t, (rows.get(t) ?? 0) + 1);
      }
      // A budget an entry was filed into is always worth offering: it is the row-level
      // answer to the card's "covered by" note even when it covers a single line.
      if (e.filedInto) kept.add(e.filedInto);
    }
    return [...weight.keys()]
      .filter((t) => kept.has(t) || (rows.get(t) ?? 0) > 1)
      .sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0));
  }, [entries]);

  /*
    The order is always there. The filters are not.

    Sorting had a threshold too — four rows, on the reasoning that below it you can see the
    order anyway. That reasoning is about the list; it is not about the person, who opens
    two budgets, finds the control in neither, and concludes the app does not sort. A
    control worth having is one you can point at without checking whether today's data
    earned it, and one row of two words is a cheap price for never having to look for it.

    Filters keep their rule, because theirs is not about crowding: with a single tag the
    only filter on offer keeps every row. That is not a redundant control, it is a button
    that does nothing dressed as a choice.
  */
  const canFilter = tags.length >= 2;

  /*
    Grouping is only an order worth having where there is more than one group.

    It is also the only one of the three that changes the shape of the answer rather than
    the sequence: `Newest` and `Largest` reorder the same list, while this turns it into
    the categories the budget is actually made of. On a budget that sweeps one category it
    would produce the list it already had.
  */
  const canGroup = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entries ?? []) if (e.category) seen.add(e.category);
    return seen.size >= 2;
  }, [entries]);

  const shown = useMemo(() => {
    if (!entries) return null;
    const kept =
      canFilter && tag
        ? entries.filter((e) => e.category === tag || e.filedInto === tag)
        : entries;

    if (sort === "big") {
      return [...kept].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    }

    if (sort === "cat" && canGroup) {
      /*
        Groups by what they cost, not alphabetically — the question this order answers is
        "where did it go", and an A-to-Z list of categories answers it in whatever order
        the alphabet happens to agree with. Inside a group, the largest first for the same
        reason. Anything with no category at all sits at the end: it is not a group.
      */
      const weight = new Map<string, number>();
      for (const e of kept) {
        if (!e.category) continue;
        weight.set(e.category, (weight.get(e.category) ?? 0) + Math.abs(e.amount));
      }
      return [...kept].sort((a, b) => {
        if (!a.category !== !b.category) return a.category ? -1 : 1;
        if (a.category !== b.category) {
          return (
            (weight.get(b.category ?? "") ?? 0) - (weight.get(a.category ?? "") ?? 0) ||
            (a.category ?? "").localeCompare(b.category ?? "")
          );
        }
        return Math.abs(b.amount) - Math.abs(a.amount);
      });
    }

    return kept;
  }, [entries, tag, sort, canFilter, canGroup]);

  const orders: [typeof sort, string][] = canGroup
    ? [
        ["new", "Newest"],
        ["big", "Largest"],
        ["cat", "Category"],
      ]
    : [
        ["new", "Newest"],
        ["big", "Largest"],
      ];

  const finished = [...past].filter((p) => !p.current).reverse();
  const over = finished.filter((p) => p.limitRsd > 0 && p.used > p.limitRsd).length;
  const typical = finished.length
    ? finished.reduce((sum, p) => sum + p.used, 0) / finished.length
    : 0;

  return (
    <div>
      <div className={cn("zv-sheet", bad && "is-bad")}>
        <p className="zv-sheet-sum">
          {fmt(line.used).replace(/\s*RSD$/, "")}
          <i>
            {line.plan.kind === "savings" ? "toward" : "of"} {fmt(line.limitRsd)}
          </i>
        </p>
        <Meter line={line} fill={fill} pace={reading.pace} />
        <p className="zv-sheet-note">{reading.note}</p>
      </div>

      {entries === null ? (
        <p className="zv-entries-sum">Reading the ledger…</p>
      ) : entries.length === 0 || !shown ? (
        <p className="zv-entries-sum">Nothing in it yet.</p>
      ) : (
        <>
          {/*
            The count and the total are the list's own heading — a word above them saying
            what they are would only be repeating what they plainly are. Under a filter
            both describe the slice, not the budget: a total that kept counting rows it had
            stopped showing would be the one kind of number this app must not print.
          */}
          <p className="zv-entries-sum">
            {shown.length === entries.length
              ? shown.length === 1
                ? "1 entry"
                : `${shown.length} entries`
              : `${shown.length} of ${entries.length}`}
            <b>{fmt(shown.reduce((sum, e) => sum + e.amount, 0))}</b>
          </p>

          <div className="zv-listbar">
              <div className="zv-tags">
                {canFilter && (
                  <button
                    type="button"
                    onClick={() => setTag(null)}
                    aria-pressed={tag === null}
                    className={cn("zv-tag", tag === null && "is-on")}
                  >
                    All
                  </button>
                )}
                {canFilter &&
                  tags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTag(tag === t ? null : t)}
                      aria-pressed={tag === t}
                      className={cn("zv-tag", tag === t && "is-on")}
                    >
                      {t}
                    </button>
                  ))}
              </div>

              {/*
                Two words rather than a dropdown. There are exactly two orders worth
                having here, and a menu to choose between two things is a click spent
                announcing that a choice exists.
              */}
              <div className="zv-order">
                {orders.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    aria-pressed={sort === key}
                    className={cn(sort === key && "is-on")}
                  >
                    {label}
                  </button>
                ))}
              </div>
          </div>

          <ul className="zv-entries">
            {shown.map((e) => (
              <li key={e.id} className="zv-entry">
                <span className="zv-entry-on">{shortDate(e.on)}</span>
                <span className="zv-entry-what">
                  <b>{e.title || e.category || "Untitled"}</b>
                  {e.title && e.category && <i>{e.category}</i>}
                  {e.filedInto && <em>{e.filedInto}</em>}
                </span>
                <span className="zv-entry-sum">{fmt(e.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {finished.length === 0 ? (
        <p className="zv-sheet-first">
          First period — it closes {shortDate(line.window.to)}.
        </p>
      ) : (
        <>
          <div className="zv-split">
            <span>Every period</span>
          </div>

          {/*
            Two figures the card cannot carry: how often this budget is broken, and what
            it usually costs — which is the number a limit should actually be set against.
            The running window is left out of the average: a month you are three days into
            would drag it toward nothing and make every budget look generous.
          */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="zv-stat">
              <span>Went over</span>
              <b>
                {over}
                <i> of {finished.length}</i>
              </b>
            </div>
            <div className="zv-stat">
              <span>Usually</span>
              <b>{fmt(typical)}</b>
            </div>
          </div>

          <ul className="space-y-2">
            {finished.map((p) => {
              const isOver = p.limitRsd > 0 && p.used > p.limitRsd;
              const pct = p.limitRsd > 0 ? Math.min(1, p.used / p.limitRsd) : 0;
              return (
                <li key={p.window.from} className="zv-past-row">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] font-semibold text-ink">
                      {windowLabel(p.window)}
                    </span>
                    <span className="mono shrink-0 text-[12.5px] text-ink">
                      {fmt(p.used)}
                      <span className="text-[11.5px] text-faint"> of {fmt(p.limitRsd)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-white/[0.06]">
                    <span
                      className="block h-full rounded-pill"
                      style={{
                        width: `${pct * 100}%`,
                        background: isOver ? "var(--color-danger)" : "var(--color-gold)",
                        opacity: 0.8,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export function BudgetPlansView({
  lines,
  categories,
  accounts,
  boosts,
  histories,
  today,
}: {
  lines: BudgetPlanLine[];
  categories: MoneyCategory[];
  accounts: MoneyAccount[];
  /** Every grant on the profile, so the form can show what a trip already raises. */
  boosts: MoneyBudgetBoost[];
  /** The windows behind the current one, per budget. Empty for anything with fixed dates. */
  histories: Record<string, BudgetPast[]>;
  /** Read on the server, so the client cannot disagree about which period is current. */
  today: string;
}) {
  const { fmt } = useMoney();

  /*
    The entries behind a figure, fetched when the panel opens rather than carried down
    with every card. Eleven budgets' worth of ledger would ride to the browser on every
    page load for a list almost nobody opens, and this way it is always a fresh read.
  */
  const [entries, setEntries] = useState<BudgetEntry[] | null>(null);

  /** How the cards are ordered. */
  const [view, setView] = useState<"need" | "date" | "name" | "big">("need");

  /** Which state is being looked at on its own. Null — every budget — is where it starts. */
  const [state, setState] = useState<BudgetState | null>(null);

  /** Four questions the page cannot answer on its own. `Need` is its own opinion. */
  const ORDERS = [
    { value: "need", label: "What needs you first" },
    { value: "date", label: "Ending soonest" },
    { value: "name", label: "Name A–Z" },
    { value: "big", label: "Largest first" },
  ];

  /** Twenty-four budgets is past the point where you find one by looking. */
  const [q, setQ] = useState("");

  const [panel, setPanel] = useState<
    | { mode: "new" }
    | { mode: "edit"; line: BudgetPlanLine }
    | { mode: "history"; line: BudgetPlanLine }
    | null
  >(null);

  /*
    Two groups, not four, and no caption under either.

    The page used to split by clock as well as direction — Spending, Spending with an end
    date, Saving, Saving with an end date — with a sentence under each explaining what a
    budget of that shape was for. The reason given in this file was that the difference
    was not visible in the cards. It is now: a dated budget prints its two dates and no
    rhythm, a repeating one prints `every month` and no dates, and a savings budget says
    `toward` where a spending one says `of`. Four headings and four sentences were being
    spent restating what every card already said, on a screen whose whole complaint was
    that there was too much to read.
  */

  /*
    What needs you, first.

    Eleven cards in the order they happened to be created is a list you have to read all
    of to find the two that matter — here, Eating out at 98% sitting fourth and a month
    28.000 in the red sitting tenth. So the order is: the ones with something wrong, then
    the ones running quietly, then what has not started, then what is over.

    Only the first tier moves, and it moves for a stated reason the card repeats in words.
    Inside a tier the key is what ends soonest, which is a date rather than a measurement
    — so the page does not quietly rearrange itself every time a coffee is entered.
  */
  /*
    Opened by the click, not by an effect watching what the click changed.

    An effect would have to reset the list on every open and clear it on close, which is
    state chasing state — and the ref is what keeps a slow read for one budget from
    landing in a panel that has since been opened on another.
  */
  const wanted = useRef<string | null>(null);
  /*
    `useCallback` here is not an optimisation and should not be removed as one.

    This handler closes over a ref, and the grid helper below hands it to every card
    during render. Left as a plain function the compiler cannot prove the ref is only
    ever touched from an event, and `react-hooks/refs` fails the build — correctly, since
    reading `.current` while rendering is how a component quietly stops updating. An
    empty dependency list says out loud what is true: nothing in here is rendered from.
  */
  const openEntries = useCallback((line: BudgetPlanLine) => {
    wanted.current = line.plan.id;
    setEntries(null);
    setPanel({ mode: "history", line });
    loadBudgetEntries(line.plan.id).then((rows) => {
      if (wanted.current === line.plan.id) setEntries(rows);
    });
  }, []);

  const urgency = (line: BudgetPlanLine) => {
    if (line.window.ended) return 3;
    const { status } = readPlan(line, today, fmt);
    if (status === "over" || status === "unset") return 0;
    if (line.plan.kind === "savings" && line.used < 0) return 0;
    if (status === "ahead" || status === "behind") return 1;
    if (today < line.window.from) return 2.5;
    return 2;
  };

  const byNeed = (a: BudgetPlanLine, b: BudgetPlanLine) =>
    urgency(a) - urgency(b) ||
    (a.window.to < b.window.to ? -1 : a.window.to > b.window.to ? 1 : 0) ||
    a.plan.name.localeCompare(b.plan.name);

  /*
    Inside a direction, the clock still splits — but with a rule, not a second heading.

    Merging the two shapes into one grid was a step too far: a monthly ceiling and a ten
    day holiday are read with different questions ("how is this month going" against "how
    much of this thing is left"), and mixed into one grid you have to read each card's
    dates to know which question you are holding. The four headings and four sentences
    that used to say so cost 39 words; a labelled hairline costs four and takes one line.

    Need still leads inside each block, so the card with something wrong is the first one
    under its own rule rather than buried in the middle of it.
  */
  /*
    Two orders the page cannot arrive at on its own.

    `Need` is the page's own opinion and stays the default. `Name` is for when you know
    which budget you want and are hunting for it among eleven — the one job an opinionated
    order actively makes harder. `Largest` is the other question a screen of figures
    invites: not which is in trouble, but which is carrying the weight.
  */
  const byName = (a: BudgetPlanLine, b: BudgetPlanLine) =>
    a.plan.name.localeCompare(b.plan.name);
  const byWeight = (a: BudgetPlanLine, b: BudgetPlanLine) =>
    Math.abs(b.used) - Math.abs(a.used) || byName(a, b);
  const byDate = (a: BudgetPlanLine, b: BudgetPlanLine) =>
    (a.window.to < b.window.to ? -1 : a.window.to > b.window.to ? 1 : 0) || byName(a, b);

  const order =
    view === "date" ? byDate : view === "name" ? byName : view === "big" ? byWeight : byNeed;

  /*
    The state each budget is standing in, by the same reading the card prints.

    Not a second opinion computed for the filter: `readPlan` is the function behind the
    word on the card and the colour of its bar, so a card can never sit under a chip that
    disagrees with the word on the card.
  */
  const stateOf = (line: BudgetPlanLine): BudgetState =>
    line.window.ended ? "finished" : readPlan(line, today, fmt).status;

  /*
    A census, which is the reason the filter is allowed back.

    There was a filter here for an afternoon and I took it out, because a chip that hid
    the budgets not asking for anything turned "am I all right" into "am I all right among
    the ones I remembered to look at" — and being the place every budget is, is this
    page's whole job.

    Carrying its count is what settles that. Unpressed, the row is not a set of doors, it
    is one line saying `Over 1 · Spending fast 1 · On track 8 · No amount 1` — the whole
    page counted, before anything is hidden. That is strictly more than the page said
    before. Pressing one narrows; `All` sits first and always comes back; nothing is
    remembered between visits, so the page can never open already hiding something.
  */
  const census = useMemo(() => {
    const seen = new Map<BudgetState, number>();
    for (const line of lines) {
      const key = line.window.ended ? "finished" : readPlan(line, today, fmt).status;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return STATE_ORDER.filter((key) => (seen.get(key) ?? 0) > 0).map(
      (key) => [key, STATE_LABEL[key], seen.get(key) ?? 0] as const,
    );
  }, [lines, today, fmt]);

  // Whether a control is worth drawing is `ListBar`'s rule now, not this file's: two
  // states for a filter, two orders for an order. One place to state it, one to change it.

  // A state can stop existing under you — delete the only budget that was over and the
  // chip goes with it. Falling back to every budget beats a page that shows none.
  const active = census.some(([key]) => key === state) ? state : null;

  const term = fold(q.trim());
  const keep = (l: BudgetPlanLine) =>
    (!active || stateOf(l) === active) && (!term || fold(l.plan.name).includes(term));
  const shownCount = lines.filter(keep).length;

  const split = (kind: string) => {
    const mine = lines.filter((l) => l.plan.kind === kind && keep(l));
    return {
      repeating: mine.filter((l) => l.plan.period !== "custom").sort(order),
      dated: mine.filter((l) => l.plan.period === "custom").sort(order),
    };
  };

  const groups = [
    { key: "spending", title: "Spending", ...split("expense") },
    { key: "saving", title: "Saving", ...split("savings") },
  ].filter((group) => group.repeating.length + group.dated.length > 0);

  /*
    One list, for the three orders that asked a question about the whole page.

    The grouping above is `Need`'s opinion — spending apart from saving, a rhythm apart
    from a stretch with an end — and it is the right shape for scanning, because those
    two are read with different questions in mind.

    It is the wrong shape the moment you press `Name`, `Ending` or `Largest`, and this is
    the fault that made the sort look broken. Sorting inside four blocks restarts the
    order three times down the page: A-to-Z ran `… Shopping`, then began again at
    `limit for spending`; `Largest` left the biggest figure on the screen — a month
    28.123 in the red — second from last, under its own heading. Pressing `Largest` and
    not getting the largest first is indistinguishable from a broken sort, and it was not
    far off one.

    Asking for an order is overriding the grouping, so the grouping goes. Nothing is lost
    with it: a savings card already says `toward` where a spending one says `of`, and a
    dated one prints its two dates where a repeating one prints its rhythm — which is the
    same argument that took this page from four headings to two.
  */
  const flat = lines.filter(keep).sort(order);

  const grid = (rows: BudgetPlanLine[]) => (
    <div className="grid gap-2.5 md:grid-cols-2">
      {rows.map((line) => (
        <BudgetCard
          key={line.plan.id}
          line={line}
          past={histories[line.plan.id] ?? []}
          today={today}
          onEdit={() => setPanel({ mode: "edit", line })}
          onHistory={() => openEntries(line)}
        />
      ))}
    </div>
  );

  return (
    <div className="pb-10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
            Budgets
          </h1>
          <p className="text-[12.5px] text-muted">
            Each one keeps its own clock, so they do not all have to be months.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPanel({ mode: "new" })}
          className={buttonClasses("primary", "shrink-0")}
        >
          <Plus className="h-4 w-4" /> New budget
        </button>
      </div>

      {lines.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No budgets yet"
          description="A budget can be a month of groceries, a fortnight of eating out, or one holiday with an end date. Start with the one you would actually check."
        />
      ) : (
        <div className="space-y-5">
          {/*
            The bar every list in here uses, in the same words and the same order:
            what to show on the left, what order to show it in on the right.
          */}
          {lines.length >= 2 && (
            <ListBar
              query={q}
              onQuery={setQ}
              searchLabel="Search budgets…"
              filters={[
                {
                  value: active ?? "",
                  onChange: (v) => setState((v || null) as BudgetState | null),
                  label: "Filter by state",
                  all: `All ${lines.length}`,
                  // The count rides in the label: the breakdown a chip row showed at rest
                  // is one click away here rather than nought, and nothing else was lost.
                  options: census.map(([key, label, count]) => ({
                    value: key,
                    label: `${label} (${count})`,
                  })),
                },
              ]}
              sort={{
                value: view,
                onChange: (v) => setView(v as typeof view),
                label: "Order the budgets",
                options: ORDERS,
              }}
              shown={shownCount}
              total={lines.length}
              onClear={() => {
                setQ("");
                setState(null);
              }}
            />
          )}

          {view !== "need"
            ? grid(flat)
            : groups.map((group) => (
                <section key={group.key}>
                  <h2 className="money-page-kicker mb-2">{group.title}</h2>
                  {group.repeating.length > 0 && grid(group.repeating)}
                  {group.dated.length > 0 && (
                    <>
                      {/* Four words and a rule, where four headings and four sentences were. */}
                      <div className="zv-split">
                        <span>With an end date</span>
                      </div>
                      {grid(group.dated)}
                    </>
                  )}
                </section>
              ))}
        </div>
      )}

      <SlideOver
        open={panel !== null}
        onClose={() => setPanel(null)}
        title={
          panel?.mode === "history"
            ? panel.line.plan.name
            : panel?.mode === "edit"
              ? "Edit budget"
              : "New budget"
        }
      >
        {panel?.mode === "history" && (
          <HistoryPanel
            key={panel.line.plan.id}
            line={panel.line}
            entries={entries}
            past={histories[panel.line.plan.id] ?? []}
            today={today}
          />
        )}

        {panel && panel.mode !== "history" && (
          <BudgetPlanForm
            plan={panel.mode === "edit" ? panel.line.plan : undefined}
            categoryIds={panel.mode === "edit" ? panel.line.categoryIds : []}
            accountIds={panel.mode === "edit" ? panel.line.accountIds : []}
            categories={categories}
            accounts={accounts}
            /*
              Only the repeating budgets can be raised, and never this one. A holiday
              raising a holiday means nothing, and a budget raising itself is a loop the
              database refuses anyway — offering either would be offering a mistake.
            */
            raisable={lines
              .filter(
                (l) =>
                  l.plan.period !== "custom" &&
                  l.plan.id !== (panel.mode === "edit" ? panel.line.plan.id : ""),
              )
              .map((l) => ({ id: l.plan.id, name: l.plan.name, baseRsd: l.baseRsd }))}
            boosts={
              panel.mode === "edit"
                ? boosts.filter((b) => b.source_budget_id === panel.line.plan.id)
                : []
            }
            /*
              The other end of the same list: dated budgets that can raise this one, and
              the raises already pointed at it. A repeating budget is edited from the card
              that goes red, which is where anybody notices the limit needs to be bigger
              for one month rather than for all twelve.
            */
            raisers={lines
              .filter(
                (l) =>
                  l.plan.period === "custom" &&
                  l.plan.ends_on &&
                  l.plan.id !== (panel.mode === "edit" ? panel.line.plan.id : ""),
              )
              .map((l) => ({ id: l.plan.id, name: l.plan.name, baseRsd: l.baseRsd }))}
            raisedBy={
              panel.mode === "edit"
                ? boosts.filter((b) => b.target_budget_id === panel.line.plan.id)
                : []
            }
            onSaved={() => setPanel(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}





































