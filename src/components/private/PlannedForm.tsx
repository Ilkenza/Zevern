"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { savePlanned, removePlanned, type MoneyState } from "@/app/(app)/private/actions";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { CATEGORY_KIND_OPTIONS, CURRENCY_OPTIONS } from "@/lib/money";
import type { MoneyAccount, MoneyCategory, PlannedRow } from "@/lib/types";
import { todayISO } from "@/lib/format";

/**
 * One thing you already know about, on a date you already know: the dentist in three
 * weeks, the tax payment in November, the invoice landing on the 20th.
 *
 * It is not a rule. Nothing about it repeats, nothing about it is paused — it is either
 * still coming, or it happened and became an entry in Money.
 */
export function PlannedForm({
  item,
  accounts,
  categories,
  onDone,
}: {
  item?: PlannedRow;
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(
    savePlanned,
    undefined,
  );
  const [kind, setKind] = useState(item?.kind === "income" ? "income" : "expense");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }));
  const categoryOptions = categories
    .filter((c) => c.kind === kind)
    .map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="flex h-full flex-col">
      <form action={formAction} className="flex-1">
        {item && <input type="hidden" name="id" value={item.id} />}

        <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
          A name, an amount and the day it lands. It goes on the timeline beside what
          repeats, and comes off it the moment you say it happened.
        </p>

        <Field
          label="Name"
          name="name"
          defaultValue={item?.name ?? ""}
          placeholder={kind === "income" ? "Invoice 2026-114" : "Dentist"}
          autoFocus
          required
        />

        <Select
          label="Type"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          options={CATEGORY_KIND_OPTIONS}
        />

        <div className="grid grid-cols-[1fr_110px] gap-2">
          <Field
            label="Amount"
            name="amount"
            inputMode="decimal"
            defaultValue={item?.amount ? String(item.amount) : ""}
            placeholder="0"
            required
          />
          <Select
            label="Currency"
            name="currency"
            defaultValue={item?.currency ?? "RSD"}
            options={CURRENCY_OPTIONS}
          />
        </div>

        {/* color-scheme is inherited, so this reaches the native date picker. */}
        <Field
          className="scheme-dark"
          label="Due on"
          name="due_on"
          type="date"
          defaultValue={item?.due_on ?? todayISO()}
          help="The day you expect it to happen. It can be moved later."
        />

        <Select
          label="Account"
          name="account_id"
          defaultValue={item?.account_id ?? accounts[0]?.id ?? ""}
          placeholder={accountOptions.length ? "No account" : "No accounts yet"}
          options={accountOptions}
          help="Where it will come off, or land. The entry it becomes uses this."
        />

        <Select
          label="Category"
          name="category_id"
          defaultValue={item?.category_id ?? ""}
          placeholder={categoryOptions.length ? "No category" : "No categories yet"}
          options={categoryOptions}
        />

        <Textarea
          label="Note"
          name="note"
          defaultValue={item?.note ?? ""}
          placeholder="Anything worth remembering when it lands."
        />

        {state?.error && (
          <p className="mb-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {state.error}
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Saving…" : item ? "Save changes" : "Add to the timeline"}
        </Button>
      </form>

      {item && (
        <div className="mt-4 border-t border-line pt-4">
          <DeleteButton
            action={async () => {
              setDeleteError(null);
              const result = await removePlanned(item.id);
              if (result?.error) {
                setDeleteError(result.error);
                return;
              }
              onDone?.();
              router.refresh();
            }}
            label="Delete"
            confirmText={`Delete "${item.name}"? It leaves the timeline and nothing is booked.`}
          />
          {deleteError && <p className="mt-2.5 text-[11.5px] text-danger">{deleteError}</p>}
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
            Nothing has been booked for this yet, so deleting it leaves no entry behind.
            If it did happen, mark it as happened instead — that writes the real entry.
          </p>
        </div>
      )}
    </div>
  );
}
