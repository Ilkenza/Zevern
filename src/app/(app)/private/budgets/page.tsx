import {
  getAccounts,
  getBudgetBoosts,
  getBudgetHistories,
  getBudgetPlanLines,
  getCategories,
} from "@/lib/data/money";
import { BudgetPlansView } from "@/components/private/BudgetPlansView";
import { todayISO } from "@/lib/format";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  // `?new=1` is how the quick-add menu opens this form from anywhere else in the app.
  const params = await searchParams;
  // Today is settled on the server — the same rule the rest of the private workspace
  // follows — so which period a budget is in cannot change under hydration.
  const today = todayISO();
  const [lines, categories, accounts, boosts, histories] = await Promise.all([
    getBudgetPlanLines(today),
    getCategories(),
    getAccounts(),
    getBudgetBoosts(),
    getBudgetHistories(today),
  ]);

  return (
    <BudgetPlansView
      lines={lines}
      categories={categories}
      accounts={accounts}
      boosts={boosts}
      histories={histories}
      today={today}
      openNew={Boolean(params.new)}
    />
  );
}
