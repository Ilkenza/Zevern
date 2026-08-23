import { getAccounts, getGoalLines } from "@/lib/data/money";
import { GoalsView, type GoalsPanel } from "@/components/private/GoalsView";

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string }>;
}) {
  const params = await searchParams;
  const [goals, accounts] = await Promise.all([getGoalLines(), getAccounts()]);

  let panel: GoalsPanel = null;
  if (params.new) {
    panel = { mode: "new" };
  } else if (params.edit) {
    const goal = goals.find((g) => g.id === params.edit);
    if (goal) panel = { mode: "edit", goal };
  }

  return <GoalsView goals={goals} accounts={accounts} panel={panel} />;
}
