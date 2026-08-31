import {
  getAccountBalances,
  getAccounts,
  getAddableBudgets,
  getBudgetLines,
  getCategories,
  getGoals,
  getItems,
  getLoans,
  getMonthSummary,
  getRates,
  getTransaction,
  getTransactions,
  hasIncomeOnFile,
} from "@/lib/data/money";
import { MoneyView, type MoneyPanel } from "@/components/private/MoneyView";
import { monthKey } from "@/lib/money";
import { isRangeKey, rangeFor, type RangeKey } from "@/lib/money/date-range";
import { todayISO } from "@/lib/format";

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    range?: string;
    from?: string;
    to?: string;
    new?: string;
    edit?: string;
    cat?: string;
  }>;
}) {
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? (params.month as string) : monthKey();
  const today = todayISO();

  /*
    What window the screen is of.

    No `range` in the address means the month, which is what this page has always been
    and stays by default. Anything else is read as a span, and the span is what both the
    ledger and the figures above it are computed from — one read, so they cannot disagree.

    `custom` takes its two days straight off the address, and either may be missing: an
    open end is a real answer ("everything since March"), not an incomplete one.
  */
  const range: RangeKey = isRangeKey(params.range) ? params.range : "month";

  /*
    The categories the screen is standing in, as a list.

    One value in the address became several separated by commas, because the question
    people actually ask a ledger is "groceries and eating out, together" — and answered
    one category at a time that is arithmetic the reader has to do in their head. A single
    id still parses to a list of one, so every link written before this still works.
  */
  const cats = (params.cat ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const day = (value: string | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value! : "");
  const span =
    range === "month"
      ? null
      : range === "custom"
        ? { from: day(params.from), to: day(params.to) }
        : rangeFor(range, today);

  const [transactions, summary, accounts, categories, goals, loans, rates, balances, incomeOnFile, budgetLines, budgets, items] =
    await Promise.all([
      getTransactions(span ? { ...span, categoryIds: cats } : { month, categoryIds: cats }),
      getMonthSummary(month, span ?? undefined),
      getAccounts(),
      getCategories(),
      getGoals(),
      getLoans(),
      getRates(),
      getAccountBalances(),
      hasIncomeOnFile(),
      /*
        The caps, so the breakdown can say them.

        "Where it went" answered how much a category cost and never whether that was
        more than you meant to spend on it — the answer sat on the Budgets screen, one
        navigation away from the only moment anybody wants it. Same merge as the
        overview: the split is the panel, and the limit is a property of a row in it.
      */
      getBudgetLines(month),
      getAddableBudgets(),
      // The shopping list, so a purchase can be picked instead of retyped.
      getItems(),
    ]);

  /*
    A plain record rather than the lines themselves. `SpendBreakdown` runs on the
    client and needs one number per category id; sending the whole budget line would
    ship six fields per category across the wire for the sake of one.
  */
  const limits: Record<string, { limit: number; counted: number }> = {};
  /*
    Caps only while the screen is on a month.

    A budget's limit is a month's limit. Printed beside three months of spending it is
    the same number meaning a third of what it says, and every category would read as
    catastrophically over — a wrong answer stated confidently, which is worse than no
    answer. Over a span the breakdown says what was spent and stops there.
  */
  if (!span) {
    for (const line of budgetLines) {
      if (line.limit > 0) {
        limits[line.category.id] = { limit: line.limit, counted: line.counted ?? line.spent };
      }
    }
  }

  let panel: MoneyPanel = null;
  if (params.new) {
    panel = { mode: "new", kind: params.new };
  } else if (params.edit) {
    const tx = await getTransaction(params.edit);
    if (tx) panel = { mode: "edit", tx };
  }

  return (
    <MoneyView
      month={month}
      // The month being browsed is decided on the server, so the client never has to
      // guess what "this month" is and can never disagree with it after hydration.
      currentMonth={monthKey()}
      today={today}
      range={range}
      spanFrom={span?.from ?? ""}
      spanTo={span?.to ?? ""}
      transactions={transactions}
      summary={summary}
      categories={categories.filter((c) => c.kind === "expense")}
      data={{ accounts, categories, goals, loans, rates, budgets, items }}
      balances={balances}
      incomeOnFile={incomeOnFile}
      panel={panel}
      activeCategories={cats}
      limits={limits}
    />
  );
}

