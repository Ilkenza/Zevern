import { getAccounts, getBudgetPlanLines, getCategories } from "@/lib/data/money";
import { BudgetPlansView } from "@/components/private/BudgetPlansView";
import { todayISO } from "@/lib/format";

export default async function BudgetsPage() {
  // Today is settled on the server — the same rule the rest of the private workspace
  // follows — so which period a budget is in cannot change under hydration.
  const today = todayISO();
  const [lines, categories, accounts] = await Promise.all([
    getBudgetPlanLines(today),
    getCategories(),
    getAccounts(),
  ]);

  return (
    <BudgetPlansView lines={lines} categories={categories} accounts={accounts} today={today} />
  );
}
