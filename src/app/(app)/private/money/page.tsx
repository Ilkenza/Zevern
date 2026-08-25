import {
  getAccountBalances,
  getAccounts,
  getCategories,
  getGoals,
  getMonthSummary,
  getOnHand,
  getRates,
  getTransaction,
  getTransactions,
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

  const [transactions, summary, accounts, categories, goals, rates, balances, onHand] =
    await Promise.all([
      getTransactions({ month, categoryId: params.cat }),
      getMonthSummary(month),
      getAccounts(),
      getCategories(),
      getGoals(),
      getRates(),
      getAccountBalances(),
      getOnHand(),
    ]);

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
      data={{ accounts, categories, goals, rates }}
      balances={balances}
      onHand={onHand}
      panel={panel}
      activeCategory={params.cat}
    />
  );
}
