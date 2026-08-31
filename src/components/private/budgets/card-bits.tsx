"use client";

/**
 * The parts a budget is drawn from, shared by the card and the panel behind it.
 *
 * All of this lived at the top of `BudgetPlansView`, which had grown to fourteen hundred
 * lines: the screen, the card, the history panel and the seven small readings they share,
 * in one file. The readings are what actually travel — a period is "missed" by the same
 * rule wherever it is drawn, and a bar is filled by the same one — so they are the file.
 */

"use client";

import type { BudgetPast } from "@/lib/data/money";
import { useMoney } from "@/lib/money/currency";
import type {
BudgetPlanLine
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
PLAN_STATUS_LABEL,
shortDate,
windowLabel
} from "./plan-reading";

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
export const PAST_SLOTS = 6;

/**
 * The states that get a word beside the figure.
 *
 * Being fine is the ordinary case and does not need announcing; the two that do are the
 * ceiling broken and the floor missed, plus a budget with no amount, which is not a
 * verdict at all but a thing left unfinished.
 */
export const LOUD_STATUS = new Set(["over", "ahead", "behind", "unset"]);

/**
 * Every state a budget can be standing in, worst first.
 *
 * The same order the page's own `Need` sort uses, so the chip row reads top-down in the
 * order the cards under it are already in. `finished` is not a status — a window that has
 * closed has whatever verdict it ended on — but it is the one state you sort *away* from
 * rather than toward, so it sits at the end on its own.
 */
export const STATE_ORDER = ["over", "unset", "ahead", "behind", "ontrack", "met", "finished"] as const;

export type BudgetState = (typeof STATE_ORDER)[number];

/**
 * The word for each, taken from the card rather than invented for the chip.
 *
 * `PLAN_STATUS_LABEL` is what a card prints beside its figure, so a chip saying `Over`
 * and a card saying `Over` cannot drift apart — there is one place either word is
 * written. The quiet states have a word here too, even though a quiet card prints none:
 * being on track is not worth announcing on eleven cards, and is worth naming once on a
 * chip that tells you how many of them there are.
 */
export const STATE_LABEL: Record<BudgetState, string> = {
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
/**
 * Whether there is a strip to draw at all.
 *
 * Asked in two places that must never disagree: the strip itself, which draws nothing
 * before a period has finished, and the card, which keeps its own way into the history
 * only for the cards the strip has not reached yet. Two copies of this test would
 * eventually leave a card with two doors, or with none.
 */
/**
 * How a finished period did — by the same rule the card on the front prints.
 *
 * `used > limit` was the whole test, in all four places that asked, and it is exactly
 * backwards for a savings budget. There the limit is a floor: you miss it by putting
 * away *less*. So a savings month that beat its target was counted as having gone over,
 * and a month that went backwards — the worst thing a savings budget can do — was
 * counted as fine and drawn in gold. The card already knew better, which meant the card
 * and the strip under it disagreed about the same month.
 *
 * The share is clamped at both ends, and the lower end is not tidiness. A savings month
 * at −1.968 against a 148 floor gives −13.2; `width: -1322%` is invalid, an invalid
 * width falls back to `auto`, and `auto` on a block span is the whole track. The single
 * worst period a budget can have was rendering as a full, calm, gold bar.
 */
export function periodReading(kind: string, p: BudgetPast): { missed: boolean; share: number } {
  const limit = p.limitRsd;
  if (limit <= 0) return { missed: false, share: 0 };
  if (kind === "savings") {
    // Below zero the month went backwards, so the bar shows the depth of the hole
    // rather than a fill of nothing — the same reading `readingOf` gives the card.
    if (p.used < 0) return { missed: true, share: Math.min(1, -p.used / limit) };
    return { missed: p.used < limit, share: Math.max(0, Math.min(1, p.used / limit)) };
  }
  return { missed: p.used > limit, share: Math.max(0, Math.min(1, p.used / limit)) };
}

/** What falling short is called, which is not the same word for the two kinds. */
export const MISSED_LABEL = (kind: string) => (kind === "savings" ? "Fell short" : "Went over");

export function hasPastStrip(past: BudgetPast[]) {
  return past.some((p) => !p.current);
}

export function PastStrip({
  past,
  kind,
  onOpen,
  onPrime,
}: {
  past: BudgetPast[];
  kind: string;
  onOpen: () => void;
  onPrime: () => void;
}) {
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
  if (!hasPastStrip(past)) return null;

  // The record goes back a year; the card shows the tail of it. The rest is one tap away.
  const shown = past.slice(-PAST_SLOTS);
  const over = finished.filter((p) => periodReading(kind, p).missed).length;
  // Empty slots go on the left, where older months would be, so the running one stays at
  // the right-hand end where the eye already looks for "now".
  const blanks = Math.max(0, PAST_SLOTS - shown.length);

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={onPrime}
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
          const { missed: isOver, share } = periodReading(kind, p);
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
            : `${over} of the last ${finished.length} ${
                kind === "savings" ? "fell short" : "went over"
              }`}
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
export function Meter({
  line,
  fill,
  pace,
  today,
}: {
  line: BudgetPlanLine;
  fill: number;
  pace: number;
  /** The day the server decided it is, so the picture cannot disagree with the figures. */
  today: string;
}) {
  /*
    Where `Today` hangs off its tick. Centred over it reads best, and near either end of a
    period it would hang off the bar and land on the date printed there — so there it pins
    to the side that still has room, without moving the tick, which must stay honest.
  */
  const nowAt = Math.min(1, Math.max(0, pace));
  const nowSide = nowAt > 0.86 ? "is-end" : nowAt < 0.14 ? "is-start" : "";

  /*
    On the first or the last day of a period, the tick is the wrong instrument.

    A 1px line at 100% lands on the track's own rounded cap, where it stops reading as a
    mark and starts reading as the end of the bar — and the word `Today` above it sits
    directly over the end date, which on that day is the same day, printed twice, one line
    apart. Today happens to be the 31st, which is how this turned up.

    So on those two days the date itself carries the mark. `31. avg` lights up and says
    what it is, the floating tick stands down, and the picture says one thing once. Every
    other day of the period is unchanged.
  */
  const atEnd = !line.window.ended && today === line.window.to;
  const atStart = !line.window.ended && today === line.window.from;
  const edge = atEnd || atStart;

  return (
    <div className="bud-span">
      <span className={cn("bud-edge", atStart && "is-now")}>
        {shortDate(line.window.from)}
        {atStart && <b>Today</b>}
      </span>
      <div className="bud-track">
        <span className="bud-fill" style={{ width: `${fill * 100}%` }} />
        {!line.window.ended && !edge && (
          <span className={cn("bud-now", nowSide)} style={{ left: `${nowAt * 100}%` }}>
            <i>Today</i>
          </span>
        )}
        {/* The cap, lit, so the end of the bar is where today is rather than merely where
            the period stops. */}
        {atEnd && <span className="bud-cap" aria-hidden />}
      </div>
      <span className={cn("bud-edge", atEnd && "is-now")}>
        {shortDate(line.window.to)}
        {atEnd && <b>Today</b>}
      </span>
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
export function readingOf(line: BudgetPlanLine, reading: { status: string; pct: number }) {
  const bad = reading.status === "over" || (line.plan.kind === "savings" && line.used < 0);
  const deficit =
    line.plan.kind === "savings" && line.used < 0 && line.limitRsd > 0
      ? Math.min(1, -line.used / line.limitRsd)
      : 0;
  return { bad, fill: deficit > 0 ? deficit : reading.pct };
}
