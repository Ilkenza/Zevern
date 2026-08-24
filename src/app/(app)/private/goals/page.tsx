import { getAccounts, getGoalLines } from "@/lib/data/money";
import { getProfile } from "@/lib/data/profile";
import { GoalsView, type GoalsPanel } from "@/components/private/GoalsView";

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string }>;
}) {
  const params = await searchParams;
  const [goals, accounts, profile] = await Promise.all([
    getGoalLines(),
    getAccounts(),
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
      panel={panel}
      customColors={profile?.custom_colors ?? []}
    />
  );
}
