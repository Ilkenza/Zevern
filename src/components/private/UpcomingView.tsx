"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus, Repeat, type LucideIcon } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { Rates } from "@/lib/money";
import type { Forecast, RecurringTotals } from "@/lib/data/money";
import type { MoneyAccount, MoneyCategory, MoneyGoal, RecurringRow } from "@/lib/types";
import { RecurringForm } from "./RecurringForm";
import { UpcomingRules } from "./UpcomingRules";
import { UpcomingTimeline } from "./UpcomingTimeline";
import { NEW_RULE_HREF, RULES_HREF, TIMELINE_HREF, type UpcomingPanel } from "./upcoming";

const BLURB = {
  timeline: "What falls due over the next 90 days, and what it leaves on the accounts.",
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
        "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
        current ? "bg-active-bg text-gold-hi" : "text-muted hover:bg-white/5 hover:text-ink",
      )}
    >
      <Icon className="h-3.75 w-3.75" />
      {label}
      {count > 0 && (
        <span
          className={cn(
            "mono rounded-pill px-1.5 py-px text-[10.5px] font-semibold",
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
  /** Every rule there is — the number beside the Rules tab. */
  ruleCount: number;
  /** Rules waiting to be booked — the number beside the Timeline tab, where they live. */
  dueCount: number;
} & (
  | { view: "timeline"; forecast: Forecast; items: RecurringRow[]; due: RecurringRow[] }
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
 */
export function UpcomingView(props: UpcomingViewProps) {
  const router = useRouter();
  const rules = props.view === "rules" ? props : null;
  const panel = rules?.panel ?? null;

  // The form belongs to the register, so closing it lands back on the register.
  const close = () => router.push(RULES_HREF);

  return (
    <div className="mx-auto max-w-220 space-y-5">
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
              Upcoming
            </h1>
            <p className="text-[12.5px] text-muted">{BLURB[props.view]}</p>
          </div>
          <Link href={NEW_RULE_HREF} className={buttonClasses("primary", "shrink-0")}>
            <Plus className="h-4 w-4" />
            New recurring
          </Link>
        </div>

        <nav
          aria-label="Upcoming views"
          className="inline-flex items-center gap-1 rounded-pill border border-line bg-white/[0.03] p-1"
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
            label="Rules"
            count={props.ruleCount}
            countLabel="in total"
          />
        </nav>
      </div>

      {props.view === "timeline" ? (
        <UpcomingTimeline forecast={props.forecast} items={props.items} due={props.due} />
      ) : (
        <UpcomingRules items={props.items} totals={props.totals} rates={props.rates} />
      )}

      {rules && (
        <SlideOver
          open={panel !== null}
          onClose={close}
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
    </div>
  );
}
