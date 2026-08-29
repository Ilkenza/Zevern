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
import { toRsd } from "@/lib/money";
import type { LoanLine } from "@/lib/types";
import { getRates, readAll } from "./core";

/**
 * Which movements pay a loan down, and which one opened it.
 *
 * It falls out of the direction and needs no flag of its own. A loan you gave started
 * with money leaving and is settled by money coming back; one you took started with
 * money arriving and is settled by money going out. The opening movement and the
 * settling ones always point opposite ways, so the direction alone tells them apart.
 *
 * The instalment of a credit is an ordinary `expense` carrying a `loan_id`, so it is
 * counted here by its cash direction like any other repayment — which is the whole
 * reason this is written in terms of direction rather than in terms of kind.
 */
function settles(direction: string, kind: string): boolean {
  const moneyIn = kind === "loan_in" || kind === "income";
  return direction === "lent" ? moneyIn : !moneyIn;
}

export const getLoans = cache(async (): Promise<LoanLine[]> => {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];

  const [loanRes, moveRows, ruleRes, rates] = await Promise.all([
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
          .select("id, loan_id, kind, amount_rsd, occurred_on, title")
          .eq("user_id", uid)
          .not("loan_id", "is", null)
          .order("occurred_on", { ascending: false })
          .order("id")
          .range(from, to),
      "getLoans",
    ),
    supabase
      .from("money_recurring")
      .select("loan_id, amount, currency, installments_total, installments_done")
      .eq("user_id", uid)
      .not("loan_id", "is", null),
    getRates(),
  ]);
  if (loanRes.error) console.error("getLoans:", loanRes.error.message);

  
  const ruleRows = ruleRes.data ?? [];

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

    const settled = rows.reduce(
      (sum, r) => (settles(loan.direction, r.kind) ? sum + (Number(r.amount_rsd) || 0) : sum),
      0,
    );

    const rule = ruleBy.get(loan.id);
    const each = rule ? toRsd(Number(rule.amount) || 0, rule.currency, rates) : 0;

    return {
      ...loan,
      settled: Math.round(settled),
      // An overpayment is a settled debt, not one that owes money back. Anything past
      // the total is the owner's business with the other party, not the app's.
      outstanding: Math.max(Math.round(total - settled), 0),
      movements: rows.map((r) => ({
        id: r.id,
        on: String(r.occurred_on),
        amount: Number(r.amount_rsd) || 0,
        kind: r.kind,
        title: r.title,
      })),
      instalment: each > 0 ? Math.round(each) : null,
      instalmentsLeft:
        rule && rule.installments_total != null
          ? Math.max(0, rule.installments_total - (rule.installments_done ?? 0))
          : null,
    };
  });
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

