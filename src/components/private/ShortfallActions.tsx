"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarArrowDown, CalendarArrowUp } from "lucide-react";
import { movePlanned, moveRecurringNext } from "@/app/(app)/private/actions";
import { formatRsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Lever } from "./upcoming";

/** Small caps label — column heads and captions, same token as Setup and Goals. */
const caps = "text-[10.5px] font-semibold uppercase tracking-wider text-faint";

const field =
  "rounded-ctrl border border-line bg-white/[0.035] px-2 py-1 text-[12px] text-ink scheme-dark focus:border-gold focus:shadow-ring";

/**
 * One move that would change the day the money runs out, with the date it has to reach
 * and the balance it would leave. The date is a field rather than a fixed jump, because
 * the date this actually has to move to is a fact about the world, not about the app —
 * the app only knows what the earliest date that helps is.
 */
function LeverRow({ lever, on }: { lever: Lever; on: string }) {
  const router = useRouter();
  const [date, setDate] = useState(lever.target);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const later = lever.direction === "later";
  // Below this the move stops helping: an expense has to clear the day, and money
  // coming in has to arrive by it.
  const helps = later ? date >= lever.target : date <= lever.target;
  const Icon = later ? CalendarArrowDown : CalendarArrowUp;

  const move = () => {
    setError(null);
    startTransition(async () => {
      const result =
        lever.source === "planned"
          ? await movePlanned(lever.id, date)
          : await moveRecurringNext(lever.id, date);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="border-t border-danger/20 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/*
          `min-w-0` means this column never demands room, so `flex-wrap` never fired
          and the date picker beside it squeezed the sentence into a seven-character
          column. A basis gives it something to ask for, and below that the control
          takes its own line.
        */}
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex min-w-0 items-center gap-1.5">
            <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink">
              {lever.name}
            </span>
            <span className="mono shrink-0 text-[12px] text-muted">
              {later ? "−" : "+"} {formatRsd(lever.worth)}
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {later ? (
              <>
                Held back past <span className="mono">{on}</span>,
              </>
            ) : (
              <>
                Brought forward to <span className="mono">{on}</span> or earlier,
              </>
            )}{" "}
            that day leaves{" "}
            <span className={cn("mono", lever.clears ? "text-ok" : "text-danger")}>
              {formatRsd(lever.after)}
            </span>
            {lever.clears ? " — that clears it." : " — still short."}
            {lever.source === "recurring" && (
              <>
                {" "}
                {lever.hits > 1
                  ? `All ${lever.hits} of its dates before then move out of the way, and every later one shifts with them.`
                  : "Every later date of this rule shifts with it."}
              </>
            )}
          </p>
        </div>

        {/*
          On a phone these two sat shoulder to shoulder at the bottom of a paragraph,
          each about 140px wide — a date field too narrow to read and a button too small
          to hit. Stacked, both are full width and neither is guessing.
        */}
        <div className="flex w-full shrink-0 flex-col gap-1.5 min-[560px]:w-auto min-[560px]:flex-row min-[560px]:items-center">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={`New date for ${lever.name}`}
            className={cn(field, "w-full min-[560px]:w-36")}
          />
          <button
            type="button"
            onClick={move}
            disabled={pending || !helps}
            title={
              helps
                ? undefined
                : later
                  ? `Has to be ${lever.target} or later to change this`
                  : `Has to be ${lever.target} or earlier to change this`
            }
            className={cn(
              "w-full rounded-ctrl border border-line bg-white/[0.04] px-2.5 py-2 text-[12px] font-semibold text-ink transition-colors",
              "hover:bg-white/[0.08] disabled:opacity-40 min-[560px]:w-auto min-[560px]:py-1",
            )}
          >
            {pending ? "Moving…" : "Move"}
          </button>
        </div>
      </div>
      {error && <p className="mt-1.5 text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}

/**
 * What can actually be done about the shortfall, from the screen that found it.
 *
 * Only moves that change the answer are offered: something falling due on or before
 * the day, held back past it, or money arriving after it, brought forward. Anything
 * else would be a button that reshuffles the list and leaves the date exactly where
 * it was.
 */
export function ShortfallActions({ levers, on }: { levers: Lever[]; on: string }) {
  if (levers.length === 0) {
    return (
      <p className="border-t border-danger/20 px-4 py-2.5 text-[11.5px] leading-relaxed text-muted">
        Nothing on the line can be moved to fix this: everything that falls due before{" "}
        <span className="mono">{on}</span> is either everyday spending or already past.
        More has to come in, or less has to go out.
      </p>
    );
  }

  return (
    <div>
      <div className={cn(caps, "border-t border-danger/20 px-4 pt-2.5 pb-1")}>
        What would change it
      </div>
      {levers.map((lever) => (
        <LeverRow key={lever.key} lever={lever} on={on} />
      ))}
    </div>
  );
}
