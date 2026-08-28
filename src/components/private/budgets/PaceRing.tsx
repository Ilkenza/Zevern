import { STATUS_TONE, type Status } from "./status";

/**
 * The month as one figure.
 *
 * A bar says how much has gone. A bar with a tick on it says whether that is too much
 * *yet* — which is the only question this screen exists to answer, and the reason the
 * pace marker is drawn on the ring rather than beside it. Where the marker sits is
 * where the month is; where the arc ends is where the money is. The gap between them
 * is the whole read-out, and it takes no reading.
 *
 * Drawn rather than filled with a library: it is one circle, one arc and one tick, and
 * every pixel of it is decided by two numbers.
 */

const SIZE = 168;
const STROKE = 11;
const R = (SIZE - STROKE) / 2;

/** A point on the ring, at `fraction` of the way round from twelve o'clock. */
function pointAt(fraction: number, radius: number) {
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return {
    x: SIZE / 2 + Math.cos(angle) * radius,
    y: SIZE / 2 + Math.sin(angle) * radius,
  };
}

export function PaceRing({
  used,
  pacePct,
  status,
  showPace,
  caption,
}: {
  /** Percent of the limit spent. May exceed 100 — the arc caps, the figure does not. */
  used: number;
  pacePct: number;
  status: Status;
  /** A finished month has no pace left to be measured against. */
  showPace: boolean;
  caption: string;
}) {
  const tone = STATUS_TONE[status];
  const filled = Math.min(Math.max(used, 0), 100) / 100;
  const paceFraction = Math.min(Math.max(pacePct, 0), 100) / 100;

  const tickInner = pointAt(paceFraction, R - STROKE / 2 - 3);
  const tickOuter = pointAt(paceFraction, R + STROKE / 2 + 3);

  return (
    <div className="budget-ring" style={{ "--ring-tone": tone } as React.CSSProperties}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={
          showPace
            ? `${used}% of the budget used. The pace marker is at ${pacePct}%.`
            : `${used}% of the budget used.`
        }
      >
        {/* The ground the arc is read against. */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={STROKE}
        />

        {/*
          The arc. `pathLength` normalises the geometry to 100 so the dash figures are
          the percentage itself — no circumference arithmetic to get wrong, and none to
          re-do if the size ever changes.
        */}
        <circle
          className="budget-ring-arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={tone}
          strokeWidth={STROKE}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          style={{ "--ring-gap": String(100 - filled * 100) } as React.CSSProperties}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />

        {/*
          The month marker. Drawn last so it sits over the arc — once spending passes
          the pace, the tick has to stay visible on top of the very thing it is being
          compared with.
        */}
        {showPace && (
          <line
            className="budget-ring-tick"
            x1={tickInner.x}
            y1={tickInner.y}
            x2={tickOuter.x}
            y2={tickOuter.y}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}
      </svg>

      <div className="budget-ring-centre">
        <span className="mono budget-ring-figure">{used}%</span>
        <span className="budget-ring-caption">{caption}</span>
      </div>
    </div>
  );
}
