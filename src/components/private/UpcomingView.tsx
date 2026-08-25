"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus, Repeat, type LucideIcon } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { Rates } from "@/lib/money";
import type { Forecast, RecurringTotals } from "@/lib/data/money";
import type {
  MoneyAccount,
  MoneyCategory,
  MoneyGoal,
  PlannedRow,
  RecurringRow,
} from "@/lib/types";
import { RecurringForm } from "./RecurringForm";
import { PlannedForm } from "./PlannedForm";
import { UpcomingRules } from "./UpcomingRules";
import { UpcomingTimeline } from "./UpcomingTimeline";
import {
  NEW_PLAN_HREF,
  NEW_RULE_HREF,
  RULES_HREF,
  TIMELINE_HREF,
  type PlanPanel,
  type UpcomingPanel,
} from "./upcoming";

const BLURB = {
  timeline:
    "What falls due over the next 90 days, what living costs on top of it, and what it leaves on the accounts.",
  rules: "What repeats, what it costs a month, and how much longer it runs.",
};

/**
 * One tab of the switch. A link rather than a button, so each view is a real address:
 * it can be bookmarked, shared and stepped back out of.
 */
function Tab({
  href,
  current,
  icon: Icon,
  label,
  count,
  countLabel,
  alert,
}: {
  href: string;
  current: boolean;
  icon: LucideIcon;
  label: string;
  count: number;
  countLabel: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "upcoming-tab inline-flex items-center justify-center gap-2 rounded-pill px-4 py-2 text-[13px] font-semibold",
        current ? "upcoming-tab-on text-gold-hi" : "text-muted hover:text-ink",
      )}
    >
      <Icon className="upcoming-tab-icon h-4 w-4" />
      <span className="upcoming-tab-label">{label}</span>
      {count > 0 && (
        <span
          className={cn(
            "upcoming-tab-count mono inline-flex min-w-6 items-center justify-center rounded-pill px-2 py-0.5 text-[10.5px] font-semibold",
            alert ? "bg-danger-bg text-danger" : "bg-white/6 text-faint",
          )}
        >
          {count}
          <span className="sr-only"> {countLabel}</span>
        </span>
      )}
    </Link>
  );
}

type UpcomingViewProps = {
  /** Every rule there is — the number beside the Repeats tab. */
  ruleCount: number;
  /** Rules and plans waiting to be dealt with — the number beside the Timeline tab. */
  dueCount: number;
} & (
  | {
      view: "timeline";
      forecast: Forecast;
      items: RecurringRow[];
      due: RecurringRow[];
      plannedDue: PlannedRow[];
      planned: PlannedRow[];
      plan: PlanPanel;
      accounts: MoneyAccount[];
      categories: MoneyCategory[];
    }
  | {
      view: "rules";
      items: RecurringRow[];
      totals: RecurringTotals;
      rates: Rates;
      accounts: MoneyAccount[];
      categories: MoneyCategory[];
      goals: MoneyGoal[];
      panel: UpcomingPanel;
    }
);

/**
 * One screen, two answers. "What is coming and what does it leave me" is asked before
 * every real spending decision, so the timeline leads. "What repeats" is asked only
 * when something changes, so the register sits one tap away — but at its own URL.
 *
 * Two things can be created here, and they are not the same thing: a rule that repeats
 * belongs to the register, a one-off that has a date belongs to the timeline. Each
 * form opens over the view it belongs to.
 */
export function UpcomingView(props: UpcomingViewProps) {
  const router = useRouter();
  const rules = props.view === "rules" ? props : null;
  const timeline = props.view === "timeline" ? props : null;
  const panel = rules?.panel ?? null;
  const plan = timeline?.plan ?? null;

  // Each form belongs to a view, so closing it lands back on that view.
  const closeRule = () => router.push(RULES_HREF);
  const closePlan = () => router.push(TIMELINE_HREF);

  return (
    <div className="money-premium upcoming-premium mx-auto max-w-220 space-y-5">
      <div className="money-page-head space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="money-page-kicker">Private · Upcoming</span>
            <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
              Upcoming
            </h1>
            <p className="upcoming-blurb">{BLURB[props.view]}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {props.view === "timeline" && (
              <Link href={NEW_PLAN_HREF} className={buttonClasses("primary", "money-premium-button")}>
                <Plus className="h-4 w-4" />
                Plan a purchase
              </Link>
            )}
            <Link
              href={NEW_RULE_HREF}
              className={buttonClasses(
                props.view === "timeline" ? "secondary" : "primary",
                "money-premium-button",
              )}
            >
              <Plus className="h-4 w-4" />
              New recurring
            </Link>
          </div>
        </div>

        <nav
          aria-label="Upcoming views"
          className="upcoming-tabs inline-flex items-center gap-1.5 rounded-pill border border-line p-1.5"
        >
          <Tab
            href={TIMELINE_HREF}
            current={props.view === "timeline"}
            icon={CalendarClock}
            label="Timeline"
            count={props.dueCount}
            countLabel="due now"
            alert
          />
          <Tab
            href={RULES_HREF}
            current={props.view === "rules"}
            icon={Repeat}
            label="Repeats"
            count={props.ruleCount}
            countLabel="in total"
          />
        </nav>
      </div>

      {timeline ? (
        <UpcomingTimeline
          forecast={timeline.forecast}
          items={timeline.items}
          due={timeline.due}
          plannedDue={timeline.plannedDue}
          planned={timeline.planned}
        />
      ) : (
        rules && <UpcomingRules items={rules.items} totals={rules.totals} rates={rules.rates} />
      )}

      {rules && (
        <SlideOver
          open={panel !== null}
          onClose={closeRule}
          title={panel?.mode === "edit" ? "Edit recurring" : "New recurring"}
        >
          <RecurringForm
            item={panel?.mode === "edit" ? panel.item : undefined}
            accounts={rules.accounts}
            categories={rules.categories}
            goals={rules.goals}
          />
        </SlideOver>
      )}

      {timeline && (
        <SlideOver
          open={plan !== null}
          onClose={closePlan}
          title={plan?.mode === "edit" ? "Edit planned item" : "Plan a purchase"}
        >
          <PlannedForm
            item={plan?.mode === "edit" ? plan.item : undefined}
            accounts={timeline.accounts}
            categories={timeline.categories}
            onDone={closePlan}
          />
        </SlideOver>
      )}
    </div>
  );
}
