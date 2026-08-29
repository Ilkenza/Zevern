/**
 * Everything still waiting on a decision, gathered from five places and ranked once.
 *
 * The overview knew all of this already. It knew it as four separate cards, stacked in
 * the order they happened to be written, each certain its own contents came first — so a
 * 30.776 instalment falling due in three days sat in the third card down, under two
 * smaller things, and the screen's answer to "is anything about to go wrong" was "read
 * all of it and decide".
 *
 * One ranking, one list. The rows that can be finished on the spot still carry their own
 * control; what they lost is a card header each, which is what made the band a scroll.
 */

import type { BudgetPlanLine, RecurringRow, TransactionRow } from "@/lib/types";
import type { PlanReading } from "@/components/private/budgets/plan-reading";
import { windowLabel } from "@/components/private/budgets/plan-reading";

export type NeedTone = "late" | "over" | "soon" | "quiet";

/**
 * What the row lets you do about it.
 *
 * `book` and `price` finish the thing where it stands — those two are the entire reason
 * the band is worth having on the first screen rather than being a set of links to
 * elsewhere. `link` is for the rows nothing on this screen can settle.
 */
export type NeedAction =
  | { kind: "book"; rule: RecurringRow }
  | { kind: "price"; tx: TransactionRow }
  | { kind: "link"; href: string; cta: string };

export type Need = {
  id: string;
  tone: NeedTone;
  /** The thing, named the way you would name it out loud. */
  title: string;
  /** Why it is here, and what it would cost to leave it. */
  detail: string;
  /**
   * The figure the row is about, or null when the missing figure *is* the problem —
   * a variable bill nobody has priced, an entry logged without an amount.
   */
  amount: number | null;
  action: NeedAction;
  /** Lower sorts first. */
  weight: number;
};

/**
 * How pressing each kind of thing is, against each other kind.
 *
 * The one judgement call in the file, written down rather than spread through six
 * comparisons. A bill whose date has gone by outranks everything, because it is the only
 * item here that is already wrong rather than about to be. An overspend outranks a bill a
 * week out, because the week still has room to fix it and the overspend does not. A budget
 * nobody has filed anything into comes last: it is a prompt, not a problem.
 */
const WEIGHT = {
  overdue: 0,
  imminent: 1,
  over: 2,
  unpriced: 3,
  soon: 4,
  running: 5,
} as const;

/** Bills closer than this are "in three days", not "next week". */
const IMMINENT_DAYS = 3;
/** Past this, a bill is the forecast's business rather than today's. */
const SOON_DAYS = 7;
/**
 * How many rows the band will show at once.
 *
 * The pile clears itself: book these, the page refreshes, the next ones arrive. A band
 * that shows everything on a bad day is a band nobody reads on the day it matters.
 */
const SHOWN = 7;

export type NeedsInput = {
  today: string;
  /** Recurring rules whose date has arrived and which nobody has booked yet. */
  dueNow: RecurringRow[];
  /** Bills still ahead of today, soonest first. */
  coming: { id: string; name: string; amount: number; on: string }[];
  /** Entries logged without a price. */
  unpriced: TransactionRow[];
  /** Named budgets, with the reading the Budgets screen would take of them. */
  budgets: { line: BudgetPlanLine; reading: PlanReading }[];
  fmt: (value: number) => string;
};

export type NeedsReading = {
  /** Everything wanting a decision, most pressing first. */
  all: Need[];
  /** The first few, which is what the band draws. */
  shown: Need[];
  /** How many did not fit. */
  hidden: number;
  /** How many things want you, across every source. */
  count: number;
  /** The single most pressing one, for the sentence at the top of the screen. */
  headline: Need | null;
};

/** Whole days from `from` to `to`, both wall-clock dates with no zone. */
export function daysUntil(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** "in 3 days", "tomorrow", "today" — the half of a date that carries the urgency. */
export function whenPhrase(days: number): string {
  if (days < 0) return days === -1 ? "1 day overdue" : `${-days} days overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

export function readNeeds(input: NeedsInput): NeedsReading {
  const { today, fmt } = input;
  const all: Need[] = [];

  /*
    Already due and unbooked. These carry an amount field and a Book button, because this
    is the one screen anybody opens daily and a bill you have to go elsewhere to record is
    a bill that waits another day.
  */
  for (const rule of input.dueNow) {
    const amount = Number(rule.amount);
    const known = !rule.variable && amount > 0;
    all.push({
      id: `due:${rule.id}`,
      tone: "late",
      title: rule.name,
      detail: known
        ? `Due ${rule.next_on} · usually ${fmt(amount)}`
        : `Due ${rule.next_on} · the amount changes`,
      amount: known ? amount : null,
      action: { kind: "book", rule },
      weight: WEIGHT.overdue,
    });
  }

  /*
    Ahead of today, and only as far as a week. Beyond that the answer is "it is in the
    forecast", which is a calmer question on a different screen — a permanent list of
    everything coming in the next fortnight is a list you stop reading, and then you stop
    reading it on the morning the big one is three days out.
  */
  for (const item of input.coming) {
    const days = daysUntil(today, item.on);
    if (days < 0 || days > SOON_DAYS) continue;
    all.push({
      id: `soon:${item.id}`,
      tone: days <= IMMINENT_DAYS ? "soon" : "quiet",
      title: item.name,
      detail: whenPhrase(days),
      amount: item.amount,
      action: { kind: "link", href: "/private/upcoming", cta: "Open" },
      weight: days <= IMMINENT_DAYS ? WEIGHT.imminent : WEIGHT.soon,
    });
  }

  /*
    One row each rather than one row saying "3 entries have no price".

    A count is not something you can act on, and these are two taps from finished — the
    price goes in the row. Half an entry sitting in the ledger counting for nothing is
    exactly what the app promised to come back and ask about.
  */
  for (const tx of input.unpriced) {
    all.push({
      id: `price:${tx.id}`,
      tone: "quiet",
      title: tx.title ?? tx.category?.name ?? "An entry with no price",
      detail: `${tx.occurred_on}${tx.account?.name ? ` · ${tx.account.name}` : ""} · needs a price`,
      amount: null,
      action: { kind: "price", tx },
      weight: WEIGHT.unpriced,
    });
  }

  for (const { line, reading } of input.budgets) {
    const { plan, window } = line;
    const running = today >= window.from && today <= window.to;

    /*
      Over its limit, and only while the window is still open. A fortnight that closed 600
      over is history: nothing you do today changes it, and a band headed "needs you" that
      lists things you cannot act on teaches you the heading is decoration.
    */
    if (reading.status === "over" && running) {
      all.push({
        id: `over:${plan.id}`,
        tone: "over",
        title: `${plan.name} is over its budget`,
        detail: `${fmt(line.used)} of ${fmt(line.limitRsd)} · ${
          reading.daysLeft === 1 ? "1 day" : `${reading.daysLeft} days`
        } left`,
        amount: line.used - line.limitRsd,
        action: { kind: "link", href: "/private/budgets", cta: "Open" },
        weight: WEIGHT.over,
      });
      continue;
    }

    /*
      A budget you file into by hand that is half over and still empty.

      This row used to appear for every 'added only' budget on every day of its window,
      and that is why the count on this band was never zero. Two of them sat there on 28
      August — a trip and a spending cap, both perfectly healthy, and both already said
      twice elsewhere on the same screen: once in the hero's "planned for trips running"
      clause, once as a row in the Budgets strip. A number in a heading that says "needs
      you" and counts things needing nobody is a number you stop reading, and you stop
      reading it on the morning it is the instalment that is late.

      What is left is the case the row was written for. Such a budget counts nothing it is
      not given, so a holiday with an empty ledger looks exactly like a holiday going to
      plan — and half the days gone without one entry filed is where those two stop being
      equally likely. Before halfway it is simply early, and saying so daily is noise.
    */
    if (plan.membership === "added" && running && line.limitRsd > 0 && line.used === 0) {
      const span = daysUntil(window.from, window.to) + 1;
      const gone = daysUntil(window.from, today) + 1;
      if (span > 1 && gone * 2 >= span) {
        all.push({
          id: `running:${plan.id}`,
          tone: "quiet",
          title: `Nothing filed into ${plan.name} yet`,
          detail: `${windowLabel(window)} · ${fmt(line.limitRsd)} set aside · ${
            reading.daysLeft === 1 ? "1 day" : `${reading.daysLeft} days`
          } left`,
          amount: line.limitRsd,
          action: { kind: "link", href: "/private/budgets", cta: "Open" },
          weight: WEIGHT.running,
        });
      }
    }
  }

  /*
    Weight first, then size. Two bills on the same day are not equally alarming, and the
    larger one decides whether the smaller one is affordable.
  */
  all.sort((a, b) => a.weight - b.weight || (b.amount ?? 0) - (a.amount ?? 0));

  return {
    all,
    shown: all.slice(0, SHOWN),
    hidden: Math.max(0, all.length - SHOWN),
    count: all.length,
    headline: all[0] ?? null,
  };
}
