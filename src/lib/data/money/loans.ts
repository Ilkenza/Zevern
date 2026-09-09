/**
 * Debts, in both directions, and how much of each is left.
 *
 * A loan is the one thing in this app whose whole point is that it is temporary. Money
 * lent is still yours; money borrowed is on your account but is not yours. Both are
 * invisible to every other figure here — income, spending, the month's net, budgets and
 * the six-month median that limits are set from — and the only place they are counted
 * is the account balance, because the cash really did move.
 *
 * What is outstanding is worked out from the movements every time rather than kept as a
 * running total on the row. A stored figure is one more thing that can drift out of
 * step with the ledger it claims to describe, and the ledger is the thing people edit.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { paymentsLeft, toRsd } from "@/lib/money";
import { settledOf } from "@/lib/money/loan-progress";
import type { LoanLine } from "@/lib/types";
import { getAccounts, getRates, readAll } from "./core";
import { ReadFailed } from "@/lib/data/must";

export const getLoans = cache(async (): Promise<LoanLine[]> => {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];

  const [loanRes, moveRows, ruleRes, rates, accounts] = await Promise.all([
    supabase
      .from("money_loans")
      .select("*")
      .eq("user_id", uid)
      .order("opened_on", { ascending: false }),
    // Paged like the rest: a loan repaid in small instalments over years is precisely
    // the shape that walks into the cap, and a half-read repayment history reads as a
    // debt that is further from settled than it is.
    readAll(
      (from, to) =>
        supabase
          .from("money_transactions")
          .select("id, loan_id, kind, amount_rsd, occurred_on, title, account_id, recurring_id")
          .eq("user_id", uid)
          .not("loan_id", "is", null)
          .order("occurred_on", { ascending: false })
          .order("id")
          .range(from, to),
      "the payments on your debts",
    ),
    supabase
      .from("money_recurring")
      .select("id, loan_id, amount, currency, installments_total, installments_done")
      .eq("user_id", uid)
      .not("loan_id", "is", null),
    getRates(),
    // Archived accounts still name the money that came off them, so include them — the
    // same call the goals history makes, and cached for the request either way.
    getAccounts(true),
  ]);
  if (loanRes.error) throw new ReadFailed("your debts", loanRes.error.message);
  if (ruleRes.error) throw new ReadFailed("the instalment plans", ruleRes.error.message);

  const ruleRows = ruleRes.data ?? [];
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  const byLoan = new Map<string, typeof moveRows>();
  for (const row of moveRows) {
    if (!row.loan_id) continue;
    const seen = byLoan.get(row.loan_id) ?? [];
    seen.push(row);
    byLoan.set(row.loan_id, seen);
  }

  /*
    One rule per loan is the shape this is built for — a credit has one instalment plan.
    If a second is ever attached the first found wins rather than the two being added
    together, because two plans against one debt is a mistake to surface, not an
    arithmetic to guess at.
  */
  const ruleBy = new Map<string, (typeof ruleRows)[number]>();
  for (const rule of ruleRows) {
    if (!rule.loan_id || ruleBy.has(rule.loan_id)) continue;
    ruleBy.set(rule.loan_id, rule);
  }

  return (loanRes.data ?? []).map((loan) => {
    const rows = byLoan.get(loan.id) ?? [];
    const total = Number(loan.total_rsd) || 0;

    // The rule lives in `loan-progress`, where it can be tested without a database —
    // and where the refund case is pinned, because a debt that keeps claiming it was
    // paid after the money came back is the one failure nobody would go looking for.
    const settled = settledOf(
      loan.direction,
      rows.map((r) => ({ kind: r.kind, amount: Number(r.amount_rsd) || 0 })),
    );

    const rule = ruleBy.get(loan.id);
    const each = rule ? toRsd(Number(rule.amount) || 0, rule.currency, rates) : 0;
    const outstanding = Math.max(Math.round(total - settled), 0);

    return {
      ...loan,
      settled: Math.round(settled),
      // An overpayment is a settled debt, not one that owes money back. Anything past
      // the total is the owner's business with the other party, not the app's.
      outstanding,
      movements: rows.map((r) => ({
        id: r.id,
        on: String(r.occurred_on),
        amount: Number(r.amount_rsd) || 0,
        kind: r.kind,
        title: r.title,
        accountId: r.account_id,
        account: r.account_id ? (accountName.get(r.account_id) ?? null) : null,
        recurring: r.recurring_id != null,
      })),
      /*
        Kept to the para, not rounded to whole dinars here.

        It was `Math.round(each)`, which is a display decision taken in the data layer —
        and this figure is copied off a contract. 30.776,48 × 4 is 123.105,92 exactly;
        30.776 × 4 is 123.104, and a card printing the second next to a total of the
        first reads as the bank being 1,92 out. Whoever shows it decides how much of it
        to show.
      */
      instalment: each > 0 ? each : null,
      /*
        Worked out from what is owed, not counted down from what was planned.

        It was `installments_total - installments_done`, which is arithmetic on a counter
        and was the one figure on this screen that could not be checked against the
        ledger. Pay 35.000 one month against a 30.776,48 rate and the counter still said
        three payments left — three payments that came to more than was owed. Divide what
        is actually outstanding instead and the plan shortens the moment the entry is
        written, without anybody editing the rule; pay less than the rate and it
        lengthens the same way.

        Rounded up, because a remainder is a payment: 88.105,92 at 30.776,48 is two full
        ones and a short one, which is three times you have to send money.

        Handed the unrounded figures. `outstanding` above is rounded to whole dinars for
        display and `each` is not rounded at all, and dividing those two turned an exact
        four payments into five — see `paymentsLeft`, which does the division in cents.
      */
      instalmentsLeft: paymentsLeft(total - settled, each),
      ruleId: rule?.id ?? null,
    };
  });
});

/**
 * What is still owed on each debt, for the rules that pay them down.
 *
 * The mirror of `getGoalRemaining`, and read the same way: a rule's projection stops
 * when this reaches nought and its last booking is trimmed to whatever is in here. It is
 * `outstanding`, which is worked out from the entries rather than stored — so paying
 * 35.000 against a 30.776,48 rate shortens the plan the moment the entry is written,
 * without anybody editing the rule.
 *
 * Settled debts are left out rather than mapped to zero, which is the same thing to
 * every reader and one less row to walk.
 */
export const getLoanRemaining = cache(async (): Promise<Map<string, number>> => {
  const loans = await getLoans();
  return new Map(
    loans.filter((l) => l.settled_on == null).map((l) => [l.id, Math.max(0, l.outstanding)]),
  );
});

/** Open debts only — what the panel is actually about. */
export function isLoanOpen(loan: LoanLine): boolean {
  return loan.settled_on == null && loan.outstanding > 0;
}

/**
 * The two figures the panel's header says: what is owed to the owner, and what they
 * owe. Kept apart rather than netted off — they are not the same money, and cancelling
 * one against the other would hide both.
 */
export function loanTotals(loans: LoanLine[]): { owedToYou: number; youOwe: number } {
  let owedToYou = 0;
  let youOwe = 0;
  for (const loan of loans) {
    if (!isLoanOpen(loan)) continue;
    if (loan.direction === "lent") owedToYou += loan.outstanding;
    else youOwe += loan.outstanding;
  }
  return { owedToYou, youOwe };
}
