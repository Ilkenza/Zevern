import { getAccounts, getCategories, getItems, getRates, getTransactions } from "@/lib/data/money";
import { QuickAdd } from "@/components/private/QuickAdd";
import { monthKey, spentBy } from "@/lib/money";
import { todayISO } from "@/lib/format";

export default async function QuickAddPage() {
  const today = todayISO();
  const [accounts, categories, rates, month, items] = await Promise.all([
    getAccounts(),
    getCategories(),
    getRates(),
    getTransactions({ month: monthKey() }),
    getItems(),
  ]);

  /* Today's spending, which is what was bought today less what came back today. */
  const spentToday = month
    .filter((t) => t.occurred_on === today)
    .reduce((sum, t) => sum + spentBy(t.kind, Number(t.amount_rsd) || 0), 0);

  return (
    <QuickAdd
      accounts={accounts}
      categories={categories}
      items={items}
      rates={rates}
      spentToday={spentToday}
    />
  );
}
