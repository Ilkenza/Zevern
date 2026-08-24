"use client";

import { useActionState, useEffect, useState } from "react";
import { saveTransaction, deleteTransaction, type MoneyState } from "@/app/(app)/private/actions";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import {
  CURRENCY_OPTIONS,
  TX_KIND_OPTIONS,
  formatRsd,
  isGoalKind,
  rateFor,
  type Rates,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MoneyAccount, MoneyCategory, MoneyGoal, TransactionRow } from "@/lib/types";

export type TxFormData = {
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  goals: MoneyGoal[];
  rates: Rates;
};

export function TransactionForm({
  tx,
  data,
  defaultKind = "expense",
  returnTo,
  onSaved,
}: {
  tx?: TransactionRow;
  data: TxFormData;
  defaultKind?: string;
  returnTo?: "quick";
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(
    saveTransaction,
    undefined,
  );
  const [kind, setKind] = useState(tx?.kind ?? defaultKind);
  const [currency, setCurrency] = useState(tx?.currency ?? "RSD");
  const [amount, setAmount] = useState(tx ? String(tx.amount) : "");

  const { accounts, categories, goals, rates } = data;
  const rate = currency === "RSD" ? 1 : rateFor(currency, rates);
  const parsed = Number(String(amount).replace(",", ".")) || 0;

  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }));
  const categoryOptions = categories
    .filter((c) => (kind === "income" ? c.kind === "income" : c.kind === "expense"))
    .map((c) => ({ value: c.id, label: c.name }));
  // A goal that has since been closed is no longer offered, but an entry already
  // pointing at one still has to be able to name it — otherwise editing that entry
  // would quietly move the money to whatever sat at the top of the list.
  const goalOptions = goals.map((g) => ({ value: g.id, label: g.name }));
  if (tx?.goal_id && !goals.some((g) => g.id === tx.goal_id)) {
    goalOptions.unshift({ value: tx.goal_id, label: `${tx.goal?.name ?? "Goal"} (closed)` });
  }

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  return (
    <div className="flex h-full flex-col">
      <form action={formAction} className="flex-1">
        {tx && <input type="hidden" name="id" value={tx.id} />}
        {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
        <input type="hidden" name="kind" value={kind} />

        {/* Kind — one tap, no dropdown. Three to a row until there is room for all five. */}
        <div className="mb-3.25 grid grid-cols-3 gap-1 rounded-ctrl border border-line bg-white/[0.03] p-1 min-[400px]:grid-cols-5">
          {TX_KIND_OPTIONS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={cn(
                "rounded-[6px] px-1 py-2 text-[12px] font-bold transition-colors",
                kind === k.value ? "bg-gold text-on-gold" : "text-muted hover:bg-white/4 hover:text-ink",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_110px] gap-2">
          <Field
            label="Amount"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
            required
          />
          <Select
            label="Currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={CURRENCY_OPTIONS}
          />
        </div>

        {currency !== "RSD" && (
          <Field
            label={`Rate (1 ${currency} in RSD)`}
            name="rate"
            inputMode="decimal"
            defaultValue={tx ? String(tx.rate) : String(rate)}
            help={parsed > 0 ? `≈ ${formatRsd(parsed * rate)} at the saved rate` : "From Setup — change it only for this entry."}
          />
        )}

        <Select
          label={
            kind === "transfer"
              ? "From account"
              : kind === "saving"
                ? "Set aside on"
                : kind === "withdraw"
                  ? "Back to account"
                  : "Account"
          }
          name="account_id"
          defaultValue={tx?.account_id ?? accounts[0]?.id ?? ""}
          placeholder={accountOptions.length ? "No account" : "No accounts yet"}
          options={accountOptions}
          help={
            isGoalKind(kind)
              ? kind === "saving"
                ? "The money stays here. It only stops counting as free to spend."
                : "The goal lets this money go and it is free to spend again."
              : undefined
          }
        />

        {kind === "transfer" && (
          <Select
            label="To account"
            name="to_account_id"
            defaultValue={tx?.to_account_id ?? ""}
            placeholder="Pick an account"
            options={accountOptions}
          />
        )}

        {(kind === "expense" || kind === "income") && (
          <Select
            label="Category"
            name="category_id"
            defaultValue={tx?.category_id ?? ""}
            placeholder={categoryOptions.length ? "No category" : "No categories yet"}
            options={categoryOptions}
          />
        )}

        {isGoalKind(kind) && (
          <Select
            label={kind === "withdraw" ? "Out of goal" : "Goal"}
            name="goal_id"
            defaultValue={tx?.goal_id ?? goals[0]?.id ?? ""}
            placeholder={goalOptions.length ? "Pick a goal" : "No goals yet"}
            options={goalOptions}
          />
        )}

        <Field
          label="Date"
          name="occurred_on"
          type="date"
          defaultValue={tx?.occurred_on ?? new Date().toISOString().slice(0, 10)}
        />

        <Field label="Note" name="note" defaultValue={tx?.note ?? ""} placeholder="Optional" />

        {state?.error && (
          <p className="mb-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {state.error}
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Saving…" : tx ? "Save changes" : "Save"}
        </Button>
      </form>

      {tx && (
        <div className="mt-4 border-t border-line pt-4">
          <DeleteButton
            action={deleteTransaction.bind(null, tx.id)}
            label="Delete entry"
            confirmText="Delete this entry?"
          />
        </div>
      )}
    </div>
  );
}
