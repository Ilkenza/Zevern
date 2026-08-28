"use client";

import { useState } from "react";

import type { Forecast } from "@/lib/data/money";
import { useMoney } from "@/lib/money/currency";

/**
 * Ninety days of free money, drawn.
 *
 * The figures for this already existed — `getForecast` walks every dated bill, every
 * planned one-off and the everyday projection, and carries a running balance down the
 * list. What was missing was the picture. A column of numbers tells you the balance on
 * the 14th; a line tells you the shape of the next three months, which is the thing
 * you actually want to know before saying yes to something.
 *
 * It is a step chart, not a smooth one, because money does not glide — it sits still
 * and then a bill lands. Drawing it as a curve would imply a gradual drain that never
 * happens, and would put the balance at a value it never actually held.
 */

const W = 720;
const H = 190;
const PAD_X = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;

type Point = {
  x: number;
  y: number;
  on: string;
  balance: number;
  name: string;
  amount: number;
  kind: string;
};

function dayIndex(from: string, on: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${on}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** First day of each month inside the window — the only x-axis marks worth drawing. */
function monthTicks(from: string, days: number): { day: number; label: string }[] {
  const out: { day: number; label: string }[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  while (true) {
    const day = Math.round((cursor.getTime() - start.getTime()) / 86_400_000);
    if (day > days) break;
    out.push({ day, label: names[cursor.getUTCMonth()] });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

/**
 * `outgoingOnly` changes what the chart claims, not how it draws.
 *
 * With no income on file the same curve is still worth seeing — it is every bill,
 * deposit and day of living, laid against what is on the accounts — but it is spending
 * drawn forward, not a balance forecast. The label says which one you are looking at, so
 * the picture cannot be read as a prediction it is not entitled to make.
 */
export function ForecastCurve({
  forecast,
  days = 90,
  outgoingOnly = false,
}: {
  forecast: Forecast;
  days?: number;
  /** True when no income is on file, so the curve is spending drawn forward. */
  outgoingOnly?: boolean;
}) {
  const { fmt, fmtShort } = useMoney();
  const [hover, setHover] = useState<Point | null>(null);

  // Same lower bound the window totals needed: an unbooked rule walks from a date in
  // the past, and those points would otherwise all pile onto day zero.
  const inWindow = forecast.lines.filter((l) => {
    const day = dayIndex(forecast.from, l.on);
    return day >= 0 && day <= days;
  });
  if (inWindow.length === 0) return null;

  const balances = [forecast.startingBalance, ...inWindow.map((l) => l.balance)];
  const top = Math.max(...balances, 0);
  const bottom = Math.min(...balances, 0);
  // A flat line still needs a scale, or every point lands on the same pixel.
  const span = top - bottom || Math.max(Math.abs(top), 1);

  const x = (day: number) => PAD_X + (Math.max(0, Math.min(day, days)) / days) * (W - PAD_X * 2);
  const y = (value: number) =>
    PAD_TOP + (1 - (value - bottom) / span) * (H - PAD_TOP - PAD_BOTTOM);

  const points: Point[] = inWindow.map((l) => ({
    x: x(dayIndex(forecast.from, l.on)),
    y: y(l.balance),
    on: l.on,
    balance: l.balance,
    name: l.name,
    amount: l.amount,
    kind: l.kind,
  }));

  // The step: hold the old balance until the day the money moves, then drop.
  let d = `M${x(0).toFixed(1)},${y(forecast.startingBalance).toFixed(1)}`;
  let prevY = y(forecast.startingBalance);
  for (const p of points) {
    d += `L${p.x.toFixed(1)},${prevY.toFixed(1)}L${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    prevY = p.y;
  }
  d += `L${x(days).toFixed(1)},${prevY.toFixed(1)}`;

  const zeroY = y(0);
  const area = `${d}L${x(days).toFixed(1)},${zeroY.toFixed(1)}L${x(0).toFixed(1)},${zeroY.toFixed(1)}Z`;

  const firstNegative = points.find((p) => p.balance < 0) ?? null;
  const low = points.reduce((a, b) => (b.balance < a.balance ? b : a), points[0]);
  const ticks = monthTicks(forecast.from, days);
  const goesNegative = firstNegative !== null;

  return (
    <div className="forecast-curve">
      <div className="forecast-curve-head">
        <span className="money-page-kicker">Free money · next {days} days</span>
        <span className="forecast-curve-legend">
          {goesNegative ? (
            <span className="forecast-curve-warn">
              runs out on <span className="mono">{firstNegative.on}</span>
            </span>
          ) : (
            <span>
              lowest <span className="mono">{fmt(low.balance)}</span> on{" "}
              <span className="mono">{low.on}</span>
            </span>
          )}
        </span>
      </div>

      <div className="forecast-curve-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${
            outgoingOnly ? "What goes out over" : "Free money over"
          } the next ${days} days, starting at ${fmt(
            forecast.startingBalance,
          )}${goesNegative ? ` and running out on ${firstNegative.on}` : ""}`}
          onMouseLeave={() => setHover(null)}
        >
          <title>
            {outgoingOnly
              ? `What goes out over the next ${days} days`
              : `Free money over the next ${days} days`}
          </title>

          {/* Month boundaries — the only grid the eye needs to place a date. */}
          {ticks.map((t) => (
            <line
              key={t.day}
              x1={x(t.day)}
              x2={x(t.day)}
              y1={PAD_TOP - 6}
              y2={H - PAD_BOTTOM}
              className="forecast-tick"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} className="forecast-area" />

          {/* Zero is the only value on this chart that means something on its own. */}
          <line
            x1={x(0)}
            x2={x(days)}
            y1={zeroY}
            y2={zeroY}
            className="forecast-zero"
            vectorEffect="non-scaling-stroke"
          />

          <path
            d={d}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className={goesNegative ? "forecast-line forecast-line-warn" : "forecast-line"}
          />

          {goesNegative && (
            <path
              d={`M${firstNegative.x.toFixed(1)},${firstNegative.y.toFixed(1)}L${firstNegative.x.toFixed(1)},${firstNegative.y.toFixed(1)}`}
              strokeWidth={9}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="forecast-crossing"
            />
          )}

          {hover && (
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD_TOP - 6}
              y2={H - PAD_BOTTOM}
              className="forecast-crosshair"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/*
            One invisible band per event, wider than the mark it stands for, so a
            pointer does not have to find a two-pixel step to read a value.
          */}
          {points.map((p, i) => {
            const prev = i === 0 ? x(0) : points[i - 1].x;
            const next = i === points.length - 1 ? x(days) : points[i + 1].x;
            return (
              <rect
                key={`${p.on}-${p.name}-${i}`}
                x={(prev + p.x) / 2}
                width={Math.max((next - prev) / 2, 3)}
                y={0}
                height={H}
                className="forecast-hit"
                onMouseEnter={() => setHover(p)}
              />
            );
          })}
        </svg>

        {/* The tooltip lives in HTML rather than SVG so its text is never stretched. */}
        {hover && (
          <div
            className="forecast-tip"
            style={{
              left: `${(hover.x / W) * 100}%`,
              transform: hover.x > W * 0.65 ? "translateX(-100%)" : undefined,
            }}
          >
            <span className="mono forecast-tip-date">{hover.on}</span>
            <span className="forecast-tip-name">{hover.name}</span>
            <span
              className={`mono forecast-tip-balance ${hover.balance < 0 ? "text-danger" : ""}`}
            >
              {fmt(hover.balance)} left
            </span>
          </div>
        )}

        <div className="forecast-axis">
          {ticks.map((t) => (
            <span key={t.day} style={{ left: `${(x(t.day) / W) * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="forecast-curve-foot">
        <span>
          starts at <b className="mono">{fmt(forecast.startingBalance)}</b> free
        </span>
        <span className="forecast-curve-scale mono">
          {fmtShort(top)} → {fmtShort(bottom)}
        </span>
      </div>
    </div>
  );
}
