"use client";

import { Wand2 } from "lucide-react";

import { MoneyField } from "@/components/ui/MoneyField";
import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import { CAT_TONE } from "@/lib/money/tone";
import type { BudgetLine } from "@/lib/types";
import { STATUS_LABEL, STATUS_TONE, clean, shouldSuggest, statusOf } from "./status";
import { fromRsd } from "@/lib/money/display";

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
  value,
  onChange,
  style,
}: {
  line: BudgetLine;
  pace: number;
  value: string;
  onChange: (next: string) => void;
  /** The caller's rung on the entrance ladder. Merged with the colours below. */
  style?: React.CSSProperties;
}) {
  const { fmt, code, display } = useMoney();
  const status = statusOf(line, pace);
  const tone = STATUS_TONE[status];
  const used = line.limit > 0 ? Math.min(line.spent / line.limit, 1) : 0;
  const left = line.limit - line.spent;
  // `typical` is a dinar figure and `value` is typed in the reader's currency, so the
  // two are compared in the same one before either is believed.
  const typicalHere = Math.round(fromRsd(line.typical, display));
  const suggest = shouldSuggest(typicalHere, value);

  return (
    <article
      className={cn("budget-card", `budget-is-${status}`)}
      style={
        {
          ...style,
          // One tone for every card. See `@/lib/money/tone` for why categories
          // stopped carrying a colour of their own.
          "--cat-tone": CAT_TONE,
          "--status-tone": tone,
        } as React.CSSProperties
      }
    >
      {/* The rail is rhythm, not identity — the card's heading is the identity. */}
      <span aria-hidden="true" className="budget-card-rail" />

      <div className="budget-card-top">
        <span className="budget-card-id">
          <span aria-hidden="true" className="budget-card-dot" />
          <span className="budget-card-name">{line.category.name}</span>
          <span className="budget-card-status">{STATUS_LABEL[status]}</span>
        </span>

        <span className="budget-card-money">
          <span className="mono budget-card-spent">{fmt(line.spent)}</span>
          <span className="budget-card-of">of</span>
          <span className="budget-card-field">
            <MoneyField
              className="contents"
              name={`limit_${line.category.id}`}
              value={value}
              onValueChange={(next) => onChange(clean(next))}
              placeholder="no limit"
              aria-label={`Monthly limit for ${line.category.name}`}
              inputClassName="mono budget-card-input"
            />
            <span aria-hidden="true" className="budget-card-unit">
              {code}
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
          </div>
          <span className={cn("mono budget-card-left", left < 0 && "is-over", left === 0 && "is-reached")}>
            {left < 0 ? `${fmt(-left)} over` : left === 0 ? "Limit reached" : `${fmt(left)} left`}
          </span>
        </div>
      ) : (
        <div className="budget-card-bottom">
          <p className="budget-card-nolimit">
            {line.spent > 0
              ? `${fmt(line.spent)} spent this month · No monthly limit`
              : "Nothing spent this month · No monthly limit"}
          </p>
        </div>
      )}

      {/*
        A blank field is a decision nobody has the numbers for. This one does: it is
        the median of what the last six months actually cost.
      */}
      {suggest && (
        <button type="button" className="budget-suggest" onClick={() => onChange(String(typicalHere))}>
          <Wand2 className="h-3 w-3" aria-hidden />
          A normal month is {fmt(line.typical)}
          <span className="budget-suggest-cta">use it</span>
        </button>
      )}
    </article>
  );
}
