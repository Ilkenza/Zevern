/**
 * A single-series sparkline for a KPI tile.
 *
 * One series, so no legend and no axis: the tile's label names the measure and the
 * big figure above already labels the final point. Everything else stays recessive —
 * a 2px line, a whisper of fill, and one dot on the value you are standing in.
 *
 * Two details are load-bearing. The box is stretched to whatever width the tile
 * gives it, so every stroke carries `vector-effect="non-scaling-stroke"` — without it
 * the line thins on a wide card and thickens on a narrow one. And the end dot is a
 * zero-length round-capped path rather than a `<circle>`, because a circle in a
 * stretched viewBox comes out an ellipse.
 */

const W = 120;
const H = 32;
const PAD = 3; // keeps the stroke and the end dot inside the box

export function Sparkline({
  values,
  label,
}: {
  values: number[];
  /** Read out to screen readers in place of the drawing. */
  label: string;
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min;

  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (values.length - 1);
  // A series that never moves sits on the baseline rather than dividing by zero.
  const y = (v: number) =>
    span === 0 ? H - PAD : H - PAD - ((v - min) / span) * (H - PAD * 2);

  const points = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
  const line = `M${points.join("L")}`;
  const area = `${line}L${x(values.length - 1).toFixed(2)},${H}L${x(0).toFixed(2)},${H}Z`;

  const last = points[points.length - 1];
  const dot = `M${last}L${last}`;

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      focusable="false"
    >
      <title>{label}</title>
      <path d={area} className="spark-area" />
      <path
        d={line}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="spark-line"
      />
      {/* Ring first, in the tile's own surface, so the dot stays legible over the fill. */}
      <path d={dot} strokeWidth={7} strokeLinecap="round" vectorEffect="non-scaling-stroke" className="spark-dot-ring" />
      <path d={dot} strokeWidth={4.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" className="spark-dot" />
    </svg>
  );
}
