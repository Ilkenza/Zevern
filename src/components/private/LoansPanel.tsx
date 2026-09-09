"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, HandCoins, Plus, RotateCcw } from "lucide-react";
import { settleLoan } from "@/app/(app)/private/actions";
import { Panel } from "@/components/ui/Panel";
import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import type { LoanLine } from "@/lib/types";

/*
  How many debts the panel draws before it offers the rest.

  It drew every one of them, and a list with no end is a panel that pushes everything
  under it — the settled list, and whatever the page puts below — off the bottom of the
  screen for good. Six is a screenful: enough that the panel is a list rather than a
  teaser, few enough that the page still has a shape.
*/
const LOANS_DRAWN = 6;

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
  const { fmt, fmtExact } = useMoney();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(LOANS_DRAWN);

  /*
    Biggest first. Once the list is cut, which end it is cut from is a decision: in the
    order they were opened, a three-million debt can sit below the fold under four
    thousand-dinar ones, and the panel would be hiding exactly the figure it exists to
    show.
  */
  const open = loans
    .filter((l) => l.settled_on == null)
    .sort((a, b) => b.outstanding - a.outstanding);
  if (open.length === 0) return null;

  const shown = open.slice(0, drawn);
  const rest = open.length - shown.length;

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
          {/*
            The way to the whole list. This panel is a summary — six of them, biggest
            first — and a summary that cannot be opened is a dead end on the one screen
            where the next question is always "which ones".
          */}
          <Link href="/private/debts" className="loans-open">
            Manage <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </span>
      </div>

      {shown.map((loan) => {
        const paid = loan.settled;
        const total = Number(loan.total_rsd) || 0;
        // A friend's tenner has nothing to draw — it is owed in full until it is not.
        // A credit being chipped away at every month is the whole reason for the bar.
        const share = total > 0 ? Math.min(paid / total, 1) : 0;
        const lent = loan.direction === "lent";

        return (
          <div key={loan.id} className="loan-row">
            {/*
              Name, figure, and the one thing you can do about it, on one line.

              The button used to sit on a line of its own under the row, opposite a
              progress note — and on a debt nothing has been paid off yet, that note is an
              empty string, so every untouched debt was a line of nothing followed by a
              button hanging in the middle of it. Sixteen of those is half a screen of
              blank. The button belongs beside the figure it settles; the progress note
              only exists when there is progress, and now only appears then.
            */}
            <div className="loan-row-top">
              <span className="loan-row-id">
                <span className="loan-row-name">{loan.name}</span>
                <span className="loan-row-sub">
                  {lent ? "Owed to you" : "You owe"}
                  {loan.instalment && loan.instalmentsLeft != null ? (
                    <>
                      {" · "}
                      {/* To the para, like everywhere the rate appears: it is copied off
                          a contract and multiplied by the count beside it, and whole
                          dinars there make the two disagree — see `DebtCard`. */}
                      <span className="mono">{fmtExact(loan.instalment)}</span> ×{" "}
                      {loan.instalmentsLeft} left
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
              {/*
                Quiet, because of how often it is the right thing to press: once, ever,
                per debt. Three filled buttons down a summary panel read as the three
                things to do on the screen, and they are the three things you are least
                likely to do — the figure and the bar beside them are why you looked.
                It keeps its word rather than shrinking to an icon, since "Settled" and
                "Collected" are not the same act and a tick cannot say which.
              */}
              {/*
                The thing you actually do to a debt, in the place you actually do it.

                This was `Settled', which closes the debt — the one act that is right once
                ever, sitting where the eye lands on every row. On a debt with money still
                owed it was worse than loud: pressing it made a claim that was not true,
                on one click, with nothing asked.

                What you do to a debt every month is pay some of it. So the row leads to
                the entry form with this debt already chosen, and closing lives on the
                Debts screen, next to the Reopen that undoes it. A debt on an instalment
                plan does not need either — the last rate closes it, see `postRecurring`.

                Once it is down to nothing the old word is the true one, and confirming it
                is the right act, so the button comes back then and says so.
              */}
              {loan.outstanding > 0 ? (
                <Link
                  href={`/private/money?new=${lent ? "income" : "expense"}&loan=${loan.id}`}
                  className="loan-row-do"
                  title={`${fmt(loan.outstanding)} still ${lent ? "to collect" : "owed"}`}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {/*
                    Two words, and the same two on both directions.

                    Which way the money goes is on the row already — `You owe` against
                    `Owed to you`, gold against green — so a label that repeats it is a
                    label carrying nothing. What is left is the act itself, and the act is
                    writing down a payment.
                  */}
                  Add payment
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => settle(loan.id, true)}
                  disabled={pending}
                  className="loan-row-do"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {lent ? "Collected" : "Settled"}
                </button>
              )}
            </div>

            {/*
              The track is drawn whether or not anything has gone against it.

              It used to appear only once a debt had been paid into, which meant a panel
              of untouched debts was three bare lines with a button on each and nothing
              saying where any of them stood — which is what this panel is for. An empty
              track is not a lie: it says nothing has been paid, which is the truth, and
              it keeps every row the same height so the column reads as a column.

              What was actually wrong before was the *foot*, which said nothing at all on
              an untouched debt. So it says something now.
            */}
            {total > 0 && (
              <>
                <div className="loan-bar">
                  <span
                    className="loan-bar-fill"
                    style={{ width: `${share * 100}%` }}
                    aria-hidden="true"
                  />
                </div>
                <p className="loan-row-foot">
                  {paid > 0
                    ? `${fmt(paid)} of ${fmt(total)} ${lent ? "collected" : "settled"}`
                    : `Nothing ${lent ? "collected" : "paid"} against ${fmt(total)} yet`}
                </p>
              </>
            )}
          </div>
        );
      })}

      {/*
        The count says how much is still behind it, in money as well as in rows — on this
        panel the figure is the reason to open it.
      */}
      {rest > 0 && (
        <button type="button" onClick={() => setDrawn(open.length)} className="zv-more">
          <span>
            {rest} more {rest === 1 ? "debt" : "debts"}
          </span>
          <span className="mono text-[11px] text-faint">
            {fmt(open.slice(drawn).reduce((sum, l) => sum + l.outstanding, 0))} outstanding
          </span>
        </button>
      )}

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
