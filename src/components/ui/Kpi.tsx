import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Sparkline } from "@/components/ui/Sparkline";

/**
 * A figure without a direction is trivia. `delta` is what turns "€4,200" into
 * "€4,200, and that is a third more than last month" — so the caller has to say
 * which way is up for its own measure: revenue rising is good news, outstanding
 * rising is not.
 */
export type KpiDelta = {
  /** Signed percent change. `null` when there is nothing comparable to measure against. */
  pct: number | null;
  /** What the comparison is against — "vs last month". */
  label: string;
  /** Whether a rise is a good thing for this particular measure. */
  riseIsGood: boolean;
};

function Delta({ delta }: { delta: KpiDelta }) {
  if (delta.pct === null) {
    return <span className="kpi-delta kpi-delta-none">{delta.label}</span>;
  }

  const flat = Math.abs(delta.pct) < 1;
  const up = delta.pct > 0;
  const tone = flat ? "flat" : up === delta.riseIsGood ? "good" : "bad";
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  // The arrow and the word carry the meaning; the colour only reinforces it.
  return (
    <span className={`kpi-delta kpi-delta-${tone}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="mono">
        {flat ? "flat" : `${up ? "+" : "−"}${Math.abs(Math.round(delta.pct))}%`}
      </span>
      <span className="kpi-delta-label">{delta.label}</span>
    </span>
  );
}

export function Kpi({
  label,
  value,
  hint,
  delta,
  spark,
  sparkLabel,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  delta?: KpiDelta;
  /** A short series ending on the figure shown above. Drawn only if it moves. */
  spark?: number[];
  sparkLabel?: string;
}) {
  // A flat line of zeros says nothing and still costs a row of height.
  const showSpark = !!spark && spark.length > 1 && spark.some((v) => v !== 0);

  return (
    <div className="overview-kpi rounded-card border border-line bg-surface p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="mono mt-2 text-[24px] font-semibold tracking-[-0.5px] text-ink">
        {value}
      </div>

      {hint && (
        <div className="mt-1.25 text-[11.5px] font-semibold text-muted">{hint}</div>
      )}

      {delta && <Delta delta={delta} />}

      {showSpark && (
        <div className="kpi-spark">
          <Sparkline values={spark!} label={sparkLabel ?? `${label} over recent months`} />
        </div>
      )}
    </div>
  );
}
