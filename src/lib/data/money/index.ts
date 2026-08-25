/**
 * The money module's front door.
 *
 * It was one 1,352-line file. Splitting it changed nothing about what it does, and
 * this barrel is why: every screen still imports from `@/lib/data/money`, and which
 * file a function now lives in is this module's business rather than theirs.
 *
 * The split follows the questions the screens ask, not the tables:
 *
 *   core         — the plain reads everything else is built on
 *   recurring    — what the standing rules cost per month, and per year
 *   spending     — what an ordinary month of living costs
 *   forecast     — the dated line, and the balance carried down it
 *   transactions — the ledger, and a month of it added up
 *   budgets      — a limit per category against what a normal month costs
 *   goals        — savings goals and their movements
 *   accounts     — balances, what is reserved, what is free
 *
 * The date arithmetic underneath all of it is in `@/lib/money/occurrences`, which has
 * no database in it at all and is tested directly.
 */

export {
  ESTIMATE_FROM,
  getAccounts,
  getBudgets,
  getCategories,
  getDueRecurring,
  getPlanned,
  getPlannedDue,
  getRates,
  getRecurring,
} from "./core";

export {
  feedsGoal,
  occurrencesFor,
  type Booking,
  type Occurrence,
  type OccurrenceSource,
} from "@/lib/money/occurrences";

export { getRecurringTotals, type RecurringTotals } from "./recurring";

export {
  getSpendingBasis,
  getSpendingProjection,
  type SpendingProjection,
} from "./spending";

export {
  getForecast,
  type Forecast,
  type ForecastLine,
  type ForecastWindow,
} from "./forecast";

export {
  getExpenseTrend,
  getMonthSummary,
  getTransaction,
  getTransactions,
  type MonthSummary,
  type TxFilter,
} from "./transactions";

export { getBudgetLines } from "./budgets";

export { getGoalLines, getGoals, isGoalOpen } from "./goals";

export {
  getAccountBalances,
  getOnHand,
  type AccountBalance,
  type OnHand,
} from "./accounts";

export { getMoney } from "./display";
