/**
 * What is coming, and what it leaves behind.
 *
 * This is the widest read in the app: it pulls the rules, the planned items, the
 * accounts, the past bookings and the spending projection, lays them on one dated
 * line, and carries the free balance down it. Everything it needs is already computed
 * by the modules beside it — what happens here is only the merge and the running sum.
 */

import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { monthRange, shiftMonth, toRsd } from "@/lib/money";
import {
  nextDay,
  occurrencesFor,
  type Occurrence,
} from "@/lib/money/occurrences";
import { estimateFor, getPlanned, getRates, getRecurring, recentBookings } from "./core";
import { NO_SPENDING, getSpendingProjection, type SpendingProjection } from "./spending";
import { getOnHand } from "./accounts";

/** Guard against a runaway month walk if a horizon ever comes back nonsense. */
const MAX_MONTHS = 24;

export type ForecastWindow = {
  days: number;
  /** Bills only. What goes into goals is counted on its own. */
  expense: number;
  income: number;
  saving: number;
  /** Everyday spending projected over the window — not a dated fact, an estimate. */
  everyday: number;
  /** What the window does to the free balance: income less bills, savings and living. */
  net: number;
  count: number;
};

export type ForecastLine = Occurrence & {
  /** What is left free after this one lands, starting from today's free balance. */
  balance: number;
};

export type Forecast = {
  from: string;
  /**
   * Where the running balance starts: the free money, not the total. Money already
   * put aside for a goal cannot pay a bill, so a forecast that started from the total
   * would promise headroom that is spoken for.
   */
  startingBalance: number;
  /** The two halves of that, so the screen can show the split and have it add up. */
  onAccounts: number;
  reserved: number;
  windows: ForecastWindow[];
  lines: ForecastLine[];
  estimated: number;
  unknown: number;
  /** How the everyday line was worked out — the screen shows it and can change it. */
  spending: SpendingProjection;
  /** How many one-off planned items fall inside the window. */
  planned: number;
};

/**
 * What is coming and what it leaves behind. Three things land on one line: every
 * recurring rule walked date by date, every one-off that has been planned and not yet
 * dealt with, and the everyday spending nobody enters one item at a time. The free
 * balance is carried down the lot — the point being to see the week where the credit,
 * the electricity and the hosting all land together, before it happens rather than
 * after.
 *
 * A standing order into a goal counts as an outflow here even though the money stays
 * on the account: from the day it books, it is reserved, and this line is about what
 * can still be spent.
 *
 * The everyday figure is spread across the days it covers rather than dropped as one
 * lump, so the balance beside a bill on the 12th already carries the twelve days of
 * living that came before it. Every one of those lines is marked as a projection; the
 * other two kinds are dated facts.
 */
export async function getForecast(windows: number[] = [30, 60, 90]): Promise<Forecast> {
  const supabase = await createClient();

  const longest = Math.max(...windows);
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const from = today.toISOString().slice(0, 10);
  const horizonDate = new Date(today);
  horizonDate.setUTCDate(horizonDate.getUTCDate() + longest);
  const horizon = horizonDate.toISOString().slice(0, 10);

  const uid = await userId(supabase);
  if (!uid) {
    return {
      from,
      startingBalance: 0,
      onAccounts: 0,
      reserved: 0,
      windows: windows
        .slice()
        .sort((a, b) => a - b)
        .map((days) => ({
          days,
          expense: 0,
          income: 0,
          saving: 0,
          everyday: 0,
          net: 0,
          count: 0,
        })),
      lines: [],
      estimated: 0,
      unknown: 0,
      spending: NO_SPENDING,
      planned: 0,
    };
  }

  const [items, planned, rates, onHand, past, spending] = await Promise.all([
    getRecurring(),
    getPlanned(),
    getRates(),
    getOnHand(),
    recentBookings(supabase, uid),
    getSpendingProjection(),
  ]);

  const dayOf = (iso: string) =>
    Math.round((Date.parse(`${iso}T00:00:00Z`) - today.getTime()) / 86_400_000);

  let estimated = 0;
  let unknown = 0;
  const all: Occurrence[] = [];

  for (const item of items) {
    if (!item.active) continue;

    const reading = estimateFor(item, past, rates);
    if (reading === null) {
      unknown++;
      continue;
    }
    if (reading.estimated) estimated++;

    all.push(
      ...occurrencesFor(item, reading.each, reading.estimated, horizon, reading.samples),
    );
  }

  // A planned item is a dated fact that has not happened yet. Once it settles it is
  // an entry in the ledger and leaves this list, so it is never counted twice.
  // How much everyday room each budgeted category still has after its standing rules.
  // A planned item can only take back what its own category was actually contributing.
  const roomBy = new Map(
    spending.categories.map((c) => [c.id, Math.max(c.limit - c.recurring, 0)]),
  );
  const budgeted = new Set(spending.budgeted);
  const plannedInBudget = new Map<string, Map<string, number>>();
  let plannedCount = 0;

  for (const p of planned) {
    if (p.due_on > horizon) continue;
    plannedCount++;
    const amount = toRsd(Number(p.amount) || 0, p.currency, rates);
    all.push({
      id: p.id,
      source: "planned",
      name: p.name,
      kind: p.kind === "income" ? "income" : "expense",
      on: p.due_on,
      amount,
      estimated: false,
      category: p.category?.name ?? null,
      color: p.category?.color ?? null,
      goal: null,
      samples: [],
      days: 0,
    });

    // Its category already carries a limit, and the everyday figure is built out of
    // those limits — so this month's projection has to give the amount back.
    if (p.kind !== "income" && p.category_id && budgeted.has(p.category_id)) {
      const month = p.due_on.slice(0, 7);
      const per = plannedInBudget.get(month) ?? new Map<string, number>();
      per.set(p.category_id, (per.get(p.category_id) ?? 0) + amount);
      plannedInBudget.set(month, per);
    }
  }

  /** What a month's projection owes back to the planned items already on the line. */
  const givenBack = (month: string): number => {
    const per = plannedInBudget.get(month);
    if (!per) return 0;
    let total = 0;
    // Never more than the category was contributing: a 30.000 dentist bill against a
    // 5.000 health limit takes 5.000 off the projection, not 30.000.
    for (const [category, amount] of per) total += Math.min(amount, roomBy.get(category) ?? 0);
    return total;
  };

  // What a day of ordinary living costs, month by month. The current month counts
  // only the days still to come, and only what is left of its figure — the part
  // already spent is on the accounts the balance starts from.
  const dailyRate = new Map<string, number>();
  if (spending.monthly > 0) {
    let month = from.slice(0, 7);
    const lastMonth = horizon.slice(0, 7);
    for (let step = 0; step <= MAX_MONTHS && month <= lastMonth; step++) {
      const daysInMonth = Number(monthRange(month).to.slice(8, 10));
      let figure = Math.max(spending.monthly - givenBack(month), 0);
      let over = daysInMonth;
      if (month === from.slice(0, 7)) {
        figure = Math.max(figure - spending.spentThisMonth, 0);
        over = daysInMonth - Number(from.slice(8, 10));
      }
      dailyRate.set(month, over > 0 ? figure / over : 0);
      month = shiftMonth(month, 1);
    }
  }

  // Running total of everyday spending from today up to and including each day, so
  // the spend between any two dates is one subtraction.
  const upTo = new Map<string, number>();
  let accrued = 0;
  for (let day = nextDay(from); day <= horizon; day = nextDay(day)) {
    accrued += dailyRate.get(day.slice(0, 7)) ?? 0;
    upTo.set(day, accrued);
  }

  // The everyday line is cut at every date that has to be right: where something real
  // falls due, where a month ends, and where each window closes. Nothing straddles a
  // boundary, so every total on the screen is the sum of the lines above it.
  if (accrued > 0) {
    const stops = new Set<string>();
    for (const o of all) if (o.on > from && o.on <= horizon) stops.add(o.on);
    for (const day of upTo.keys()) {
      if (day === horizon || day.slice(0, 7) !== nextDay(day).slice(0, 7)) stops.add(day);
    }
    for (const days of windows) {
      const edge = [...upTo.keys()][days - 1];
      if (edge) stops.add(edge);
    }

    let previous = from;
    for (const stop of [...stops].sort()) {
      const amount = (upTo.get(stop) ?? 0) - (upTo.get(previous) ?? 0);
      const days = Math.round(
        (Date.parse(`${stop}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / 86_400_000,
      );
      if (amount > 0 && days > 0) {
        all.push({
          id: `everyday-${stop}`,
          source: "everyday",
          name: "Everyday spending",
          kind: "expense",
          on: stop,
          amount,
          estimated: true,
          category: null,
          color: null,
          goal: null,
          samples: [],
          days,
        });
      }
      previous = stop;
    }
  }

  // Same date: the days of living come before the bill they lead up to, so the
  // balance printed beside the bill is what is actually left after paying it.
  const rank = (o: Occurrence) => (o.source === "everyday" ? 0 : 1);
  all.sort((a, b) =>
    a.on < b.on
      ? -1
      : a.on > b.on
        ? 1
        : rank(a) - rank(b) || a.name.localeCompare(b.name),
  );

  const startingBalance = onHand.free;
  let running = startingBalance;
  const lines: ForecastLine[] = all.map((o) => {
    running += o.kind === "income" ? o.amount : -o.amount;
    return { ...o, balance: running };
  });

  const totals = windows
    .slice()
    .sort((a, b) => a - b)
    .map((days) => {
      const inWindow = all.filter((o) => dayOf(o.on) <= days);
      const real = inWindow.filter((o) => o.source !== "everyday");
      const expense = real
        .filter((o) => o.kind !== "income" && o.goal === null)
        .reduce((sum, o) => sum + o.amount, 0);
      const income = real
        .filter((o) => o.kind === "income")
        .reduce((sum, o) => sum + o.amount, 0);
      const saving = real
        .filter((o) => o.goal !== null)
        .reduce((sum, o) => sum + o.amount, 0);
      const everyday = inWindow
        .filter((o) => o.source === "everyday")
        .reduce((sum, o) => sum + o.amount, 0);
      return {
        days,
        expense,
        income,
        saving,
        everyday,
        net: income - expense - saving - everyday,
        count: real.length,
      };
    });

  return {
    from,
    startingBalance,
    onAccounts: onHand.total,
    reserved: onHand.reserved,
    windows: totals,
    lines,
    estimated,
    unknown,
    spending,
    planned: plannedCount,
  };
}

