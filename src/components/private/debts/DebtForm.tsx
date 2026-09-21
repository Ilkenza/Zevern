"use client";

import { useActionState, useState } from "react";
import { saveLoan, type MoneyState } from "@/app/(app)/private/actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { CURRENCY_OPTIONS } from "@/lib/money";
import { useDefaultCurrency } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import type { LoanLine } from "@/lib/types";

/**
 * A debt, written down.
 *
 * Until now the only way to make one was inside an entry — lend somebody money, tick
 * `＋ A new debt`, and the debt was created as a side effect of the movement. That is the
 * right default and the wrong only option: it means a debt cannot be corrected. A name
 * typed in a hurry, a total that turned out to include interest, a date off by a month —
 * all of them were permanent, on the one kind of row people get wrong most often, because
 * a debt is written down at the moment you are least able to concentrate on it.
 *
 * `total` is what will be *settled* in the end, not what changed hands. For a friend those
 * are one figure. For a credit they are not — 550.000 arrives and 600.000 leaves — and it
 * is the repayment total that lets the balance run to exactly zero on the last instalment.
 */
export function DebtForm({ debt, onDone }: { debt?: LoanLine; onDone?: () => void }) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(
    async (prev, data) => {
      const result = await saveLoan(prev, data);
      if (result?.ok) onDone?.();
      return result;
    },
    undefined,
  );
  const [lent, setLent] = useState((debt?.direction ?? "lent") === "lent");
  const locked = Boolean(debt);
  const fallback = useDefaultCurrency();

  return (
    <div className="flex h-full flex-col">
      <form action={formAction} className="flex-1">
        {debt && <input type="hidden" name="id" value={debt.id} />}
        <input type="hidden" name="direction" value={lent ? "lent" : "borrowed"} />

        {/*
          Which way it runs cannot change once movements are attached to it.

          The direction is what decides whether a movement pays the debt down or opens it
          further — see `settles` in the loan reader. Flipping it under a repayment history
          would turn every payment into its opposite and hand back a figure that has never
          been true.
        */}
        {locked ? (
          <p className="goal-kind-locked">
            {lent ? "Owed to you" : "You owe"} — a debt cannot change direction once
            movements are attached to it.
          </p>
        ) : (
          <div className="zv-seg" role="group" aria-label="Which way does this debt run?">
            {[
              { key: true, label: "I lent it" },
              { key: false, label: "I owe it" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setLent(o.key)}
                aria-pressed={lent === o.key}
                className={cn(lent === o.key && "is-on")}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
          {lent
            ? "Money that is still yours while somebody else is holding it. It stays out of income, spending and every budget — only the account balance knows it moved."
            : "Money on your account that is not yours. Same rule: it never counts as income, and repaying it never counts as spending."}
        </p>

        <Field
          label="Name"
          name="name"
          defaultValue={debt?.name ?? ""}
          placeholder={lent ? "Loan to my brother" : "Car loan — Raiffeisen"}
          required
          help="Whose debt it is, or what it paid for."
        />

        {/*
          The total, in the currency it was agreed in.

          Every debt used to be a dinar debt, because the row had nowhere else to put a
          figure — which is wrong for exactly the debts that matter most here. A bank
          credit in Belgrade is written in euros and repaid in dinars at the day’s rate,
          and money borrowed from someone abroad is however many of whatever he handed
          over.

          The dinar figure is still what every other screen counts, so `saveLoan` converts
          once at the rate of the day and keeps the rate on the row. The card then says
          both: what was agreed, and what that came to.
        */}
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-x-2">
          <MoneyField
            name="total"
            label="Total to settle"
            defaultValue={debt?.total_amount ?? debt?.total_rsd ?? ""}
            placeholder="0"
            required
            help={
              lent
                ? "What you expect to get back in the end."
                : "What will be repaid in the end — including interest, if there is any. For a credit that is more than the amount that arrived, and the difference is the interest."
            }
          />
          <Select
            label="Currency"
            name="currency"
            defaultValue={debt?.currency ?? fallback}
            options={CURRENCY_OPTIONS}
          />
        </div>

        <Field
          label="Since"
          name="opened_on"
          type="date"
          defaultValue={debt?.opened_on ?? ""}
          help="The day it started. Left empty, today."
        />

        <Textarea
          label="Note"
          name="note"
          rows={3}
          defaultValue={debt?.note ?? ""}
          placeholder="Anything you will want to remember about it."
        />

        {state?.error && <p className="mb-3 text-[12px] text-danger">{state.error}</p>}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Saving…" : debt ? "Save changes" : "Add the debt"}
        </Button>
      </form>
    </div>
  );
}
