"use client";

import { cn } from "@/lib/utils";

export type PeriodUnit = "day" | "week" | "month" | "year";

/**
 * The presets, and what each one really is.
 *
 * Biweekly and Quarterly are not units — they are two weeks and three months, and the
 * database stores them as exactly that. They are here because they are what people
 * choose: a fortnight is how half the world is paid, a quarter is how tax works, and
 * making either of them cost "pick month, then open the number pad, then type 3" is
 * making the two most common non-monthly answers the two slowest ones.
 *
 * `every N` stays underneath for everything else, so nothing is lost by having them.
 */
const PRESETS: { key: string; label: string; unit: PeriodUnit; count: number }[] = [
  { key: "day", label: "Day", unit: "day", count: 1 },
  { key: "week", label: "Week", unit: "week", count: 1 },
  { key: "biweekly", label: "Biweekly", unit: "week", count: 2 },
  { key: "month", label: "Month", unit: "month", count: 1 },
  { key: "quarterly", label: "Quarterly", unit: "month", count: 3 },
  { key: "year", label: "Year", unit: "year", count: 1 },
];

/** Which preset a unit and count add up to — `null` when it is something custom. */
export function presetKeyFor(unit: string, count: number): string | null {
  return PRESETS.find((p) => p.unit === unit && p.count === count)?.key ?? null;
}

/** "every 6 months", "every fortnight" — the clock as a sentence. */
export function periodSentence(unit: string, count: number): string {
  const preset = presetKeyFor(unit, count);
  if (preset === "biweekly") return "every 2 weeks";
  if (preset === "quarterly") return "every 3 months";
  return count === 1 ? `every ${unit}` : `every ${count} ${unit}s`;
}

/**
 * How often something happens: a row of the answers people actually give, and a number
 * for the ones they do not.
 *
 * Unit and count are two fields rather than one enum, because that is the only shape
 * that does not need a new row in a check constraint every time somebody wants every
 * five weeks. The presets are a view onto those two fields, never a third thing to keep
 * in step: pick "Quarterly" and what gets stored is month and 3, and a rule stored as
 * month and 3 lights "Quarterly" back up.
 */
export function PeriodPicker({
  unit,
  count,
  onChange,
  unitName = "period",
  countName = "period_count",
  label = "Repeat every",
  max = 60,
}: {
  unit: PeriodUnit;
  count: number;
  onChange: (unit: PeriodUnit, count: number) => void;
  unitName?: string;
  countName?: string;
  label?: string;
  max?: number;
}) {
  const active = presetKeyFor(unit, count);

  return (
    <div className="mb-3.25">
      <input type="hidden" name={unitName} value={unit} />
      <input type="hidden" name={countName} value={count} />

      <div className="mb-1.5 text-[11.5px] font-semibold tracking-[0.2px] text-muted uppercase">
        {label}
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.unit, p.count)}
            aria-pressed={active === p.key}
            className={cn(
              "zv-press rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              active === p.key
                ? "border-gold/40 bg-active-bg text-gold"
                : "border-line text-muted hover:text-ink",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[12.5px] text-muted">every</span>
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
          className="zv-field mono w-16 rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-center text-[13px] text-ink focus:border-gold focus:shadow-ring focus:outline-none"
        />
        <div className="flex gap-1">
          {(["day", "week", "month", "year"] as PeriodUnit[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onChange(u, count)}
              aria-pressed={unit === u}
              className={cn(
                "zv-press rounded-ctrl border px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
                unit === u
                  ? "border-gold/40 bg-active-bg text-gold"
                  : "border-line text-muted hover:text-ink",
              )}
            >
              {count === 1 ? u : `${u}s`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
