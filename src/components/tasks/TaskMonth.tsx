"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Monday first. A week that starts on Sunday is not the week anybody here plans in. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * The whole month at once, which is the one thing the rail cannot show.
 *
 * The rail is seven days and three buckets, and it is the right shape for the question
 * people ask most — what is today, what is tomorrow. It is the wrong shape for the other
 * one: *when* is the thing I am thinking of, and what does the week after next look like.
 * Those need a month, and a month needs a grid; nothing else lets you find the empty
 * Thursday three weeks out without reading every row between here and there.
 *
 * The two are the same list read two ways, so they share everything below them: picking a
 * day here selects it exactly as a chip in the rail would, and the panel underneath, the
 * quick add and the review all carry on without knowing which control chose the day.
 */
export function TaskMonth({
  month,
  onMonth,
  today,
  counts,
  late,
  selected,
  onPick,
}: {
  /** `YYYY-MM`, the month on screen. */
  month: string;
  onMonth: (next: string) => void;
  today: string;
  /** Day → how many open tasks land on it. */
  counts: Map<string, number>;
  /** The days that are already past and still hold something. */
  late: Set<string>;
  selected: string | null;
  onPick: (day: string) => void;
}) {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;

  const first = new Date(Date.UTC(year, m, 1));
  const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
  // getUTCDay is Sunday-based; shift it so Monday is column one.
  const lead = (first.getUTCDay() + 6) % 7;

  const shift = (by: number) => {
    const d = new Date(Date.UTC(year, m + by, 1));
    onMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const name = first.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => iso(year, m, i + 1)),
  ];
  // Fill the last week out, so the grid is a rectangle rather than a staircase.
  while (cells.length % 7 !== 0) cells.push(null);

  const thisMonth = today.slice(0, 7);

  return (
    <section className="task-month">
      <header className="task-month-head">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="task-month-arrow"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="task-month-name">{name}</span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="task-month-arrow"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {month !== thisMonth && (
          <button type="button" onClick={() => onMonth(thisMonth)} className="task-month-back">
            This month
          </button>
        )}
      </header>

      <div className="task-month-grid" role="grid" aria-label={`Tasks in ${name}`}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="task-month-weekday" aria-hidden>
            {w}
          </span>
        ))}

        {cells.map((day, i) => {
          if (!day) return <span key={`pad-${i}`} className="task-month-pad" aria-hidden />;
          const count = counts.get(day) ?? 0;
          const overdue = late.has(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPick(day)}
              aria-pressed={selected === day}
              className={cn(
                "task-month-day",
                day === today && "is-today",
                selected === day && "is-on",
                overdue && "is-late",
                count === 0 && "is-empty",
              )}
            >
              <span className="task-month-num">{Number(day.slice(8))}</span>
              {/*
                The count, not a dot. A dot says "something is here" and a person then has
                to click to find out whether it is one thing or nine — which is the click
                the calendar exists to save.
              */}
              {count > 0 && <span className="mono task-month-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
