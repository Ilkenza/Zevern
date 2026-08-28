"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, HandCoins, RotateCcw } from "lucide-react";
import { settleLoan } from "@/app/(app)/private/actions";
import { Panel } from "@/components/ui/Panel";
import { buttonClasses } from "@/components/ui/Button";
import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import type { LoanLine } from "@/lib/types";

/**
 * What is owed, both ways.
 *
 * The header keeps the two totals apart instead of netting them off. They are not the
 * same money — being owed 10.000 by a friend does not pay a 450.000 credit — and one
 * figure showing −440.000 would describe a situation nobody is in.
 *
 * The panel is absent rather than empty when nothing is outstanding. A debts list with
 * nothing in it is a good month, not a screen that needs furnishing, and the Money page
 * already carries four panels before this one.
 */
export function LoansPanel({ loans }: { loans: LoanLine[] }) {
  const { fmt } = useMoney();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const open = loans.filter((l) => l.settled_on == null);
  if (open.length === 0) return null;

  const owedToYou = open
    .filter((l) => l.direction === "lent")
    .reduce((s, l) => s + l.outstanding, 0);
  const youOwe = open
    .filter((l) => l.direction === "borrowed")
    .reduce((s, l) => s + l.outstanding, 0);

  const settle = (id: string, done: boolean) =>
    startTransition(async () => {
      const result = await settleLoan(id, done);
      if (result?.error) setError(result.error);
      else {
        setError(null);
        router.refresh();
      }
    });

  return (
    <Panel className="money-summary-panel loans-panel">
      <div className="loans-head">
        <h2 className="loans-title">
          <HandCoins className="h-4 w-4 text-gold" aria-hidden />
          Loans &amp; debts
        </h2>
        <span className="loans-totals">
          {owedToYou > 0 && <b className="text-ok">{fmt(owedToYou)} owed to you</b>}
          {owedToYou > 0 && youOwe > 0 && <i aria-hidden>·</i>}
          {youOwe > 0 && <b className="text-gold-hi">{fmt(youOwe)} you owe</b>}
        </span>
      </div>

      {open.map((loan) => {
        const paid = loan.settled;
        const total = Number(loan.total_rsd) || 0;
        // A friend's tenner has nothing to draw — it is owed in full until it is not.
        // A credit being chipped away at every month is the whole reason for the bar.
        const share = total > 0 ? Math.min(paid / total, 1) : 0;
        const lent = loan.direction === "lent";

        return (
          <div key={loan.id} className="loan-row">
            <div className="loan-row-top">
              <span className="loan-row-id">
                <span className="loan-row-name">{loan.name}</span>
                <span className="loan-row-sub">
                  {lent ? "Owed to you" : "You owe"}
                  {loan.instalment && loan.instalmentsLeft != null ? (
                    <>
                      {" · "}
                      {fmt(loan.instalment)} × {loan.instalmentsLeft} left
                    </>
                  ) : (
                    <>
                      {" · since "}
                      <span className="mono">{loan.opened_on}</span>
                    </>
                  )}
                </span>
              </span>
              <span className={cn("mono loan-row-amount", lent ? "text-ok" : "text-gold-hi")}>
                {fmt(loan.outstanding)}
              </span>
            </div>

            {paid > 0 && (
              <div className="loan-bar">
                <span
                  className="loan-bar-fill"
                  style={{ width: `${share * 100}%` }}
                  aria-hidden="true"
                />
              </div>
            )}

            <div className="loan-row-foot">
              <span className="min-w-0 truncate">
                {paid > 0 ? `${fmt(paid)} of ${fmt(total)} settled` : ""}
              </span>
              <button
                type="button"
                onClick={() => settle(loan.id, true)}
                disabled={pending}
                className={buttonClasses("secondary", "shrink-0 px-2.5 py-1 text-[11.5px] disabled:opacity-50")}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                {lent ? "Collected" : "Settled"}
              </button>
            </div>
          </div>
        );
      })}

      {/*
        Closed debts stay reachable rather than vanishing. Someone marks one settled by
        mistake on the day the last instalment posts, and a list you cannot get back
        into is a list people stop clicking anything in.
      */}
      {loans.some((l) => l.settled_on != null) && (
        <details className="loans-closed">
          <summary>{loans.filter((l) => l.settled_on != null).length} settled</summary>
          {loans
            .filter((l) => l.settled_on != null)
            .map((loan) => (
              <div key={loan.id} className="loan-closed-row">
                <span className="min-w-0 flex-1 truncate">{loan.name}</span>
                <span className="mono text-faint">{loan.settled_on}</span>
                <button
                  type="button"
                  onClick={() => settle(loan.id, false)}
                  disabled={pending}
                  aria-label={`Reopen ${loan.name}`}
                  title="Put it back on the list"
                  className="zv-rowctrl zv-rowctrl-sm"
                >
                  <RotateCcw className="h-3.25 w-3.25" />
                </button>
              </div>
            ))}
        </details>
      )}

      {error && <p className="px-4 pb-3 text-[11px] text-danger">{error}</p>}
    </Panel>
  );
}
