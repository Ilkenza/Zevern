"use client";

import Link from "next/link";
import { Wallet, ArrowRight } from "lucide-react";

import { buttonClasses } from "@/components/ui/Button";
import type { AccountBalance } from "@/lib/data/money";
import { useMoney } from "@/lib/money/currency";

/**
 * What is on each account, as of now.
 *
 * This was `OnHandBand`, and it led with `Free to spend` in thirty-four point type over
 * a Free/Reserved/Total bar. Two things were wrong with that here.
 *
 * The figure was already the headline of the Overview and the closing line of the
 * equation on Goals — three screens saying the app's most important number, which is
 * two more than a number needs to be said.
 *
 * And it was the one element on this page that ignored the page. Everything above and
 * below it is scoped to whichever span the toolbar is set to: pick `Last 7 days` and
 * the four figures move, the breakdown moves, the ledger moves. A balance cannot move
 * with them — it is as of now, and scrolling back to March does not give you March's
 * bank balance. Sitting unlabelled among controls that do re-scope, it read as a figure
 * that had failed to update rather than one that was never in that scope.
 *
 * So the figure goes to the screens that own it, the balances stay, and the kicker says
 * out loud which question these answer.
 */
export function AccountsStrip({
  accounts,
  only,
}: {
  accounts: AccountBalance[];
  /**
   * The accounts the toolbar is standing in, if it is standing in any.
   *
   * Every other block on this screen narrows when a filter is set, and this one kept
   * printing all eight — so choosing `Bank (RSD)` left seven balances on screen that the
   * rest of the page was no longer talking about. It is still `right now` either way: the
   * filter picks which accounts are answered for, not which day.
   */
  only?: readonly string[];
}) {
  const { fmt } = useMoney();
  const picked = only ?? [];
  const shown = picked.length > 0 ? accounts.filter((a) => picked.includes(a.name)) : accounts;

  if (accounts.length === 0) {
    return (
      <section className="acct-strip is-empty">
        <div>
          <span className="money-page-kicker">Accounts</span>
          <p className="mt-1.5 text-[13px] text-muted">
            Add an account and Zevern can tell you what is left to spend, not just what
            you spent.
          </p>
        </div>
        <Link
          href="/private/setup#setup-accounts"
          className={buttonClasses("secondary", "money-premium-button border")}
        >
          <Wallet className="h-4 w-4" /> Add an account
        </Link>
      </section>
    );
  }

  return (
    <section className="acct-strip">
      {/*
        `right now`, in the same words the span control uses for everything else. The
        toolbar above says `Last 30 days`; without this line the balances beside it look
        like they are for the last thirty days too.
      */}
      <span className="money-page-kicker">
        {shown.length === 1 && picked.length > 0 ? "On this account" : "On accounts"}{" "}
        <em>· right now</em>
      </span>

      <div className="acct-strip-list">
        {shown.map((a) => (
          <div key={a.id} className="onhand-account">
            <span className="onhand-account-name">{a.name}</span>
            <span className="mono onhand-account-value">{fmt(a.balance)}</span>
          </div>
        ))}
      </div>

      <Link href="/private/setup#setup-accounts" className="onhand-manage acct-strip-manage">
        Manage accounts <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </section>
  );
}

