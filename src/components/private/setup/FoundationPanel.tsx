"use client";

import { Check } from "lucide-react";

import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import type { Foundation } from "./foundation";
import { useActiveSection } from "./useActiveSection";

/**
 * The state of the model, and the index of the page — one thing, because they answer
 * the same question from two directions: what is here, and where is it.
 *
 * On a wide screen it stays put while the sections scroll past, and the step you are
 * currently reading lights up. That is the ordinary settings-page pattern, and it is
 * here for the ordinary reason: this page is long, five sections deep, and visited
 * rarely enough that you arrive not remembering what is on it.
 */
export function FoundationPanel({
  foundation,
  onHand,
  accounts,
}: {
  foundation: Foundation;
  onHand: number;
  accounts: number;
}) {
  const { fmt } = useMoney();
  const active = useActiveSection(foundation.steps.map((s) => s.id));
  const { done, total, ready, steps } = foundation;

  return (
    <aside className="setup-foundation">
      <div className="setup-foundation-head">
        <span className="money-page-kicker">Foundation</span>
        <p className="setup-foundation-figure">
          {ready ? (
            <>Ready</>
          ) : (
            <>
              <b className="mono">{done}</b> of {total}
            </>
          )}
        </p>
        <p className="setup-foundation-note">
          {ready
            ? "Everything the rest of the app needs is in place."
            : "The rest of the app cannot work without these."}
        </p>
      </div>

      {/* One segment per required step — discrete, because these are done or not. */}
      <div
        className="setup-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Required setup steps completed"
      >
        {steps
          .filter((s) => s.required)
          .map((s) => (
            <span key={s.key} className={cn("setup-progress-seg", s.done && "is-done")} />
          ))}
      </div>

      <nav className="setup-steps" aria-label="Sections">
        {steps.map((step) => (
          <a
            key={step.key}
            href={`#${step.id}`}
            aria-current={active === step.id ? "true" : undefined}
            className={cn(
              "setup-step",
              step.done && "is-done",
              !step.required && "is-optional",
            )}
          >
            <span className="setup-step-mark" aria-hidden="true">
              {step.done ? <Check className="h-3 w-3" /> : <i />}
            </span>
            <span className="setup-step-body">
              <span className="setup-step-label">
                {step.label}
                {!step.required && <em>optional</em>}
              </span>
              {/* What is missing, only while it is missing. */}
              {!step.done && <span className="setup-step-todo">{step.todo}</span>}
            </span>
            {step.count != null && step.count > 0 && (
              <span className="mono setup-step-count">{step.count}</span>
            )}
          </a>
        ))}
      </nav>

      {accounts > 0 && (
        <div className="setup-foundation-total">
          <span>Total balance</span>
          <span className="mono">{fmt(onHand)}</span>
        </div>
      )}
    </aside>
  );
}
