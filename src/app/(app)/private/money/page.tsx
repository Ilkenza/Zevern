import {
  getAccountBalances,
  getAccounts,
  getBudgetLines,
  getCategories,
  getGoals,
  getLoans,
  getMonthSummary,
  getOnHand,
  getRates,
  getTransaction,
  getTransactions,
  hasIncomeOnFile,
} from "@/lib/data/money";
import { MoneyView, type MoneyPanel } from "@/components/private/MoneyView";
import { monthKey } from "@/lib/money";

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; new?: string; edit?: string; cat?: string }>;
}) {
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? (params.month as string) : monthKey();

  const [transactions, summary, accounts, categories, goals, loans, rates, balances, onHand, incomeOnFile, budgetLines] =
    await Promise.all([
      getTransactions({ month, categoryId: params.cat }),
      getMonthSummary(month),
      getAccounts(),
      getCategories(),
      getGoals(),
      getLoans(),
      getRates(),
      getAccountBalances(),
      getOnHand(),
      hasIncomeOnFile(),
      /*
        The caps, so the breakdown can say them.

        "Where it went" answered how much a category cost and never whether that was
        more than you meant to spend on it — the answer sat on the Budgets screen, one
        navigation away from the only moment anybody wants it. Same merge as the
        overview: the split is the panel, and the limit is a property of a row in it.
      */
      getBudgetLines(month),
    ]);

  /*
    A plain record rather than the lines themselves. `SpendBreakdown` runs on the
    client and needs one number per category id; sending the whole budget line would
    ship six fields per category across the wire for the sake of one.
  */
  const limits: Record<string, number> = {};
  for (const line of budgetLines) if (line.limit > 0) limits[line.category.id] = line.limit;

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
      transactions={transactions}
      summary={summary}
      categories={categories.filter((c) => c.kind === "expense")}
      data={{ accounts, categories, goals, loans, rates }}
      balances={balances}
      onHand={onHand}
      incomeOnFile={incomeOnFile}
      panel={panel}
      activeCategory={params.cat}
      limits={limits}
    />
  );
}
