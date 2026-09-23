"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Pause, Pencil, Play } from "lucide-react";
import { removeRecurring, toggleRecurring } from "@/app/(app)/private/actions";
import { Badge } from "@/components/ui/Badge";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { type Currency, type Rates } from "@/lib/money";
import { useMoney } from "@/lib/money/currency";
import { makeMoney } from "@/lib/money/display";
import { cn } from "@/lib/utils";
import type { RecurringRow } from "@/lib/types";
import { RULES_HREF, daysBetween, whenLabel } from "./index";
import { NO_COLOUR, WithDot, caps } from "./ui";
import { EVERY_LABEL, EVERY_TICK, read, ruleCols } from "./rules-reading";

export function RuleRow({ item, rates, today }: { item: RecurringRow; rates: Rates; today: string }) {
  const money = useMoney();
  /*
    A rule can ask to be read in its own currency. Everything else on the screen — the
    totals above, the timeline — stays in the profile's, because those are sums across
    rules and a sum has to have one unit.
  */
  const shown =
    item.display_currency && item.display_currency !== money.code
      ? makeMoney({ currency: item.display_currency as Currency, rates })
      : money;
  const fmt = shown.fmt;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const r = read(item, rates);
  const income = item.kind === "income";

  const flip = () => {
    startTransition(async () => {
      await toggleRecurring(item.id, !item.active);
      router.refresh();
    });
  };

  const controls = (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={flip}
        disabled={pending}
        aria-label={item.active ? `Pause ${item.name}` : `Resume ${item.name}`}
        title={item.active ? "Pause — stop booking this one" : "Resume"}
        className="zv-rowctrl"
      >
        {item.active ? <Pause className="h-3.75 w-3.75" /> : <Play className="h-3.75 w-3.75" />}
      </button>
      <Link
        href={`${RULES_HREF}&edit=${item.id}`}
        aria-label={`Edit ${item.name}`}
        title="Edit"
        className="zv-rowctrl"
      >
        <Pencil className="h-3.75 w-3.75" />
      </Link>
      <DeleteButton
        compact
        label={`Delete ${item.name}`}
        confirmText="Delete this recurring item? It stops repeating from now on — entries already booked from it stay in Money."
        action={async () => {
          await removeRecurring(item.id);
          router.refresh();
        }}
      />
    </div>
  );

  // A paused rule keeps its next date — that is where it picks up again — but saying
  // how many days off it is would promise something that is not going to happen.
  const when = r.settled
    ? "finished"
    : !item.active
      ? "paused"
      : whenLabel(daysBetween(today, item.next_on));
  const overdue = r.running && item.next_on < today;
  const badged = Boolean(
    item.variable || r.toGoal || item.loan || r.countdown || (!item.active && !r.settled),
  );

  return (
    <div
      className={cn(
        ruleCols,
        "border-b border-line-soft px-4 py-3 last:border-b-0 hover:bg-white/2",
        !r.running && "bg-white/[0.015]",
      )}
    >
      <div className="col-span-2 flex min-w-0 items-start gap-3 min-[760px]:col-span-1">
        <span
          aria-hidden="true"
          className={cn("mt-0.5 h-8 w-1 shrink-0 rounded-pill", !r.running && "opacity-45")}
          style={{ background: item.goal?.color ?? NO_COLOUR }}
        />

        <div className="min-w-0 flex-1">
          {/*
            The badges are one group, so a phone can give them the whole width.

            There the name shares its line with three 44px controls, and the badges in the
            space left beside them broke one to a line — `Pays a debt` over `4 of 4 left`.
            On a phone the group goes under the name and the controls both (see
            `.rule-row-head`); on a desk it follows the name as before.
          */}
          <div className="rule-row-head flex items-start gap-2">
            <div className="rule-row-title flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "min-w-0 truncate text-[13.5px] font-semibold",
                  r.running ? "text-ink" : "text-muted",
                )}
              >
                {item.name}
              </span>
              {badged && (
                <span className="rule-row-badges flex flex-wrap items-center gap-x-2 gap-y-1">
                  {item.variable && <Badge status="info">Variable</Badge>}
                  {r.toGoal && <Badge status="info">Into a goal</Badge>}
                  {/* A rule is never both — see `saveRecurring`, where a goal clears the debt. */}
                  {item.loan && <Badge status="active">Pays a debt</Badge>}
                  {r.countdown && <Badge status={r.countdown.status}>{r.countdown.label}</Badge>}
                  {!item.active && !r.settled && <Badge status="draft">Paused</Badge>}
                </span>
              )}
            </div>
            <div className="rule-row-ctrls ml-auto min-[760px]:hidden">{controls}</div>
          </div>

          {/* The same clipped first dot as the timeline rows — the note is in `TimelineRow`. */}
          <div className="mt-0.5 overflow-hidden text-[11.5px] text-muted">
            <div className="-ml-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <WithDot>
                <span>{EVERY_LABEL[item.every] ?? item.every}</span>
              </WithDot>
              <WithDot>
                {item.goal ? (
                  <span className="min-w-0 truncate text-held">{item.goal.name}</span>
                ) : item.loan ? (
                  <span className="min-w-0 truncate">
                    <span className="text-gold-hi">{item.loan.name}</span>
                    {item.category && <span> · {item.category.name}</span>}
                  </span>
                ) : (
                  <span className="min-w-0 truncate">{item.category?.name ?? "No category"}</span>
                )}
              </WithDot>
              <WithDot>
                <span className="min-w-0 truncate">{item.account?.name ?? "No account"}</span>
              </WithDot>
              {item.ends_on && (
                <WithDot>
                  <span className="mono">until {item.ends_on}</span>
                </WithDot>
              )}
            </div>
          </div>
        </div>
      </div>

      {/*
        On a phone each figure is its label over its value, in two halves.

        Label and value used to sit side by side in each half, and 155px does not hold
        `What you pay` and `1.216 RSD/m` on one line: both broke in two, the label into
        `What you / pay` and the figure into `1.216 / RSD/m`, four ragged columns across
        the card. Stacked, each half is two short lines that never break. The first half
        starts where the name does, past the colour mark, so the row keeps one left edge.
      */}
      <div className="flex flex-col items-start gap-0.5 pl-4 min-[760px]:flex-row min-[760px]:items-baseline min-[760px]:justify-end min-[760px]:gap-2 min-[760px]:pl-0">
        <span className={cn(caps, "min-[760px]:hidden")}>What you pay</span>
        <div className="whitespace-nowrap min-[760px]:text-right">
          {r.charged === null ? (
            <span className="text-[12.5px] text-faint">changes</span>
          ) : (
            <>
              <div
                className={cn(
                  "mono text-[13.5px] font-semibold",
                  !r.running
                    ? "text-faint"
                    : income
                      ? "text-ok"
                      : r.toGoal
                        ? "text-held"
                        : "text-ink",
                )}
              >
                {income && "+ "}
                {fmt(r.charged)}
                <span className="rule-cadence">{EVERY_TICK[item.every] ?? ""}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-start gap-0.5 min-[760px]:flex-row min-[760px]:items-baseline min-[760px]:justify-end min-[760px]:gap-2">
        <span className={cn(caps, "min-[760px]:hidden")}>Next due</span>
        <div className="whitespace-nowrap min-[760px]:text-right">
          <div
            className={cn(
              "mono text-[12.5px]",
              r.settled ? "text-faint" : r.running ? "text-ink" : "text-muted",
            )}
          >
            {r.settled ? "—" : item.next_on}
          </div>
          {when && (
            <div className={cn("text-[11px]", overdue ? "text-danger" : "text-faint")}>{when}</div>
          )}
        </div>
      </div>

      <div className="hidden justify-end min-[760px]:flex">{controls}</div>
    </div>
  );
}

export function RuleHead() {
  return (
    <div
      aria-hidden="true"
      className="hidden border-b border-line-soft px-4 py-1.5 min-[760px]:grid min-[760px]:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem_6.5rem] min-[760px]:items-center min-[760px]:gap-x-3"
    >
      <span className={caps}>Rule</span>
      <span className={cn(caps, "text-right")}>What you pay</span>
      <span className={cn(caps, "text-right")}>Next due</span>
      <span />
    </div>
  );
}

/* ------------------------------------------------------------ the handles */

/**
 * Below this many rules the register is read, not searched. A filter bar over five
 * rows is chrome standing in front of the thing it is meant to help with; over thirty
 * it is the only way to answer a question without reading everything.
 */
