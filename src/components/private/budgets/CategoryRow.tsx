"use client";

import { Wand2 } from "lucide-react";
import { formatRsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BudgetLine } from "@/lib/types";
import { STATUS_LABEL, STATUS_TONE, clean, shouldSuggest, statusOf } from "./status";

/**
 * One category, laid out on two lines rather than one.
 *
 * It used to be a single row: dot, name, status, spent, "of", input, then a bar and a
 * figure squeezed after it. Everything competed for the same horizontal space, so the
 * bar — the only part that answers the question at a glance — was the narrowest thing
 * on the line and the first thing to disappear on a phone.
 *
 * Now the identity and the money sit on top and the bar owns the width underneath it.
 * The limit stays an input rather than becoming a button that opens one: this screen
 * is a form, and a form you can type straight into is worth more than a tidier row.
 */
export function CategoryRow({
  line,
  pace,
  pacePct,
  showPace,
  value,
  onChange,
  style,
}: {
  line: BudgetLine;
  pace: number;
  pacePct: number;
  showPace: boolean;
  value: string;
  onChange: (next: string) => void;
  /** The caller's rung on the entrance ladder. Merged with the colours below. */
  style?: React.CSSProperties;
}) {
  const status = statusOf(line, pace);
  const tone = STATUS_TONE[status];
  const used = line.limit > 0 ? Math.min(line.spent / line.limit, 1) : 0;
  const left = line.limit - line.spent;
  const suggest = shouldSuggest(line.typical, value);

  return (
    <article
      className={cn("budget-card", `budget-is-${status}`)}
      style={
        {
          ...style,
          "--cat-tone": line.category.color ?? "var(--color-faint)",
          "--status-tone": tone,
        } as React.CSSProperties
      }
    >
      {/* The category's own colour, down the whole edge — its identity in the list. */}
      <span aria-hidden="true" className="budget-card-rail" />

      <div className="budget-card-top">
        <span className="budget-card-id">
          <span aria-hidden="true" className="budget-card-dot" />
          <span className="budget-card-name">{line.category.name}</span>
          <span className="budget-card-status">{STATUS_LABEL[status]}</span>
        </span>

        <span className="budget-card-money">
          <span className="mono budget-card-spent">{formatRsd(line.spent)}</span>
          <span className="budget-card-of">of</span>
          <span className="budget-card-field">
            <input
              name={`limit_${line.category.id}`}
              value={value}
              onChange={(e) => onChange(clean(e.target.value))}
              inputMode="numeric"
              placeholder="no limit"
              aria-label={`Monthly limit for ${line.category.name}`}
              className="mono budget-card-input"
            />
            <span aria-hidden="true" className="budget-card-unit">
              RSD
            </span>
          </span>
        </span>
      </div>

      {line.limit > 0 ? (
        <div className="budget-card-bottom">
          <div className="budget-bar">
            <span
              className="budget-bar-fill"
              style={{ width: `${used * 100}%` }}
              aria-hidden="true"
            />
            {showPace && (
              <span
                className="budget-bar-pace"
                style={{ left: `${Math.min(pacePct, 100)}%` }}
                aria-hidden="true"
              />
            )}
          </div>
          <span className={cn("mono budget-card-left", left < 0 && "is-over")}>
            {left < 0 ? `${formatRsd(-left)} over` : `${formatRsd(left)} left`}
          </span>
        </div>
      ) : (
        <div className="budget-card-bottom">
          <p className="budget-card-nolimit">
            {line.spent > 0
              ? "Nothing is watching this one — spending here is invisible to the figures above."
              : "No limit, and nothing spent this month."}
          </p>
        </div>
      )}

      {/*
        A blank field is a decision nobody has the numbers for. This one does: it is
        the median of what the last six months actually cost.
      */}
      {suggest && (
        <button type="button" className="budget-suggest" onClick={() => onChange(String(line.typical))}>
          <Wand2 className="h-3 w-3" aria-hidden />
          A normal month is {formatRsd(line.typical)}
          <span className="budget-suggest-cta">use it</span>
        </button>
      )}
    </article>
  );
}
