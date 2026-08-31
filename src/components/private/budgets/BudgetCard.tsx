"use client";

/**
 * One budget, as a card: what it is for, how far into it you are, and how the last few
 * periods went. Lifted out of the screen that lists them.
 */

"use client";

import { deleteBudgetPlan } from "@/app/(app)/private/actions";
import { DeleteButton } from "@/components/ui/DeleteButton";
import type { BudgetPast } from "@/lib/data/money";
import { boostNote,filedNote } from "@/lib/money/budget-boosts";
import { clockLabel } from "@/lib/money/budget-periods";
import { useMoney } from "@/lib/money/currency";
import type {
BudgetPlanLine
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Pencil,Receipt } from "lucide-react";
import {
PLAN_STATUS_LABEL,
PLAN_STATUS_TONE,
readPlan
} from "./plan-reading";
import {
LOUD_STATUS,
Meter,
PastStrip,
hasPastStrip,
readingOf
} from "./card-bits";

/**
 * One budget, on one line of time.
 *
 * The card is read in passing, so its picture has to explain itself with nothing beside
 * it — which a ring never did. A circle has no beginning the eye can find, so both the
 * fill and the mark for today had to be learned before either meant anything, and the
 * mark for today came back around to sit beside the start at the end of every period.
 * A line has two ends, and here each one is labelled with the date it actually is. The
 * fill is the money. The tick is today, and it says the word. Nothing has to be taught.
 */
export function BudgetCard({
  line,
  past,
  today,
  onEdit,
  onHistory,
  onPrime,
}: {
  line: BudgetPlanLine;
  past: BudgetPast[];
  today: string;
  onEdit: () => void;
  onHistory: () => void;
  /** Fired on pointer-down, so the read is under way before the click lands. */
  onPrime: () => void;
}) {
  const { fmt } = useMoney();
  const reading = readPlan(line, today, fmt);
  const limit = line.limitRsd;
  const note = boostNote({ extra: line.extra, sources: line.boostedBy }, fmt);
  const filed = filedNote(line.filed, line.filedIn, fmt);
  const { bad, fill } = readingOf(line, reading);
  const strip = hasPastStrip(past);

  return (
    <div className={cn("bud-card", bad && "is-bad")}>
      <div className="bud-head">
        <span className="bud-title">
          {/*
            The name is a label, not the headline. Nobody opens this screen to find out
            what their budgets are called — the figure is what the card is for.
          */}
          <b>{line.plan.name}</b>
          {line.plan.membership === "added" && <em>added only</em>}
        </span>
        {/*
          How often it comes back, and nothing about dates: the bar underneath is made of
          dates and says them at both ends. A budget with fixed dates repeats never, which
          its own heading already says, so it prints nothing here at all.
        */}
        {(line.plan.period !== "custom" || line.window.ended) && (
          <span className="bud-clock">
            {line.plan.period === "custom"
              ? ""
              : clockLabel({
                  period: line.plan.period as "day" | "week" | "month" | "year",
                  period_count: line.plan.period_count,
                  starts_on: line.plan.starts_on,
                  ends_on: line.plan.ends_on,
                })}
            {line.window.ended
              ? line.plan.period === "custom"
                ? "finished"
                : " · finished"
              : ""}
          </span>
        )}
      </div>

      {/*
        The unit once. `5.237 RSD of 20.000 RSD` said RSD twice on every card.

        And `of` only where something is being consumed. A savings budget is a floor to
        reach, not a ceiling to eat into — `-28.123 of 20.000` described a month that had
        spent minus twenty-eight thousand of its allowance, which is not a sentence.
      */}
      <span className="bud-used">
        {fmt(line.used).replace(/\s*RSD$/, "")}
        <i>
          {line.plan.kind === "savings" ? "toward" : "of"} {fmt(limit)}
        </i>
      </span>

      <Meter line={line} fill={fill} pace={reading.pace} today={today} />

      <p className="bud-note">
        {reading.note}
        {filed && <i> · {filed}</i>}
        {note && <em> · {note}</em>}
      </p>

      {/*
        The verdict, only when it is one — and the controls only when the pointer is here.
        On a quiet month the card carries no word at all: the bar has already said it.
      */}
      <div className="bud-corner">
        {LOUD_STATUS.has(reading.status) && (
          <span
            className={cn(
              "bud-verdict",
              bad ? "text-danger" : PLAN_STATUS_TONE[reading.status],
            )}
          >
            {PLAN_STATUS_LABEL[reading.status]}
          </span>
        )}
        {/*
          What is in the figure — but only on a card the strip has not reached.

          Both this and the strip below open the same panel, and a card carrying two
          controls that do one thing is a card asking you to guess which is which. The
          strip is the better door wherever it exists: it is bigger, it says what it is
          without being hovered, and it prints a sentence at rest. It cannot exist until
          a period has finished, which is exactly the gap this icon covers.
        */}
        {!strip && (
          <button
            type="button"
            onClick={onHistory}
            onPointerDown={onPrime}
            aria-label={`What is in ${line.plan.name}`}
            title="See what is in it"
            className="zv-rowctrl bud-edit"
          >
            <Receipt className="h-3.75 w-3.75" />
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${line.plan.name}`}
          title="Edit budget"
          className="zv-rowctrl bud-edit"
        >
          <Pencil className="h-3.75 w-3.75" />
        </button>
        {/*
          Deleting from the card, beside editing, rather than only from inside the panel.
          The bin still asks before it does anything — the confirm is the safety here, not
          the distance.
        */}
        <DeleteButton
          compact
          className="bud-edit"
          action={async () => {
            await deleteBudgetPlan(line.plan.id);
          }}
          label={`Delete ${line.plan.name}`}
          confirmText="Delete this budget? The entries it counted stay in the ledger."
        />
      </div>

      <PastStrip past={past} kind={line.plan.kind} onOpen={onHistory} onPrime={onPrime} />
    </div>
  );
}
