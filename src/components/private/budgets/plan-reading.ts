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
  /*
    What this window is allowed, which is not always what the plan says.

    A month a trip falls in is allowed more, and the extra lives on the line rather than
    being worked out again by every screen — the Overview card, the Budgets screen and
    the `needs you` row all judge the same figure, so a raised window is raised in all
    three at once and in none of them by accident.
  */
  const limit = line.limitRsd;
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
      What is left, and nothing else.

      This carried "· 1.755 RSD a day" beside it, on the theory that a figure to spread
      over the remaining days is the one you act on. It is not — not for these. A month of
      eating out is four evenings, not thirty-one two-hundredths of an evening, and the
      per-day figure moved every time the screen was opened while saying nothing that
      changed a decision. On a strip of six budgets it was six numbers nobody used, in the
      same weight as the one everybody does.
    */
    note: `${fmt(left)} left`,
  };
}

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  over: "Over",
  // Expense budgets are the only ones that reach this state, and on an expense budget
  // being ahead of the calendar means the money is leaving faster than the days are —
  // which "Ahead" reads as good news. It is the warning before `Over`, and it says so.
  ahead: "Spending fast",
  ontrack: "On track",
  met: "Target met",
  behind: "Behind",
  unset: "No amount",
};

/** One word in, one colour out — so a bar can never disagree with the words beside it. */
/*
  `text-warn` was two of these, and there is no `--color-warn` in the palette — so
  Tailwind generated nothing for it and 'Ahead of pace' and 'Behind' printed in whatever
  colour they happened to inherit. Gold is this app's "worth a look", said so in the
  palette's own comment and used by the verdict line on the overview; that is the token
  those two wanted.
*/
export const PLAN_STATUS_TONE: Record<PlanStatus, string> = {
  over: "text-danger",
  ahead: "text-gold-hi",
  ontrack: "text-ok",
  met: "text-ok",
  behind: "text-gold-hi",
  unset: "text-faint",
};

/** One end of a window, as a person says it: "Aug 31". */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[(m ?? 1) - 1]} ${d}`;
}

/** What the window reads as in a sentence: "Aug 1 – Aug 31". */
export function windowLabel(window: BudgetWindow): string {
  return window.from === window.to
    ? shortDate(window.from)
    : `${shortDate(window.from)} – ${shortDate(window.to)}`;
}


/**
 * What a budget actually watches, in the words the person chose for it.
 *
 * A budget's name is a label somebody typed and nothing more, and the app has been
 * letting that label pass for a rule. A monthly budget named `Groceries` with no
 * categories attached watches *every* category — so it counted Shopping, its history
 * listed Shopping, and the overview offered to put a limit on Groceries in the same
 * breath. Three symptoms, one cause: the only place the scope was written down was the
 * edit form, and nothing you can read from the outside said which of the two a card was.
 *
 * So the card says it. `every category` is the one that has to be said and the one that
 * was never sayable from the name — a budget that names its categories is already
 * self-explanatory the moment you see them, and a single category with the same name as
 * the budget is the label repeated, so both of those stay quiet.
 */
export function scopeOf(
  line: BudgetPlanLine,
  nameOf: (id: string) => string | undefined,
): string | null {
  // A hand-kept budget holds what you put in it. The card already says `added only`,
  // and no list of categories would describe it.
  if (line.plan.membership === "added") return "added only";

  /*
    The count comes from the links, the words from whichever of them still resolve.

    Those are two different numbers, and reading only the second one gets the answer
    exactly backwards in the one case it matters: `getCategories` leaves archived
    categories out, so a budget watching a single archived category resolves to no names
    at all — and "no names" read as "watches everything", which is the false sentence
    this function exists to stop, printed by the function that stops it.
  */
  const total = line.categoryIds.length;
  if (total === 0) return "every category";

  const named = line.categoryIds
    .map(nameOf)
    .filter((name): name is string => Boolean(name));

  // Restricted, and nothing left to name it by. The count is still true.
  if (named.length === 0) return total === 1 ? "1 category" : `${total} categories`;

  // The label repeated is not information. One category named the same as the budget
  // over it says nothing the title did not.
  if (total === 1) {
    return named[0].trim().toLowerCase() === line.plan.name.trim().toLowerCase()
      ? null
      : named[0];
  }

  const shown = named.slice(0, 2);
  const rest = total - shown.length;
  return rest > 0 ? `${shown.join(" · ")} +${rest}` : shown.join(" · ");
}

/**
 * Whether this budget is a live ceiling over `categoryId` right now.
 *
 * The question anything offering to "set a limit" has to ask first. An expense budget
 * sweeping every category is a ceiling on all of them, which is precisely the case the
 * overview panel used to miss.
 */
export function capsCategory(line: BudgetPlanLine, categoryId: string): boolean {
  if (line.plan.kind !== "expense") return false; // a savings target is not a ceiling
  if (line.plan.membership !== "all") return false; // hand-kept counts nothing by itself
  if (line.limitRsd <= 0) return false; // a budget with no amount caps nothing
  if (line.window.ended) return false; // a holiday that is over stopped watching
  return line.categoryIds.length === 0 || line.categoryIds.includes(categoryId);
}
