"use client";

import { cn } from "@/lib/utils";

export type PeriodUnit = "day" | "week" | "month" | "year";

const UNITS: PeriodUnit[] = ["day", "week", "month", "year"];

/**
 * The shortcuts, and what each one really is.
 *
 * A fortnight and a quarter are not units — they are two weeks and three months, and
 * the database stores them as exactly that. They are here because they are what people
 * choose: a fortnight is how half the world is paid and a quarter is how tax works, and
 * making either cost "pick month, then select the number, then type 3" makes the two
 * most common non-monthly answers the two slowest.
 *
 * They are drawn as a quiet line of words rather than as a second row of buttons. Two
 * rows of pills that set the same two fields read as two controls fighting; a line of
 * shortcuts under the sentence reads as what it is.
 */
const SHORTCUTS: { label: string; unit: PeriodUnit; count: number }[] = [
  { label: "Daily", unit: "day", count: 1 },
  { label: "Weekly", unit: "week", count: 1 },
  { label: "Fortnightly", unit: "week", count: 2 },
  { label: "Monthly", unit: "month", count: 1 },
  { label: "Quarterly", unit: "month", count: 3 },
  { label: "Yearly", unit: "year", count: 1 },
];

/** Which shortcut a unit and count add up to — `null` when it is something else. */
export function presetKeyFor(unit: string, count: number): string | null {
  return SHORTCUTS.find((p) => p.unit === unit && p.count === count)?.label ?? null;
}

/** "every 6 months", "every 2 weeks" — the clock as a sentence. */
export function periodSentence(unit: string, count: number): string {
  return count === 1 ? `every ${unit}` : `every ${count} ${unit}s`;
}

/**
 * How often something happens, written as the sentence it is.
 *
 * "Repeat every 6 months" is how anybody would say it out loud, so it is what the
 * control looks like: two words you can change sitting inside a line of text, rather
 * than two labelled boxes that have to be read as a pair before they mean anything.
 *
 * Unit and count stay two fields underneath, because that is the only shape that does
 * not need a new value in a check constraint the first time somebody wants every five
 * weeks. The shortcuts are a view onto those two fields and never a third thing to keep
 * in step: tap Quarterly and what is stored is month and 3, and a rule stored as month
 * and 3 lights Quarterly back up.
 */
export function PeriodPicker({
  unit,
  count,
  onChange,
  unitName = "period",
  countName = "period_count",
  lead = "Repeat every",
  max = 60,
  children,
}: {
  unit: PeriodUnit;
  count: number;
  onChange: (unit: PeriodUnit, count: number) => void;
  unitName?: string;
  countName?: string;
  lead?: string;
  max?: number;
  /** Anything that belongs inside the same card — the end condition, a preview. */
  children?: React.ReactNode;
}) {
  const active = presetKeyFor(unit, count);
  const plural = count === 1 ? "" : "s";

  return (
    <div className="mb-3.25 rounded-card border border-line bg-white/[0.022] p-3.5">
      <input type="hidden" name={unitName} value={unit} />
      <input type="hidden" name={countName} value={count} />

      {/* The sentence. Big enough to be the thing you read first on this panel. */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-[14px] font-semibold text-muted">{lead}</span>

        <input
          type="number"
          min={1}
          max={max}
          value={count}
          onChange={(e) => {
            const n = Math.min(max, Math.max(1, Math.floor(Number(e.target.value) || 1)));
            onChange(unit, n);
          }}
          aria-label="How many"
          className="zv-field mono w-14 rounded-ctrl border border-line bg-white/[0.05] px-2 py-1.5 text-center text-[15px] font-bold text-ink focus:border-gold focus:shadow-ring focus:outline-none"
        />

        {/*
          The unit is one word in a sentence, so it is drawn as one word.

          Four buttons in a track was the obvious thing and it was wrong here: laid out
          in a side panel the four wrap onto their own line, and the sentence the whole
          control is built around breaks in half. A select keeps it to a word — and on a
          phone it opens the picker the phone already has, which beats four small targets
          in a row.
        */}
        <div className="relative">
          <select
            value={unit}
            onChange={(e) => onChange(e.target.value as PeriodUnit, count)}
            aria-label="Unit"
            className="zv-field cursor-pointer appearance-none rounded-ctrl border border-line bg-white/[0.05] py-1.5 pr-8 pl-3 text-[15px] font-bold text-ink focus:border-gold focus:shadow-ring focus:outline-none"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
                {plural}
              </option>
            ))}
          </select>
          <span
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[9px] text-muted"
            aria-hidden
          >
            ▼
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {SHORTCUTS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.unit, p.count)}
            aria-pressed={active === p.label}
            className={cn(
              "text-[12px] font-semibold underline-offset-4 transition-colors",
              active === p.label
                ? "text-gold underline decoration-gold/50"
                : "text-faint hover:text-ink hover:underline hover:decoration-dotted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {children}
    </div>
  );
}
