"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  saveInvoice,
  deleteInvoice,
  type InvoiceFormState,
} from "@/app/(app)/invoices/actions";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { INVOICE_STATUS_OPTIONS, CURRENCY_OPTIONS } from "@/lib/status";
import { todayISO, formatMoney } from "@/lib/format";
import { quoteTotal } from "@/lib/quotes/total";
import type { Invoice, QuoteItem } from "@/lib/types";

export type ClientOption = { id: string; name: string };

export function InvoiceForm({
  invoice,
  clients,
  suggestedNumber,
}: {
  invoice?: Invoice;
  clients: ClientOption[];
  suggestedNumber: string;
}) {
  const [state, formAction, pending] = useActionState<
    InvoiceFormState,
    FormData
  >(saveInvoice, undefined);

  const [currency, setCurrency] = useState(invoice?.currency ?? "EUR");
  const [items, setItems] = useState<QuoteItem[]>(
    Array.isArray(invoice?.items)
      ? (invoice!.items as unknown as QuoteItem[])
      : [],
  );

  const addLine = () =>
    setItems((p) => [...p, { label: "", price: 0, qty: 1 }]);
  const update = (i: number, patch: Partial<QuoteItem>) =>
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) =>
    setItems((p) => p.filter((_, idx) => idx !== i));

  const total = quoteTotal(items);
  const hasItems = items.length > 0;
  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));
  const cellInput =
    "rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-[13px] text-ink focus:border-gold focus:shadow-ring focus:outline-none";

  return (
    <div className="flex h-full flex-col">
      <form action={formAction} className="flex-1">
        {invoice && <input type="hidden" name="id" value={invoice.id} />}
        <input type="hidden" name="items" value={JSON.stringify(items)} />

        <Field
          label="Invoice number"
          name="number"
          defaultValue={invoice?.number ?? suggestedNumber}
          placeholder="2026-001"
        />

        <Select
          label="Client"
          name="client_id"
          defaultValue={invoice?.client_id ?? ""}
          placeholder={clientOptions.length ? "No client" : "No clients yet"}
          options={clientOptions}
        />

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Select
            label="Currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={CURRENCY_OPTIONS}
          />
          <Select
            label="Status"
            name="status"
            defaultValue={invoice?.status ?? "draft"}
            options={INVOICE_STATUS_OPTIONS}
          />
        </div>

        {/* Line items */}
        <div className="mb-3.25">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-semibold text-[#C6CAD6]">
              Line items
            </label>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-gold hover:text-gold-hi"
            >
              <Plus className="h-3.5 w-3.5" />
              Add line
            </button>
          </div>

          {hasItems && (
            <div className="overflow-hidden rounded-ctrl border border-line">
              {items.map((it, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 border-b border-line-soft px-2.5 py-2 last:border-b-0"
                >
                  <input
                    value={it.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder="Description"
                    className={`${cellInput} flex-1`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={it.price}
                    onChange={(e) =>
                      update(i, { price: Number(e.target.value) })
                    }
                    className={`mono ${cellInput} w-20 text-right`}
                  />
                  <input
                    type="number"
                    min="1"
                    value={it.qty}
                    onChange={(e) => update(i, { qty: Number(e.target.value) })}
                    className={`mono ${cellInput} w-12 text-right`}
                  />
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label="Remove line"
                    className="cursor-pointer text-faint transition-colors hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {hasItems ? (
          <div className="mb-3.25 flex items-center justify-between rounded-ctrl border border-line bg-white/2 px-3 py-2.5">
            <span className="text-[12px] font-semibold uppercase tracking-widere text-muted">
              Total
            </span>
            <span className="mono text-[15px] font-bold text-ink">
              {formatMoney(total, currency)}
            </span>
          </div>
        ) : (
          <Field
            label="Amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={invoice ? String(invoice.amount) : ""}
            placeholder="500"
            help="Or add line items above for an itemized invoice."
          />
        )}

        <Field
          label="Issued"
          name="issued_at"
          type="date"
          defaultValue={invoice?.issued_at ?? (invoice ? "" : todayISO())}
        />

        <Field
          label="Due date"
          name="due_date"
          type="date"
          defaultValue={invoice?.due_date ?? ""}
        />

        {state?.error && (
          <p className="mb-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {state.error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={pending}
        >
          {pending ? "Saving…" : invoice ? "Save changes" : "Create invoice"}
        </Button>
      </form>

      {invoice && (
        <div className="mt-4 border-t border-line pt-4">
          <DeleteButton
            action={deleteInvoice.bind(null, invoice.id)}
            label="Delete invoice"
            confirmText={`Delete invoice ${invoice.number ?? ""}?`}
          />
        </div>
      )}
    </div>
  );
}
