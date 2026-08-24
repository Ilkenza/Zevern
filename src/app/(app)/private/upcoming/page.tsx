import {
  getAccounts,
  getCategories,
  getDueRecurring,
  getForecast,
  getGoals,
  getRates,
  getRecurring,
  getRecurringTotals,
} from "@/lib/data/money";
import { UpcomingView } from "@/components/private/UpcomingView";
import type { UpcomingPanel } from "@/components/private/upcoming";

const WINDOWS = [30, 60, 90];

export default async function UpcomingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; new?: string; edit?: string }>;
}) {
  const params = await searchParams;

  // Rules are created and edited from the register, so a form request lands there
  // whichever view the link came from — the list behind the panel is then the list
  // the new item joins.
  const wantsForm = Boolean(params.new || params.edit);
  const view = params.view === "rules" || wantsForm ? "rules" : "timeline";

  // Both views need the rules themselves: the register lists them, the timeline uses
  // them to explain an empty window, and both tabs are labelled with their count.
  const [items, due] = await Promise.all([getRecurring(), getDueRecurring()]);

  if (view === "rules") {
    const [totals, rates, accounts, categories, goals] = await Promise.all([
      getRecurringTotals(),
      getRates(),
      wantsForm ? getAccounts() : [],
      wantsForm ? getCategories() : [],
      // Only the goals still open can be fed — a closed one has already let go.
      wantsForm ? getGoals() : [],
    ]);

    let panel: UpcomingPanel = null;
    if (params.new) {
      panel = { mode: "new" };
    } else if (params.edit) {
      const item = items.find((i) => i.id === params.edit);
      if (item) panel = { mode: "edit", item };
    }

    return (
      <UpcomingView
        view="rules"
        ruleCount={items.length}
        dueCount={due.length}
        items={items}
        totals={totals}
        rates={rates}
        accounts={accounts}
        categories={categories}
        goals={goals}
        panel={panel}
      />
    );
  }

  const forecast = await getForecast(WINDOWS);

  return (
    <UpcomingView
      view="timeline"
      ruleCount={items.length}
      dueCount={due.length}
      forecast={forecast}
      items={items}
      due={due}
    />
  );
}
