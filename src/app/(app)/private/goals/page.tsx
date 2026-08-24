import { getAccounts, getGoalLines, getOnHand } from "@/lib/data/money";
import { getProfile } from "@/lib/data/profile";
import { GoalsView, type GoalsPanel } from "@/components/private/GoalsView";

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string; archived?: string }>;
}) {
  const params = await searchParams;
  const [goals, accounts, onHand, profile] = await Promise.all([
    getGoalLines(),
    getAccounts(),
    getOnHand(),
    getProfile(),
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
      customColors={profile?.custom_colors ?? []}
      showArchived={Boolean(params.archived)}
    />
  );
}
