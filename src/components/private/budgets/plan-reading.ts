import { daysLeftInWindow, windowProgress, type BudgetWindow } from "@/lib/money/budget-periods";
import type { BudgetPlanLine } from "@/lib/types";

/**
 * Where a budget stands, in one word.
 *
 * Six words rather than the category screen's five, because a savings budget fails in
 * the opposite direction to a spending one and sharing the vocabulary would have made
 * the screen lie. On an expense budget the number climbing is bad news; on a savings
 * budget it is the whole idea, and "over" would be the best thing that could happen.
 * So the two get their own words and one tone map, and no card can be green while its
 * sentence says you are short.
 */
export type PlanStatus = "over" | "ahead" | "ontrack" | "met" | "behind" | "unset";

export type PlanReading = {
  status: PlanStatus;
  /** 0..1 for the bar. */
  pct: number;
  /** Uncapped, so a card can still say 180%. */
  raw: number;
  /** 0..1 through the window. */
  pace: number;
  daysLeft: number;
  /** The sentence under the figures. */
  note: string;
};

/**
 * The tolerance that stops a verdict flickering.
 *
 * A budget sitting exactly on its pace would otherwise change its word every time a
 * coffee is entered, and a status that moves that easily is one nobody reads. Same
 * fifteen points the category screen uses, deliberately — two screens disagreeing about
 * what "ahead" means is worse than either threshold being slightly wrong.
 */
const TOLERANCE = 0.15;

export function readPlan(
  line: BudgetPlanLine,
  today: string,
  fmt: (value: number) => string,
): PlanReading {
  const limit = Number(line.plan.amount_rsd) || 0;
  const used = line.used;
  const pace = windowProgress(line.window, today);
  const daysLeft = daysLeftInWindow(line.window, today);
  const raw = limit > 0 ? used / limit : 0;
  const pct = Math.min(1, Math.max(0, raw));

  if (limit <= 0) {
    return {
      status: "unset",
      pct: 0,
      raw: 0,
      pace,
      daysLeft,
      note: used === 0 ? "No amount set" : `${fmt(Math.abs(used))} so far, no amount set`,
    };
  }

  if (line.plan.kind === "savings") {
    /*
      A savings budget can go backwards. A month where more went out than came in has
      saved a negative amount, and the honest thing is to say so rather than to round it
      up to zero and draw an empty bar that looks like a month you simply have not
      started yet.
    */
    if (used >= limit) {
      return { status: "met", pct: 1, raw, pace, daysLeft, note: `${fmt(used)} put away — target met` };
    }
    const short = limit - used;
    const behind = raw < pace - TOLERANCE;
    return {
      status: behind ? "behind" : "ontrack",
      pct: Math.max(0, pct),
      raw,
      pace,
      daysLeft,
      note:
        used < 0
          ? `${fmt(-used)} more went out than came in`
          : `${fmt(short)} short${daysLeft > 0 ? ` · ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left` : ""}`,
    };
  }

  if (used > limit) {
    return {
      status: "over",
      pct: 1,
      raw,
      pace,
      daysLeft,
      note: `${fmt(used - limit)} over`,
    };
  }

  const left = limit - used;
  const ahead = raw > pace + TOLERANCE;
  return {
    status: ahead ? "ahead" : "ontrack",
    pct,
    raw,
    pace,
    daysLeft,
    /*
      "Left" is the figure people act on, and per-day is the one they act on when there
      are days to spread it over. On the last day of a window the division says nothing
      the first half of the sentence has not already said, so it is dropped.
    */
    note:
      daysLeft > 1
        ? `${fmt(left)} left · ${fmt(left / daysLeft)} a day`
        : `${fmt(left)} left`,
  };
}

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  over: "Over",
  ahead: "Ahead of pace",
  ontrack: "On track",
  met: "Target met",
  behind: "Behind",
  unset: "No amount",
};

/** One word in, one colour out — so a bar can never disagree with the words beside it. */
export const PLAN_STATUS_TONE: Record<PlanStatus, string> = {
  over: "text-danger",
  ahead: "text-warn",
  ontrack: "text-ok",
  met: "text-ok",
  behind: "text-warn",
  unset: "text-faint",
};

/** What the window reads as on the card: "Aug 1 – Aug 31". */
export function windowLabel(window: BudgetWindow): string {
  const short = (iso: string) => {
    const [, m, d] = iso.split("-").map(Number);
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${months[(m ?? 1) - 1]} ${d}`;
  };
  return window.from === window.to ? short(window.from) : `${short(window.from)} – ${short(window.to)}`;
}
