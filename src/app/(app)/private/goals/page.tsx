import { getAccountBalances, getGoalLines, getOnHand } from "@/lib/data/money";
import { GoalsView, type GoalsPanel } from "@/components/private/GoalsView";

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string; archived?: string }>;
}) {
  const params = await searchParams;
  // Balances rather than bare accounts: putting money aside has to know what each
  // account actually has free, or the screen will happily reserve dinars that are not
  // there.
  const [goals, accounts, onHand] = await Promise.all([
    getGoalLines(),
    getAccountBalances(),
    getOnHand(),
  ]);

  let panel: GoalsPanel = null;
  if (params.new) {
    panel = { mode: "new" };
  } else if (params.edit) {
    const goal = goals.find((g) => g.id === params.edit);
    if (goal) panel = { mode: "edit", goal };
  }

  return (
    <GoalsView
      goals={goals}
      accounts={accounts}
      onHand={onHand}
      panel={panel}
      showArchived={Boolean(params.archived)}
    />
  );
}
