"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { removePlanned, settlePlanned, type MoneyState } from "@/app/(app)/private/actions";
import { Panel } from "@/components/ui/Panel";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PlannedRow } from "@/lib/types";
import { daysBetween, whenLabel } from "./upcoming";
import { todayISO } from "@/lib/format";

/** Bare controls inside a row, measured the way Goals and Setup measure their own. */
const field =
  "rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring";

/**
 * One planned thing that has come due, and the two honest answers to it.
 *
 * "It happened" writes the real entry and settles the plan against it in one act, so
 * the money is counted once and the timeline stops predicting a payment that has been
 * made. "It didn't" takes the plan off the line and books nothing — there is no entry
 * to leave behind, because none was ever made.
 */
function DueRow({ item, today }: { item: PlannedRow; today: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(
    settlePlanned,
    undefined,
  );
  const [dropping, setDropping] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const when = whenLabel(daysBetween(today, item.due_on));
  const overdue = item.due_on < today;
  const income = item.kind === "income";

  const drop = () => {
    setDropError(null);
    startTransition(async () => {
      const result = await removePlanned(item.id);
      if (result?.error) setDropError(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="border-b border-line-soft px-4 py-3 last:border-b-0">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="planned_id" value={item.id} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">
              {item.name}
            </span>
            {overdue && <Badge status="danger">Was due</Badge>}
          </div>
          <div className="mono text-[11.5px] text-muted">
            {item.due_on}
            {when && ` · ${when}`} · {item.category?.name ?? "No category"} ·{" "}
            <span className={income ? "text-ok" : undefined}>
              {income ? "+" : "−"} {formatAmount(Number(item.amount), item.currency)}
            </span>
          </div>
        </div>

        <input
          name="amount"
          inputMode="decimal"
          placeholder={`Different amount? ${item.currency}`}
          aria-label={`What ${item.name} actually came to`}
          className={cn(field, "w-40")}
        />
        <input
          name="occurred_on"
          type="date"
          defaultValue={item.due_on}
          aria-label={`The day ${item.name} happened`}
          className={cn(field, "w-38 scheme-dark")}
        />

        <Button type="submit" variant="primary" className="px-3 py-1.5 text-[12.5px]" disabled={pending}>
          {pending ? "…" : "It happened"}
        </Button>

        {dropping ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={drop}
              disabled={busy}
              className={buttonClasses("danger", "px-2.5 py-1.5 text-[12.5px]")}
            >
              {busy ? "…" : "Remove it"}
            </button>
            <button
              type="button"
              onClick={() => setDropping(false)}
              disabled={busy}
              className={buttonClasses("ghost", "px-2 py-1.5 text-[12.5px]")}
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setDropping(true)}
            className={buttonClasses("ghost", "px-2 py-1.5 text-[12.5px]")}
          >
            It didn&apos;t
          </button>
        )}
      </form>

      {(state?.error || dropError) && (
        <p className="mt-1.5 text-[11.5px] text-danger">{state?.error ?? dropError}</p>
      )}
      {dropping && !dropError && (
        <p className="mt-1.5 text-[11.5px] text-muted">
          Nothing was booked for this, so removing it leaves no entry behind.
        </p>
      )}
    </div>
  );
}

/**
 * Planned one-offs that have come due. Nothing here books itself: a plan is a guess
 * about a date and an amount, and only the person who made it knows whether it turned
 * out to be true.
 */
export function PlannedDuePanel({ due }: { due: PlannedRow[] }) {
  const today = todayISO();
  if (due.length === 0) return null;

  return (
    <Panel
      title="Planned, and now due"
      action={
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
          <CalendarCheck className="h-3.5 w-3.5" />
          {due.length} waiting on an answer
        </span>
      }
    >
      <div>
        {due.map((item) => (
          <DueRow key={item.id} item={item} today={today} />
        ))}
      </div>
    </Panel>
  );
}
