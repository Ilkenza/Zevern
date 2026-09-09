"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight, HandCoins, Pencil } from "lucide-react";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { deleteLoan } from "@/app/(app)/private/actions";
import { useDefaultCurrency, useMoney } from "@/lib/money/currency";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { LoanLine } from "@/lib/types";
import { GOAL_ACCENT } from "./reading";
import { DebtHistory } from "../debts/DebtHistory";

/**
 * A debt, wearing the card the goals wear.
 *
 * Paying off a credit and filling a goal are the same errand, and this screen used to
 * put them in two different shapes — cards above, a stripe of rows below — which read as
 * two kinds of thing rather than one kind in two places. It is one section now, and one
 * card.
 *
 * What it is *not* is a `GoalLine` in disguise. Handing `GoalCard` a debt shaped like a
 * goal would have been half the code, and every control on it would then have pointed at
 * the wrong row: the pencil at a goal that does not exist, the bin at `deleteGoal` with a
 * debt's id, the footer at a form that writes `goal_id`. So the design is shared — every
 * class here is the goal card's own — and the behaviour is the debt's.
 *
 * The figures need no adapting, which is the argument for keeping debts in
 * `money_loans` rather than copying them into a goal: `total_rsd` is the target,
 * `outstanding` is what is left, `settled` is progress, and all three are worked out
 * from the ledger every time they are read.
 */
export function DebtCard({ debt }: { debt: LoanLine }) {
  const { fmt, fmtExact } = useMoney();
  const code = useDefaultCurrency();
  const total = Math.max(Number(debt.total_rsd) || 0, 0);
  /*
    A debt says the currency it was agreed in, and converts underneath only when that is
    not the currency this screen counts.

    A credit agreed at €5.000 is a fact about euros and stays one; the dinar figure is
    what that means for every other number on this card — what is left, what an instalment
    clears. When the two are the same there is nothing to convert, and `5.000 RSD ≈ 5.000
    RSD` is a line that only makes a card longer. Same reading as `GoalCard`, on purpose:
    the two sit in one grid now.
  */
  const agreed = Number(debt.total_amount) || 0;
  const foreign = agreed > 0 && debt.currency !== code;
  const share = total > 0 ? Math.min(debt.settled / total, 1) : 0;
  // Rounded down and held at 99 until it is actually clear, the same way a goal one
  // dinar short is never allowed to claim it arrived.
  const pct = total > 0 ? (debt.outstanding === 0 ? 100 : Math.min(Math.floor(share * 100), 99)) : null;

  return (
    <article
      className="money-card-premium goal-card-premium relative flex flex-col overflow-hidden rounded-card border border-line bg-surface"
      style={{ "--goal-accent": GOAL_ACCENT } as CSSProperties}
    >
      <span aria-hidden="true" className="goal-accent-rail absolute inset-y-0 left-0 w-1" />
      {/* The debts screen's own mark, in the corner the goal watermark uses. */}
      <HandCoins className="goal-card-mark" aria-hidden="true" strokeWidth={1.1} />

      <div className="flex flex-1 flex-col py-3.5 pr-4 pl-5">
        <div className="flex items-start gap-2">
          <h3 className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] font-bold text-ink">
            <span className="truncate">{debt.name}</span>
          </h3>
          <div className="goal-card-controls -mt-1 -mr-1 flex shrink-0 items-center gap-1">
            <Link
              href={`/private/debts?edit=${debt.id}`}
              aria-label={`Edit ${debt.name}`}
              title={`Edit ${debt.name}`}
              className="zv-rowctrl"
            >
              <Pencil className="h-3.75 w-3.75" />
            </Link>
            {/*
              Same wording as the bin on the Debts screen, because it does the same
              thing: `loan_id` is `on delete set null`, so what goes is the fact that
              those payments belonged together, never the payments.
            */}
            <DeleteButton
              compact
              label={`Delete ${debt.name}`}
              confirmText="Forget this debt? The entries against it stay in the ledger — they just stop belonging to anything."
              action={deleteLoan.bind(null, debt.id)}
            />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
          <span>
            <small className="goal-saved-label">Paid</small>
            {/* Nothing paid is not `0 RSD' in 24px bold — that claims a measurement. */}
            <b className="mono goal-saved-value block text-[24px] font-semibold tracking-[-0.7px] text-ink">
              {debt.settled === 0 ? <span className="text-faint">—</span> : fmt(debt.settled)}
            </b>
          </span>
        </div>

        {total > 0 && (
          <dl className="goal-card-metrics">
            <div>
              <dt>Target</dt>
              <dd className="mono">
                {foreign ? (
                  <>
                    {formatAmount(agreed, debt.currency)}
                    <span className="goal-card-metric-note"> ≈ {fmt(total)}</span>
                  </>
                ) : (
                  fmt(total)
                )}
              </dd>
            </div>
            <div>
              <dt>Left to pay</dt>
              <dd className="mono">{fmt(debt.outstanding)}</dd>
            </div>
          </dl>
        )}

        {pct !== null && (
          <div className="mt-2.5 flex items-center gap-2.5">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={`${debt.name} progress`}
              className="goal-progress-track h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-white/6"
            >
              {[25, 50, 75].map((mark) => (
                <span
                  key={mark}
                  aria-hidden="true"
                  className={cn("goal-milestone", pct >= mark && "is-passed")}
                  style={{ left: `${mark}%` }}
                />
              ))}
              <div
                className="money-progress-fill h-full rounded-pill transition-[width] duration-700 motion-reduce:transition-none"
                style={{
                  width: `${debt.settled > 0 ? Math.max(share * 100, 2) : 0}%`,
                  background: GOAL_ACCENT,
                }}
              />
            </div>
            <span className="mono w-9 shrink-0 text-right text-[11.5px] font-semibold text-muted">
              {pct}%
            </span>
          </div>
        )}

        {/*
          One line, like every other card on this screen — the plan, or the offer of one.

          A debt with no schedule is not a card missing something. 5.000 borrowed from a
          friend is paid back whenever, and printing a plan there would be the app
          inventing an arrangement nobody made. The line says the true thing either way.

          The count comes from what is owed rather than from the rule's counter, so a
          month where more went out than the rate shortens it here the moment the entry
          is written — see `instalmentsLeft`.

          The instalment is the one figure on this card printed to the para. Everywhere
          else whole dinars are the kinder reading, but this number is copied off a
          contract and multiplied by the count beside it: `30.776 × 4' comes to 123.104
          and reads as the bank being 1,92 out, when what is actually out is the rounding
          in this line. A figure a reader will check against a piece of paper is shown
          the way the paper shows it.
        */}
        <p className="goal-card-line">
          {debt.instalment != null && debt.instalmentsLeft != null ? (
            <span className="min-w-0 truncate">
              <span className="mono">{fmtExact(debt.instalment)}</span> ×{" "}
              {debt.instalmentsLeft} left · every month
            </span>
          ) : (
            <span className="min-w-0 truncate text-faint">Paid back whenever — no schedule.</span>
          )}
        </p>
      </div>

      {/*
        Above the footer, where `GoalCard` puts the goal's own — so a debt and a goal
        standing side by side in the same grid fold open the same way.
      */}
      <DebtHistory debt={debt} />

      <Link
        href={
          debt.ruleId
            ? `/private/upcoming?edit=${debt.ruleId}`
            : `/private/upcoming?new=1&loan=${debt.id}`
        }
        className="goal-card-toggle"
      >
        <span>{debt.ruleId ? "Change repayment" : "Set up repayment"}</span>
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </article>
  );
}
