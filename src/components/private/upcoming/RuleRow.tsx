"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Pause, Pencil, Play } from "lucide-react";
import { removeRecurring, toggleRecurring } from "@/app/(app)/private/actions";
import { Badge } from "@/components/ui/Badge";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { formatAmount, formatRsd, type Rates } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { RecurringRow } from "@/lib/types";
import { RULES_HREF, daysBetween, whenLabel } from "./index";
import { Dot, NO_COLOUR, caps } from "./ui";
import { EVERY_LABEL, EVERY_SHORT, read, ruleCols } from "./rules-reading";

export function RuleRow({ item, rates, today }: { item: RecurringRow; rates: Rates; today: string }) {
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
          style={{ background: item.goal?.color ?? item.category?.color ?? NO_COLOUR }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "min-w-0 truncate text-[13.5px] font-semibold",
                  r.running ? "text-ink" : "text-muted",
                )}
              >
                {item.name}
              </span>
              {item.variable && <Badge status="info">Variable</Badge>}
              {r.toGoal && <Badge status="info">Into a goal</Badge>}
              {r.countdown && <Badge status={r.countdown.status}>{r.countdown.label}</Badge>}
              {!item.active && !r.settled && <Badge status="draft">Paused</Badge>}
            </div>
            <div className="ml-auto min-[760px]:hidden">{controls}</div>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-muted">
            <span>{EVERY_LABEL[item.every] ?? item.every}</span>
            <Dot />
            {item.goal ? (
              <span className="min-w-0 truncate text-held">{item.goal.name}</span>
            ) : (
              <span className="min-w-0 truncate">{item.category?.name ?? "No category"}</span>
            )}
            <Dot />
            <span className="min-w-0 truncate">{item.account?.name ?? "No account"}</span>
            {item.ends_on && (
              <>
                <Dot />
                <span className="mono">until {item.ends_on}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 min-[760px]:justify-end">
        <span className={cn(caps, "min-[760px]:hidden")}>Per month</span>
        <div className="text-right">
          {r.monthly === null ? (
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
                {formatRsd(r.monthly)}
              </div>
              {(item.currency !== "RSD" || item.every !== "month") && (
                <div className="mono text-[11px] text-faint">
                  {formatAmount(Number(item.amount), item.currency)} {EVERY_SHORT[item.every] ?? ""}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 min-[760px]:justify-end">
        <span className={cn(caps, "min-[760px]:hidden")}>Next due</span>
        <div className="text-right">
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
      <span className={cn(caps, "text-right")}>Per month</span>
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
