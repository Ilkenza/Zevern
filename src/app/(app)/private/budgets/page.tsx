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

  return <BudgetsView month={month} lines={lines} />;
}
