import { getAccounts, getCategories, getRates, getTransactions } from "@/lib/data/money";
import { QuickAdd } from "@/components/private/QuickAdd";
import { monthKey } from "@/lib/money";
import { todayISO } from "@/lib/format";

export default async function QuickAddPage() {
  const today = todayISO();
  const [accounts, categories, rates, month] = await Promise.all([
    getAccounts(),
    getCategories(),
    getRates(),
    getTransactions({ month: monthKey() }),
  ]);

  const spentToday = month
    .filter((t) => t.occurred_on === today && t.kind === "expense")
    .reduce((sum, t) => sum + (Number(t.amount_rsd) || 0), 0);

  return (
    <QuickAdd
      accounts={accounts}
      categories={categories}
      rates={rates}
      spentToday={spentToday}
    />
  );
}
