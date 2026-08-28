"use client";

import type { Forecast } from "@/lib/data/money";
import { useMoney } from "@/lib/money/currency";

/**
 * The next three months as a runway instead of a stock chart.
 *
 * The useful answer — how many days are covered — leads. Everything else is reduced
 * to today's free money and the amount left at the end. The detailed arithmetic is
 * already shown below this card and repeating it here only creates work for the eye.
 */

function dayIndex(from: string, on: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${on}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function shortDate(on: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${on}T00:00:00Z`));
}

export function ForecastOutlook({
  forecast,
  days = 90,
  outgoingOnly = false,
}: {
  forecast: Forecast;
  days?: number;
  /** True when no income is on file, so this is spending runway rather than a forecast. */
  outgoingOnly?: boolean;
}) {
  const { fmt } = useMoney();

  const windows = forecast.windows
    .filter((window) => window.days <= days)
    .sort((a, b) => a.days - b.days);
  const horizon = windows[windows.length - 1];
  if (!horizon) return null;

  const inWindow = forecast.lines.filter((line) => {
    const day = dayIndex(forecast.from, line.on);
    return day >= 0 && day <= days;
  });
  const firstNegative = inWindow.find((line) => line.balance < 0) ?? null;
  const coveredDays = firstNegative
    ? Math.max(0, Math.min(dayIndex(forecast.from, firstNegative.on), days))
    : days;
  const coverage = (coveredDays / days) * 100;
  const endingBalance = forecast.startingBalance + horizon.net;
  return (
    <section className={`forecast-outlook${firstNegative ? " forecast-outlook-risk" : ""}`}>
      <header className="forecast-outlook-head">
        <span className="money-page-kicker">
          {days}-day money check
        </span>
        <span className={`forecast-outlook-state${firstNegative ? " is-risk" : ""}`}>
          {firstNegative
            ? `Money runs short ${shortDate(firstNegative.on)}`
            : `All ${days} days are covered`}
        </span>
      </header>

      <div className="forecast-outlook-hero">
        <div>
          <div className="forecast-outlook-runway-value">
            <strong className="mono">{coveredDays}</strong>
            <span>of {days} days covered</span>
          </div>
          <p>
            {outgoingOnly
              ? "Based on the costs you added. Income is not included yet."
              : firstNegative
                ? "Your scheduled costs become higher than your available money."
                : "Your available money covers the full period."}
          </p>
        </div>
      </div>

      <div
        className="forecast-runway-track"
        role="img"
        aria-label={`${coveredDays} of the next ${days} days are covered${
          firstNegative ? `; the projected shortfall begins ${shortDate(firstNegative.on)}` : ""
        }`}
      >
        <span className="forecast-runway-safe" style={{ width: `${coverage}%` }} />
        {firstNegative && (
          <>
            <span className="forecast-runway-risk" style={{ left: `${coverage}%` }} />
            <span className="forecast-runway-crossing" style={{ left: `${coverage}%` }} />
          </>
        )}
      </div>

      <div className="forecast-balance-change">
        <div>
          <span>Free today</span>
          <strong className="mono">{fmt(forecast.startingBalance)}</strong>
        </div>
        <span className="forecast-balance-arrow" aria-hidden>→</span>
        <div>
          <span>Free after {days} days</span>
          <strong className={`mono${endingBalance < 0 ? " is-risk" : ""}`}>
            {fmt(endingBalance)}
          </strong>
        </div>
      </div>
    </section>
  );
}
