"use client";

import { useActionState, useState } from "react";
import { saveRecurring, deleteRecurring, type MoneyState } from "@/app/(app)/private/actions";
import { Field } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { CURRENCY_OPTIONS, EVERY_OPTIONS, CATEGORY_KIND_OPTIONS } from "@/lib/money";
import type { MoneyAccount, MoneyCategory, MoneyGoal, MoneyRecurring } from "@/lib/types";
import { todayISO } from "@/lib/format";

export function RecurringForm({
  item,
  accounts,
  categories,
  goals,
}: {
  item?: MoneyRecurring;
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  goals: MoneyGoal[];
}) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(
    saveRecurring,
    undefined,
  );
  const [variable, setVariable] = useState(item?.variable ?? false);
  const [kind, setKind] = useState(item?.kind ?? "expense");
  const [goalId, setGoalId] = useState(item?.goal_id ?? "");

  // A standing order into a goal is not a bill: it has no category, it is never
  // income, and its amount is decided by you rather than by a meter reading.
  const toGoal = goalId !== "";

  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }));
  const categoryOptions = categories
    .filter((c) => c.kind === kind)
    .map((c) => ({ value: c.id, label: c.name }));
  const goalOptions = goals.map((g) => ({ value: g.id, label: g.name }));

  return (
    <div className="flex h-full flex-col">
      <form action={formAction} className="flex-1">
        {item && <input type="hidden" name="id" value={item.id} />}

        <Field
          label="Name"
          name="name"
          defaultValue={item?.name ?? ""}
          placeholder={toGoal ? "Rent fund, every month" : "Claude subscription"}
          autoFocus
          required
        />

        {goalOptions.length > 0 && (
          <Select
            label="Puts money into"
            name="goal_id"
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            placeholder="Nothing — this is a bill"
            options={goalOptions}
            help={
              toGoal
                ? "Every time this books, that amount is set aside on the account below. It stays on the account; it just stops counting as free to spend."
                : "Pick a goal to turn this into a standing order instead of a bill."
            }
          />
        )}

        {!toGoal && (
          <>
            <Select
              label="Type"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              options={CATEGORY_KIND_OPTIONS}
            />

            <label className="mb-3.25 flex items-center gap-2.5 rounded-ctrl border border-line px-3 py-2.5 text-[13px] text-ink">
              <input
                type="checkbox"
                name="variable"
                checked={variable}
                onChange={(e) => setVariable(e.target.checked)}
                className="h-4 w-4 accent-gold"
              />
              Amount changes every time (electricity, water)
            </label>
          </>
        )}

        {(!variable || toGoal) && (
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <MoneyField
              label="Amount"
              name="amount"
              defaultValue={item?.amount ?? ""}
              placeholder="0"
            />
            <Select
              label="Currency"
              name="currency"
              defaultValue={item?.currency ?? "RSD"}
              options={CURRENCY_OPTIONS}
            />
          </div>
        )}
        {variable && !toGoal && (
          <Select
            label="Currency"
            name="currency"
            defaultValue={item?.currency ?? "RSD"}
            options={CURRENCY_OPTIONS}
          />
        )}

        <Select
          label="Repeats"
          name="every"
          defaultValue={item?.every ?? "month"}
          options={EVERY_OPTIONS}
        />

        <Field
          label="Next due"
          name="next_on"
          type="date"
          defaultValue={item?.next_on ?? todayISO()}
        />

        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Number of payments"
            name="installments_total"
            inputMode="numeric"
            defaultValue={item?.installments_total ? String(item.installments_total) : ""}
            placeholder="Leave empty = forever"
          />
          <Field
            label="Stop after"
            name="ends_on"
            type="date"
            defaultValue={item?.ends_on ?? ""}
          />
        </div>
        <p className="mb-3.25 -mt-2 text-[11.5px] text-muted">
          {toGoal
            ? "Twelve payments to fill the goal by next summer, say. Whichever comes first, the count or the date, stops it. Leave both empty and it keeps going until you stop it."
            : "For something paid off in instalments — 4 months of a phone, say. Whichever comes first, the count or the date, pauses it. Leave both empty and it repeats until you stop it."}
          {item && (item.installments_done ?? 0) > 0 && (
            <>
              {" "}
              Booked so far: <span className="mono text-ink">{item.installments_done}</span>
              {item.installments_total ? ` of ${item.installments_total}` : ""}.
            </>
          )}
        </p>

        <Select
          label="Account"
          name="account_id"
          defaultValue={item?.account_id ?? accounts[0]?.id ?? ""}
          placeholder={accountOptions.length ? "No account" : "No accounts yet"}
          options={accountOptions}
          help={toGoal ? "The account the money is set aside on. A goal rule needs one." : undefined}
        />

        {!toGoal && (
          <Select
            label="Category"
            name="category_id"
            defaultValue={item?.category_id ?? ""}
            placeholder={categoryOptions.length ? "No category" : "No categories yet"}
            options={categoryOptions}
          />
        )}

        <label className="mb-3.25 flex items-center gap-2.5 rounded-ctrl border border-line px-3 py-2.5 text-[13px] text-ink">
          <input
            type="checkbox"
            name="active"
            defaultChecked={item?.active ?? true}
            className="h-4 w-4 accent-gold"
          />
          Active
        </label>

        {state?.error && (
          <p className="mb-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {state.error}
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Saving…" : item ? "Save changes" : "Create"}
        </Button>
      </form>

      {item && (
        <div className="mt-4 border-t border-line pt-4">
          <DeleteButton
            action={deleteRecurring.bind(null, item.id)}
            label="Delete"
            confirmText={`Delete "${item.name}"? Entries already booked stay.`}
          />
        </div>
      )}
    </div>
  );
}
