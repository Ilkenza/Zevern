import { todayISO } from "@/lib/format";
import {
  getAccounts,
  getCategories,
  getDueRecurring,
  getForecast,
  getGoals,
  getLoans,
  getPlanned,
  getRates,
  getRecurring,
  getRecurringTotals,
} from "@/lib/data/money";
import { UpcomingView } from "@/components/private/UpcomingView";
import type { PlanPanel, UpcomingPanel } from "@/components/private/upcoming";

const WINDOWS = [30, 60, 90];

export default async function UpcomingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; new?: string; edit?: string; plan?: string }>;
}) {
  const params = await searchParams;

  // Rules are created and edited from the register, so a form request lands there
  // whichever view the link came from — the list behind the panel is then the list
  // the new item joins.
  const wantsForm = Boolean(params.new || params.edit);
  const view = params.view === "rules" || wantsForm ? "rules" : "timeline";

  // Both views need the rules themselves: the register lists them, the timeline uses
  // them to explain an empty window, and both tabs are labelled with their count.
  const [items, due, planned] = await Promise.all([
    getRecurring(),
    getDueRecurring(),
    getPlanned(),
  ]);

  /*
    Local, like every other screen — and `next.config.ts` pins the process to Belgrade
    so "local" on the server is one fixed answer rather than the box's opinion.

    This line used to say "UTC on both sides", which was true and was the bug:
    `toISOString()` ignores `TZ` entirely, so pinning the timezone fixed every path
    that used `getDate()` and left every path that used `toISOString()` two hours
    behind for the first two hours of the morning.
  */
  const today = todayISO();
  const plannedDue = planned.filter((p) => p.due_on <= today);

  // Anything waiting on a decision sits on the timeline, so the tab carries both.
  const dueCount = due.length + plannedDue.length;

  if (view === "rules") {
    const [totals, rates, accounts, categories, goals, loans] = await Promise.all([
      getRecurringTotals(),
      getRates(),
      wantsForm ? getAccounts() : [],
      wantsForm ? getCategories() : [],
      // Only the goals still open can be fed — a closed one has already let go.
      wantsForm ? getGoals() : [],
      // A rule can be the instalment plan of a debt, so the form needs the open ones.
      wantsForm ? getLoans() : [],
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
        dueCount={dueCount}
        items={items}
        totals={totals}
        rates={rates}
        accounts={accounts}
        categories={categories}
        goals={goals}
        loans={loans}
        panel={panel}
      />
    );
  }

  // The one-off form is the only thing on this view that needs accounts and categories,
  // so nothing is read for them until it is actually asked for.
  const wantsPlan = Boolean(params.plan);
  const [forecast, accounts, categories] = await Promise.all([
    getForecast(WINDOWS),
    wantsPlan ? getAccounts() : [],
    wantsPlan ? getCategories() : [],
  ]);

  let plan: PlanPanel = null;
  if (params.plan === "new") {
    plan = { mode: "new" };
  } else if (params.plan) {
    const item = planned.find((p) => p.id === params.plan);
    if (item) plan = { mode: "edit", item };
  }

  return (
    <UpcomingView
      view="timeline"
      ruleCount={items.length}
      dueCount={dueCount}
      forecast={forecast}
      items={items}
      due={due}
      plannedDue={plannedDue}
      planned={planned}
      plan={plan}
      accounts={accounts}
      categories={categories}
    />
  );
}
