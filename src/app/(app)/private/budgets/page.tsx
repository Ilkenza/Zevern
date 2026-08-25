import { getBudgetLines } from "@/lib/data/money";
import { BudgetsView } from "@/components/private/BudgetsView";
import { monthKey } from "@/lib/money";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? (params.month as string) : monthKey();
  const lines = await getBudgetLines(month);

  // Which month counts as "now" is settled on the server, so the client cannot
  // disagree with it after hydration.
  return <BudgetsView month={month} currentMonth={monthKey()} lines={lines} />;
}
