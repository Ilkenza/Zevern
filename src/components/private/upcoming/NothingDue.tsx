import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import type { RecurringRow } from "@/lib/types";
import { NEW_PLAN_HREF, NEW_RULE_HREF, RULES_HREF } from "./index";
import { caps } from "./ui";

export function NothingDue({
  items,
  unknown,
  horizon,
  spendingOff,
}: {
  items: RecurringRow[];
  unknown: number;
  horizon: string;
  spendingOff: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing on the line yet"
        description="Rent, hosting, a phone paid off in instalments — enter each one once. Something you know you are buying next month, or a dentist bill you are expecting, goes on as a planned purchase."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={NEW_RULE_HREF} className={buttonClasses("primary", "money-premium-button")}>
              New recurring
            </Link>
            <Link href={NEW_PLAN_HREF} className={buttonClasses("secondary", "money-premium-button")}>
              Plan a purchase
            </Link>
          </div>
        }
      />
    );
  }

  let paused = 0;
  let finished = 0;
  let earliest: string | null = null;

  for (const item of items) {
    const total = item.installments_total;
    const done = item.installments_done ?? 0;
    if ((total != null && done >= total) || (item.ends_on != null && item.next_on > item.ends_on)) {
      finished++;
    } else if (!item.active) {
      paused++;
    } else if (item.next_on > horizon && (earliest === null || item.next_on < earliest)) {
      earliest = item.next_on;
    }
  }

  const reasons: string[] = [];
  if (paused > 0) reasons.push(`${paused} ${paused === 1 ? "rule is" : "rules are"} paused.`);
  if (finished > 0)
    reasons.push(
      `${finished} ${finished === 1 ? "rule has" : "rules have"} finished — the instalments ran out, or the end date passed.`,
    );
  if (earliest) reasons.push(`The earliest date left is ${earliest}, past the end of this window.`);
  if (unknown > 0)
    reasons.push(
      `${unknown} variable ${unknown === 1 ? "rule has" : "rules have"} no past bookings, so there is nothing to estimate ${unknown === 1 ? "it" : "them"} from.`,
    );
  reasons.push("Nothing has been planned as a one-off inside this window either.");
  if (spendingOff)
    reasons.push("Everyday spending is switched off, so nothing is projected for it.");

  return (
    <>
      <EmptyState
        icon={CalendarClock}
        title={`Nothing falls due before ${horizon}`}
        description={`${items.length} recurring ${items.length === 1 ? "rule exists" : "rules exist"}, and none of them lands inside this window.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={RULES_HREF} className={buttonClasses("secondary", "money-premium-button")}>
              Open the rules
            </Link>
            <Link href={NEW_PLAN_HREF} className={buttonClasses("secondary", "money-premium-button")}>
              Plan a purchase
            </Link>
          </div>
        }
      />
      <div className="border-t border-line-soft px-5 py-4">
        <div className={caps}>Why</div>
        <ul className="mt-2.5 space-y-2 text-[12.5px] text-muted">
          {reasons.map((reason) => (
            <li key={reason} className="flex gap-2.5">
              <span aria-hidden="true" className="shrink-0 text-faint">
                ·
              </span>
              <span className="min-w-0">{reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * One-offs dated past the end of the window. They are not on the line yet and they do
 * not change any figure on this screen — but they exist, and something that exists with
 * no way back to it is how a plan quietly becomes unreachable.
 */
