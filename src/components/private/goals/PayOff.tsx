"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus } from "lucide-react";
import { saveTransaction, type MoneyState } from "@/app/(app)/private/actions";
import { Button } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";

import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import { toRsd } from "@/lib/money";
import type { AccountBalance } from "@/lib/data/money";
import type { GoalLine } from "@/lib/types";
import { caps, field } from "./shared";

/**
 * The deliberate act on a goal that is being cleared: a payment against it.
 *
 * It looks like `MoveMoney` and is not the same thing, which is why it has its own
 * file rather than a third mode in that one. Money set aside stays on the account and
 * merely stops counting as free; money paid has gone, and the entry written here is an
 * ordinary expense that happens to name the goal. So there is no "move it to another
 * goal" — there is nothing left to move — and no warning about spending more than the
 * account holds, because that is a question every other expense already answers.
 *
 * Refund is the second direction rather than a correction: money coming back off a
 * debt or a planned spend is income belonging to the same goal, and without it the only
 * way to undo a mistyped payment is to go hunting for it in the ledger.
 */
export function PayOff({
  goal,
  accounts,
  done,
}: {
  goal: GoalLine;
  accounts: AccountBalance[];
  done: boolean;
}) {
  const { fmt, code, display } = useMoney();
  const router = useRouter();
  const [state, setState] = useState<MoneyState>();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"pay" | "refund">("pay");
  const [amount, setAmount] = useState("");

  const only = accounts.length === 1 ? accounts[0] : null;
  const [chosen, setChosen] = useState(goal.lastAccountId ?? only?.id ?? accounts[0]?.id ?? "");
  const refunding = mode === "refund";
  // Nothing has been paid, so there is nothing to hand back and no choice to offer.
  const canRefund = goal.progress > 0;

  const target = Math.max(Number(goal.target_rsd) || 0, 0);
  const owed = target > 0 ? Math.max(target - goal.progress, 0) : null;
  /*
    Read at the same rate the rest of the screen is converted with, so "more than is
    left" is measured in the money being displayed rather than in whatever the field
    happens to be typed in.
  */
  const typed = toRsd(Number(amount) || 0, code, display.rates);
  const beyondOwed = !refunding && owed !== null && typed > owed;

  const submit = (formData: FormData) => {
    startTransition(async () => {
      const next = await saveTransaction(undefined, formData);
      setState(next);
      if (!next?.ok) return;
      setAmount("");
      router.refresh();
    });
  };

  return (
    <form
      action={submit}
      className="goal-move-panel border-t border-line-soft bg-white/[0.02] py-4 pr-4 pl-5"
    >
      <input type="hidden" name="kind" value={refunding ? "income" : "expense"} />
      <input type="hidden" name="goal_id" value={goal.id} />
      <input type="hidden" name="currency" value={code} />
      <input type="hidden" name="return_to" value="stay" />
      {/*
        The entry is named after the goal, because that is what it is. An expense with
        no name is the one thing the ledger cannot show you later, and asking for a name
        here would turn a two-field act into a three-field one for a line that reads the
        same every month.
      */}
      <input type="hidden" name="title" value={goal.name} />

      <div className="mb-3 flex items-center justify-between gap-2">
        {canRefund ? (
          <div
            className="goal-move-tabs flex min-w-0 items-center gap-1"
            role="group"
            aria-label={`What happens against ${goal.name}`}
          >
            {(
              [
                { key: "pay", label: "Pay", on: !refunding },
                { key: "refund", label: "Refund", on: refunding },
              ] as { key: "pay" | "refund"; label: string; on: boolean }[]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMode(tab.key)}
                aria-pressed={tab.on}
                className={cn("goal-move-tab", tab.on && "is-on")}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            <Minus className="h-3.5 w-3.5 shrink-0 text-gold" />
            <span className={cn(caps, "truncate")}>{done ? "Pay more" : "Log a payment"}</span>
          </span>
        )}

        {only ? (
          <span className="min-w-0 truncate text-[11px] text-faint">
            {refunding ? "back to" : "from"} {only.name}
          </span>
        ) : accounts.length === 0 ? (
          <span className="text-[11px] text-faint">no account yet</span>
        ) : null}
      </div>

      <div className="goal-move-controls">
        <div className="flex min-w-0 items-center rounded-ctrl border border-line bg-white/[0.035] focus-within:border-gold focus-within:shadow-ring">
          <MoneyField
            className="contents"
            name="amount"
            value={amount}
            onValueChange={setAmount}
            placeholder="0"
            aria-label={
              refunding ? `Money coming back off ${goal.name}` : `A payment against ${goal.name}`
            }
            inputClassName="mono min-w-0 flex-1 bg-transparent px-2.5 py-2 text-right text-[14px] text-ink placeholder:text-faint focus:outline-none"
          />
          <span className="mono border-l border-line-soft px-2 py-2 text-[11.5px] font-semibold text-muted">
            {code}
          </span>
        </div>

        {only || accounts.length === 0 ? (
          <input type="hidden" name="account_id" value={only?.id ?? ""} />
        ) : (
          <select
            name="account_id"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            aria-label={refunding ? "Account the money comes back to" : "Account it was paid from"}
            className={cn(field, "w-full min-w-0 scheme-dark")}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id} className="bg-surface">
                {refunding ? "Back to" : "From"} {a.name}
              </option>
            ))}
          </select>
        )}

        <Button
          type="submit"
          variant="secondary"
          className="money-premium-button goal-move-submit w-24 shrink-0 px-2 text-[12.5px]"
          disabled={pending || accounts.length === 0}
        >
          {pending ? "Saving…" : refunding ? "Refund" : "Pay"}
        </Button>
      </div>

      {refunding && (
        <p className="mt-2 text-[11px] text-faint">
          {fmt(goal.progress)} paid so far. A refund puts the money back on the account
          and takes it off this goal.
        </p>
      )}

      {beyondOwed && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          That is {fmt(typed - (owed ?? 0))} more than is left
          {(owed ?? 0) > 0 ? <> — {fmt(owed ?? 0)} clears it</> : " — this is already paid off"}.
          It will go through anyway if that is what you meant.
        </p>
      )}

      {state?.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}
