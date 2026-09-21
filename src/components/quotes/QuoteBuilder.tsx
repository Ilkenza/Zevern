"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { saveQuote, type QuoteFormState } from "@/app/(app)/quotes/actions";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Button, buttonClasses } from "@/components/ui/Button";
import { CURRENCY_OPTIONS, QUOTE_STATUS_OPTIONS } from "@/lib/status";
import { quoteTotal } from "@/lib/quotes/total";
import { formatMoney } from "@/lib/format";
import type { QuoteItem, QuoteWithClient, ServiceItem } from "@/lib/types";

type ClientOption = { id: string; name: string };

export function QuoteBuilder({
  quote,
  clients,
  catalog,
}: {
  quote?: QuoteWithClient;
  clients: ClientOption[];
  catalog: ServiceItem[];
}) {
  const [state, formAction, pending] = useActionState<QuoteFormState, FormData>(
    saveQuote,
    undefined,
  );
  const [currency, setCurrency] = useState(quote?.currency ?? "EUR");
  const [items, setItems] = useState<QuoteItem[]>(quote?.items ?? []);

  // Price for the currently-selected quote currency (one catalog item holds all three).
  const priceFor = (it: ServiceItem) => {
    const raw =
      currency === "RSD"
        ? it.price_rsd
        : currency === "USD"
          ? it.price_usd
          : it.price_eur;
    return Number(raw) || 0;
  };

  const addFromCatalog = (id: string) => {
    const it = catalog.find((c) => c.id === id);
    if (it)
      setItems((p) => [...p, { label: it.label, price: priceFor(it), qty: 1 }]);
  };
  const addCustom = () =>
    setItems((p) => [...p, { label: "", price: 0, qty: 1 }]);
  const update = (i: number, patch: Partial<QuoteItem>) =>
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) =>
    setItems((p) => p.filter((_, idx) => idx !== i));

  const total = quoteTotal(items);
  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));
  const cellInput =
    "rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-[13px] text-ink focus:border-gold focus:shadow-ring focus:outline-none";

  return (
    <form action={formAction} className="mx-auto max-w-225 space-y-5">
      {quote && <input type="hidden" name="id" value={quote.id} />}
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field
          label="Title"
          name="title"
          defaultValue={quote?.title ?? ""}
          placeholder="Website for Prestige"
          required
        />
        <Select
          label="Client"
          name="client_id"
          defaultValue={quote?.client_id ?? ""}
          placeholder="No client"
          options={clientOptions}
        />
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
          defaultValue={quote?.status ?? "draft"}
          options={QUOTE_STATUS_OPTIONS}
        />
      </div>

      {/*
        One line per item on a wide screen, two on a phone.

        Five things in a row — name, price, quantity, amount, remove — need about 420px, and
        a phone gives this box 348. The box clips, so the amount and the remove button were
        simply not there: a line could be added on a phone but not checked or taken out
        again. Under `sm` the name takes the first line and the figures the second, read as
        a sum: `price × qty = amount`.
      */}
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
          <span className="flex-1">Item</span>
          <span className="hidden w-24 text-right sm:inline">Price</span>
          <span className="hidden w-14 text-right sm:inline">Qty</span>
          <span className="hidden w-24 text-right sm:inline">Amount</span>
          <span className="hidden w-6 sm:inline" />
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12.5px] text-muted">
            No items yet — add from catalog or a custom line.
          </div>
        ) : (
          items.map((it, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2 last:border-b-0 sm:flex-nowrap"
            >
              <input
                value={it.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Feature"
                aria-label="Item"
                className={`${cellInput} w-full min-w-0 sm:w-auto sm:flex-1`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={it.price}
                onChange={(e) => update(i, { price: Number(e.target.value) })}
                aria-label="Price"
                className={`mono ${cellInput} w-24 text-right`}
              />
              <span aria-hidden="true" className="text-[12px] text-faint sm:hidden">
                ×
              </span>
              <input
                type="number"
                min="1"
                value={it.qty}
                onChange={(e) => update(i, { qty: Number(e.target.value) })}
                aria-label="Quantity"
                className={`mono ${cellInput} w-14 text-right`}
              />
              <span className="mono ml-auto text-right text-[13px] whitespace-nowrap text-ink sm:ml-0 sm:w-24">
                <span aria-hidden="true" className="text-faint sm:hidden">
                  ={" "}
                </span>
                {formatMoney(it.price * it.qty, currency)}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove line"
                className="w-6 cursor-pointer text-faint transition-colors hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          <select
            onChange={(e) => {
              if (e.target.value) {
                addFromCatalog(e.target.value);
                e.target.value = "";
              }
            }}
            aria-label="Add from catalog"
            className="w-full min-w-0 max-w-full rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-2 text-[12.5px] text-ink scheme-dark focus:border-gold focus:shadow-ring focus:outline-none sm:w-auto"
          >
            <option value="" className="bg-[#1A1D24] text-[#ECEEF2]">
              + Add from catalog ({currency})…
            </option>
            {catalog.map((c) => (
              <option
                key={c.id}
                value={c.id}
                className="bg-[#1A1D24] text-[#ECEEF2]"
              >
                {c.category ? `${c.category} · ` : ""}
                {c.label} —{" "}
                {priceFor(c) > 0
                  ? formatMoney(priceFor(c), currency)
                  : "no price"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addCustom}
            className={buttonClasses("secondary")}
          >
            <Plus className="h-4 w-4" />
            Custom line
          </button>
        </div>

        {/* `ml-auto` keeps it on the right when the row wraps on a phone. */}
        <div className="ml-auto text-right">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            Total
          </div>
          <div className="mono text-[20px] font-bold text-ink">
            {formatMoney(total, currency)}
          </div>
        </div>
      </div>

      {state?.error && (
        <p className="rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save quote"}
        </Button>
        <Link href="/quotes" className={buttonClasses("secondary")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
