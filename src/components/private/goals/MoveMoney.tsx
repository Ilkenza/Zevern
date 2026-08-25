"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { saveTransaction, type MoneyState } from "@/app/(app)/private/actions";
import { Button } from "@/components/ui/Button";
import { formatRsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { GoalLine, MoneyAccount } from "@/lib/types";
import { caps, field } from "./shared";

/**
 * The one deliberate act on this screen: money moving between an account and a goal.
 * It gets its own footer, its own caption and its own ground, so it never reads as one
 * more box in a row.
 *
 * Both directions live here, because taking money back out is the same decision made
 * the other way round — and hiding it somewhere else is what left a goal claiming
 * dinars that had already been spent.
 */
export function MoveMoney({
  goal,
  accounts,
  done,
}: {
  goal: GoalLine;
  accounts: MoneyAccount[];
  done: boolean;
}) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(
    saveTransaction,
    undefined,
  );
  const [out, setOut] = useState(false);

  const canTakeOut = goal.saved > 0;
  const taking = out && canTakeOut;
  // The account this goal used last is the one it will almost certainly use again.
  const preferred = goal.lastAccountId ?? accounts[0]?.id ?? "";
  const only = accounts.length === 1 ? accounts[0] : null;

  // The amount is left uncontrolled on purpose: React empties an uncontrolled field
  // once its form action settles, so the box clears itself and the same figure cannot
  // go in twice by accident. Holding it in state was what kept the old amount sitting
  // there after a save.
  return (
    <form
      action={formAction}
      className="goal-move-panel border-t border-line-soft bg-white/[0.02] py-3 pr-4 pl-5"
    >
      <input type="hidden" name="kind" value={taking ? "withdraw" : "saving"} />
      <input type="hidden" name="goal_id" value={goal.id} />
      <input type="hidden" name="currency" value="RSD" />
      <input type="hidden" name="return_to" value="stay" />

      <div className="mb-2 flex items-center justify-between gap-2">
        {/* With nothing in the goal yet there is only one thing to do here, so the
            caption stays a caption rather than pretending to be a choice. */}
        {canTakeOut ? (
          <div className="goal-money-toggle flex min-w-0 items-center gap-1" role="group" aria-label={`Money direction for ${goal.name}`}>
            <button
              type="button"
              onClick={() => setOut(false)}
              aria-pressed={!taking}
              className={cn(
                "rounded-pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider transition-colors",
                taking ? "text-faint hover:text-muted" : "bg-active-bg text-gold-hi",
              )}
            >
              Put aside
            </button>
            <button
              type="button"
              onClick={() => setOut(true)}
              aria-pressed={taking}
              className={cn(
                "rounded-pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider transition-colors",
                taking ? "bg-active-bg text-gold-hi" : "text-faint hover:text-muted",
              )}
            >
              Take out
            </button>
          </div>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 shrink-0 text-gold" />
            <span className={cn(caps, "truncate")}>{done ? "Add more" : "Put money aside"}</span>
          </span>
        )}

        {only ? (
          <span className="min-w-0 truncate text-[11px] text-faint">
            {taking ? "back to" : "from"} {only.name}
          </span>
        ) : accounts.length === 0 ? (
          <span className="text-[11px] text-faint">no account yet</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {/* The amount and its currency are one control — the dinars are not a second question. */}
        <div className="flex min-w-0 flex-1 items-center rounded-ctrl border border-line bg-white/[0.035] focus-within:border-gold focus-within:shadow-ring">
          <input
            name="amount"
            inputMode="decimal"
            placeholder="0"
            aria-label={taking ? `Take money out of ${goal.name}` : `Add money to ${goal.name}`}
            className="mono min-w-0 flex-1 bg-transparent px-2.5 py-2 text-right text-[14px] text-ink placeholder:text-faint"
          />
          <span className="mono border-l border-line-soft px-2 py-2 text-[11.5px] font-semibold text-muted">
            RSD
          </span>
        </div>
        {/* Fixed width so "Adding…" does not shrink the control mid-submit. */}
        <Button
          type="submit"
          variant="secondary"
          className="money-premium-button w-24 shrink-0 px-2 py-2 text-[12.5px]"
          disabled={pending}
        >
          {pending ? "Saving…" : taking ? "Take out" : "Put aside"}
        </Button>
      </div>

      {only || accounts.length === 0 ? (
        <input type="hidden" name="account_id" value={only?.id ?? ""} />
      ) : (
        <select
          name="account_id"
          defaultValue={preferred}
          aria-label={taking ? "Account the money goes back to" : "Account the money comes off"}
          className={cn(field, "mt-2 w-full scheme-dark")}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id} className="bg-surface">
              {taking ? "Back to" : "From"} {a.name}
            </option>
          ))}
        </select>
      )}

      {taking && (
        <p className="mt-2 text-[11px] text-faint">
          Holds {formatRsd(goal.saved)}. Taking it out frees it to spend again.
        </p>
      )}

      {state?.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

