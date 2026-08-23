import type { Tables } from "./database.types";

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
export type MoneyRecurring = Tables<"money_recurring">;
export type MoneyBudget = Tables<"money_budgets">;
export type MoneyTransaction = Tables<"money_transactions">;

export type TransactionRow = MoneyTransaction & {
  category: { name: string; color: string | null; kind: string } | null;
  account: { name: string; currency: string } | null;
  goal: { name: string } | null;
};

export type RecurringRow = MoneyRecurring & {
  category: { name: string; color: string | null } | null;
  account: { name: string } | null;
};

/** A category with its monthly limit and what has been spent against it. */
export type BudgetLine = {
  category: MoneyCategory;
  limit: number;
  spent: number;
};

export type GoalLine = MoneyGoal & { saved: number };
