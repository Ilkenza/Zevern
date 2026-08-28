"use client";

import Link from "next/link";
import { Wallet, ArrowRight } from "lucide-react";

import { buttonClasses } from "@/components/ui/Button";
import type { AccountBalance, OnHand } from "@/lib/data/money";
import { useMoney } from "@/lib/money/currency";

/*
  Counting the cash used to live here.

  It offered to type what was in your wallet and booked the difference as an
  uncategorised entry — the automatic version of a correction. We settled on the manual
  version instead: when cash is short and you cannot say where it went, that is an
  ordinary expense with a category of its own, entered like anything else. One way of
  recording a thing beats two, and the one that survived is the one that needs no
  special screen, no special action and no special rule.

  `reconcileCash` and `cashDifference` went with it.
*/

/**
 * What is actually in your pocket.
 *
 * The month figures above answer "what happened in July". This answers the question
 * you ask before every real decision — "can I afford this" — and the honest answer is
 * not the account total. Money promised to a goal is still sitting in the bank, so a
 * total says you have it while the goal says you do not. Free is the number that
 * survives that argument, and it leads.
 *
 * It is deliberately *not* scoped to the month being browsed. Balances are as of now;
 * scrolling back to March does not give you March's bank balance, and pretending
 * otherwise would be the more confusing lie. The label says "right now" for exactly
 * that reason.
 */
export function OnHandBand({
  onHand,
  accounts,
}: {
  onHand: OnHand;
  accounts: AccountBalance[];
}) {
  const { fmt } = useMoney();
  if (accounts.length === 0) {
    return (
      <section className="onhand-band onhand-empty">
        <div>
          <span className="money-page-kicker">Available to spend</span>
          <p className="mt-1.5 text-[13px] text-muted">
            Add an account and Zevern can tell you what is left to spend, not just what
            you spent.
          </p>
        </div>
        <Link
          href="/private/setup"
          className={buttonClasses("secondary", "money-premium-button border")}
        >
          <Wallet className="h-4 w-4" /> Add an account
        </Link>
      </section>
    );
  }

  const total = onHand.total;
  // The bar is a share of the total, so an overdrawn or over-reserved state cannot
  // push a segment past the end of its own track.
  const share = (value: number) =>
    total > 0 ? `${Math.max(0, Math.min(100, (value / total) * 100))}%` : "0%";

  /*
    The bar exists to show one thing: how much of the money is spoken for. With no
    goals holding anything back there is nothing to show — it was drawing a track
    filled to 100% and a legend that printed the same figure twice, once as "Free" and
    once as "Total". Two labels, one number, no information. The headline above already
    says it, and the caption already says how many accounts it is across.
  */
  const hasSplit = onHand.reserved > 0;

  return (
    <section className="onhand-band">
      <div className="onhand-figure">
        <span className="money-page-kicker">
          Available to spend <em>· right now</em>
        </span>
        <div
          className={`mono onhand-value ${onHand.free < 0 ? "text-danger" : "text-ink"}`}
        >
          {fmt(onHand.free)}
        </div>
        <p className="onhand-caption">
          {onHand.reserved > 0 ? (
            <>
              after {fmt(onHand.reserved)} is reserved for your goals
            </>
          ) : (
            <>across {accounts.length === 1 ? "one account" : `${accounts.length} accounts`}</>
          )}
        </p>

        {hasSplit && (
          <>
            <div className="onhand-track" aria-hidden>
              <span
                className="onhand-seg onhand-free money-progress-segment"
                style={{ width: share(onHand.free) }}
              />
              <span
                className="onhand-seg onhand-reserved money-progress-segment"
                style={{ width: share(onHand.reserved) }}
              />
            </div>

            <div className="onhand-legend">
              <span><i className="onhand-key onhand-free" /> Free {fmt(onHand.free)}</span>
              <span>
                <i className="onhand-key onhand-reserved" /> Reserved {fmt(onHand.reserved)}
              </span>
              <span className="onhand-total">Total {fmt(onHand.total)}</span>
            </div>
          </>
        )}
      </div>

      <div className="onhand-accounts">
        {accounts.map((a) => (
          <div key={a.id} className="onhand-account">
            <span className="onhand-account-name">{a.name}</span>
            <span className="mono onhand-account-value">{fmt(a.balance)}</span>
            {a.reserved > 0 && (
              <span className="onhand-account-note">{fmt(a.free)} free</span>
            )}
          </div>
        ))}
        <Link href="/private/setup" className="onhand-manage">
          Manage accounts <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
