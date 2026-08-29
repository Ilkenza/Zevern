import type { Tables } from "./database.types";
import type { BudgetWindow } from "./money/budget-periods";
import type { TxItem } from "./money/items";

export type Client = Tables<"clients">;
export type Project = Tables<"projects">;
export type Task = Tables<"tasks">;
export type Invoice = Tables<"invoices">;
export type SeoCheck = Tables<"seo_checks">;
export type Lead = Tables<"leads">;
export type OutreachTemplate = Tables<"outreach_templates">;
export type ServiceItem = Tables<"service_items">;
export type Quote = Tables<"quotes">;
export type Tool = Tables<"tools">;

export type QuoteItem = { label: string; price: number; qty: number };

export type QuoteWithClient = Omit<Quote, "items"> & {
  items: QuoteItem[];
  client: { name: string } | null;
};

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckResult = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  found?: string;
};

export type ProjectWithClient = Project & { client: { name: string } | null };

export type TaskWithProject = Task & {
  project: { title: string; client: { name: string } | null } | null;
};

export type InvoiceWithClient = Omit<Invoice, "items"> & {
  items: QuoteItem[];
  client: { name: string } | null;
};

export type SeoCheckWithProject = Omit<SeoCheck, "results"> & {
  results: CheckResult[];
  project: { title: string } | null;
};

/* ------------------------------------------------------------- private */

export type MoneyAccount = Tables<"money_accounts">;
export type MoneyCategory = Tables<"money_categories">;
export type MoneyGoal = Tables<"money_goals">;
export type MoneyLoan = Tables<"money_loans">;
export type MoneyRecurring = Tables<"money_recurring">;
export type MoneyBudget = Tables<"money_budgets">;
export type MoneyBudgetPlan = Tables<"money_budget_plans">;
export type MoneyTransaction = Tables<"money_transactions">;
export type MoneyPlanned = Tables<"money_planned">;

export type TransactionRow = MoneyTransaction & {
  category: { name: string; color: string | null; kind: string } | null;
  account: { name: string; currency: string } | null;
  goal: { name: string } | null;
  /** The budget it was filed into by hand, if any — see `TX_SELECT`. */
  budget: { name: string } | null;
  /*
    What was in the bag.

    Declared here rather than taken from the generated database types, because the
    column is `jsonb` and those would type it as `Json` — a union wide enough that
    every screen touching an item would have to narrow it again. The shape is enforced
    on the way in and on the way out instead; see `parseItems`.
  */
  items?: TxItem[] | null;
};

export type RecurringRow = MoneyRecurring & {
  category: { name: string; color: string | null } | null;
  account: { name: string } | null;
  /** Set when the rule is a standing order into a goal rather than a bill. */
  goal: { name: string; color: string | null } | null;
};

/**
 * A one-off dated thing that is known about but has not happened yet — the dentist
 * bill, the tax payment, the invoice landing on the 20th.
 *
 * `settled_at` is the line between a prediction and a fact: while it is null the item
 * is on the timeline, and the moment it is set the entry named by `transaction_id` is
 * carrying the money instead. Nothing counts it twice because nothing counts both.
 */
export type PlannedRow = MoneyPlanned & {
  category: { name: string; color: string | null } | null;
  account: { name: string } | null;
};

/** How the forecast projects everyday spending. Mirrors the check on the column. */
export type SpendingBasis = "off" | "budgets" | "history";

/**
 * A debt with what is still outstanding on it.
 *
 * `settled` is what has been paid against the total so far, worked out from the
 * movements rather than stored — a stored running figure is one more thing that can
 * drift out of step with the ledger it is supposed to describe.
 */
export type LoanLine = MoneyLoan & {
  /** Paid against the total so far. */
  settled: number;
  /** What is still owed. Never negative — an overpayment is settled, not owed back. */
  outstanding: number;
  /** Movements against this loan, newest first. */
  movements: { id: string; on: string; amount: number; kind: string; title: string | null }[];
  /** Set when a recurring rule is paying it down: how many of its instalments are left. */
  instalmentsLeft: number | null;
  /** What one instalment costs, when there is a rule behind it. */
  instalment: number | null;
};

/** A category with its monthly limit and what has been spent against it. */
export type BudgetLine = {
  category: MoneyCategory;
  limit: number;
  spent: number;
  /**
   * What the budget owning this category actually counts, which is not always what the
   * category cost.
   *
   * They differ by the entries you put in a budget by hand: a lunch filed under a
   * holiday is real spending on Eating out — so it belongs in `spent`, which is a report
   * — and is not an overspend against the monthly Eating out budget, because it was
   * never that budget's money. Optional, and falls back to `spent`, so a category no
   * budget owns is judged against itself exactly as before.
   */
  counted?: number;
  /**
   * What a normal month costs this category — the median of the six completed months
   * before the one being viewed. `0` means there is no typical month to speak of, and
   * the screen then offers no suggestion rather than inventing one.
   */
  typical: number;
  /**
   * The dated half of this category's month: recurring charges already booked, and
   * those still to land before it is out.
   *
   * Kept apart from `spent` because they behave nothing like it. Everyday spending
   * accrues with the days and can honestly be extrapolated from a few of them; a bill
   * does not — it is one date and one figure, known in advance. Mixing the two is what
   * makes a budget scream on the 3rd: rent lands, a tenth of the month has gone, and
   * dividing one by the other projects ten rents.
   */
  fixedPaid: number;
  fixedDue: number;
};

/** One movement between an account and a goal — the goal's own history. */
export type GoalEntry = {
  id: string;
  /** "saving"/"withdraw" on a saving goal, "expense"/"income" on a paying-off one. */
  kind: string;
  /** RSD, always positive; the kind carries the direction. */
  amount: number;
  occurred_on: string;
  note: string | null;
  account: string | null;
  /** Set when the entry was booked by a standing order rather than typed by hand. */
  recurring: boolean;
};

/**
 * A goal with everything derived from its own movements.
 *
 * Two goals read the same way and mean different things. A saving goal collects money
 * it then holds; a paying-off goal counts money that has already gone. The arithmetic
 * is identical — a running figure against a target — so it is done once, into
 * `progress`, and only the words on the card change.
 *
 * `saved` is the part of that figure that is still money: what the goal holds right
 * now, and therefore what it reserves on the accounts. On a paying-off goal it is
 * always zero, because the dinars left when they were spent.
 *
 * `deposited` and `withdrawn` are the two directions taken separately — put in and
 * taken back out on a saving goal, paid and refunded on a paying-off one. `deposited`
 * is what a closed goal has to show, since closing empties it.
 *
 * `peak` is the highest `progress` ever reached, which is the only honest test of
 * whether the target was actually met: putting in 100 twice with a withdrawal in
 * between is not the same as holding 200.
 */
export type GoalLine = MoneyGoal & {
  /** True when the goal is paid off rather than saved up — `direction` as a question. */
  paying: boolean;
  /** Where the goal stands against its target, whichever direction it runs in. */
  progress: number;
  saved: number;
  deposited: number;
  withdrawn: number;
  peak: number;
  /** How many movements there are in total — `entries` only carries the newest few. */
  movements: number;
  entries: GoalEntry[];
  /** The account the last movement used — what the deposit box should offer first. */
  lastAccountId: string | null;
};

/**
 * A budget with its clock already walked: which window today falls in, what the budget
 * watches, and what has happened inside it.
 *
 * `used` means the opposite thing on the two kinds, on purpose. On an expense budget it
 * is what has gone out and the target is a ceiling; on a savings budget it is what is
 * left over — income less spending — and the target is a floor. One field rather than
 * two because every screen wants "the figure this budget is about", and splitting it
 * would only move the `if` somewhere less careful.
 */
/** Extra room a one-off budget grants a recurring one, for every window it falls in. */
export type MoneyBudgetBoost = {
  id: string;
  user_id: string;
  source_budget_id: string;
  target_budget_id: string;
  amount_rsd: number | string;
  created_at: string;
};

export type BudgetPlanLine = {
  plan: MoneyBudgetPlan;
  window: BudgetWindow;
  /** What it watches. Empty means no restriction on that axis, not "nothing". */
  categoryIds: string[];
  accountIds: string[];
  /** Dinars: spent, for an expense budget; kept, for a savings one. */
  used: number;
  /** How many entries are behind that figure. */
  entries: number;
  /**
   * The part of `used` that is also counted by a budget you keep by hand.
   *
   * An entry belongs to the category it was on and to the trip it was filed into, and
   * both budgets count it — that is what putting a category and a budget on one entry
   * means. This is the overlap, so the card can name it instead of leaving the reader to
   * add two cards together and get a number that was never spent. Nought on a hand-kept
   * budget and on a savings one, where the question does not arise.
   */
  filed: number;
  /** Which hand-kept budgets that overlap sits in, for the note under the bar. */
  filedIn: string[];
  /** Dinars the plan's own amount says, before anything is granted to this window. */
  baseRsd: number;
  /**
   * Extra room granted to this window by one-off budgets that fall inside it.
   *
   * A month with a holiday in it is not the same month as the eleven around it, and this
   * is how much more it is allowed to cost. Nought for almost every window.
   */
  extra: number;
  /** The budgets that granted it, earliest first — the screen has to say where it came from. */
  boostedBy: string[];
  /**
   * What this window is actually allowed: `baseRsd + extra`.
   *
   * Every screen judges against this rather than the plan's own amount, so a raised
   * window is raised everywhere at once and nowhere by accident.
   */
  limitRsd: number;
};

