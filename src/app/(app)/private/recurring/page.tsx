import {
  getAccounts,
  getCategories,
  getDueRecurring,
  getRecurring,
  getRecurringTotals,
} from "@/lib/data/money";
import { RecurringView, type RecurringPanel } from "@/components/private/RecurringView";

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string }>;
}) {
  const params = await searchParams;
  const [items, due, accounts, categories, totals] = await Promise.all([
    getRecurring(),
    getDueRecurring(),
    getAccounts(),
    getCategories(),
    getRecurringTotals(),
  ]);

  let panel: RecurringPanel = null;
  if (params.new) {
    panel = { mode: "new" };
  } else if (params.edit) {
    const item = items.find((i) => i.id === params.edit);
    if (item) panel = { mode: "edit", item };
  }

  return (
    <RecurringView
      items={items}
      due={due}
      accounts={accounts}
      categories={categories}
      totals={totals}
      panel={panel}
    />
  );
}
