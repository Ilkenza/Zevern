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
  getCategoryUsage,
  getSpendingProjection,
  type SpendingProjection,
} from "./spending";

export {
  getForecast,
  type Forecast,
  type ForecastLine,
  type ForecastWindow,
  getDueSoon,
  type DueSoon,
  type DueItem,
} from "./forecast";

export {
  getDailySpend,
  getExpenseTrend,
  hasIncomeOnFile,
  getMonthSummary,
  getTransaction,
  getTransactions,
  getUnpricedTransactions,
  type DaySpend,
  type MonthSummary,
  type TxFilter,
} from "./transactions";

export { getBudgetLines } from "./budgets";
export { getCategoryHistory } from "./category-history";
export type { CategoryHistory, CategoryMonth } from "./category-history";

export {
  clockOf,
  getAddableBudgets,
  getBudgetBoosts,
  getBudgetEntries,
  getBudgetHistories,
  getBudgetPlanLines,
  getCategoryBudgetCaps,
} from "./budget-plans";
export type { BudgetEntry, BudgetPast } from "./budget-plans";

export { getGoalLines, getGoalRemaining, getGoals, isGoalOpen } from "./goals";

export {
  getAccountBalances,
  getOnHand,
  type AccountBalance,
  type OnHand,
} from "./accounts";

export { getLoans, isLoanOpen, loanTotals } from "./loans";

export { getMoney } from "./display";
