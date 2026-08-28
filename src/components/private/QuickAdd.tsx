"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { saveTransaction, type MoneyState } from "@/app/(app)/private/actions";
import { buttonClasses } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";
import { CURRENCIES, rateFor, type Rates } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MoneyAccount, MoneyCategory } from "@/lib/types";
import { useDefaultCurrency, useMoney } from "@/lib/money/currency";

/** Phone-first entry: amount, category, done. Two taps and it is in. */
export function QuickAdd({
  accounts,
  categories,
  rates,
  spentToday,
}: {
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  rates: Rates;
  spentToday: number;
}) {
  const { fmt } = useMoney();
  const fallback = useDefaultCurrency();
  const router = useRouter();
  const [result, setResult] = useState<MoneyState>();
  const [pending, startTransition] = useTransition();

  const [kind, setKind] = useState("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(fallback);
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState(false);

  const visible = categories.filter((c) => c.kind === kind);
  const parsed = Number(amount.replace(",", ".")) || 0;
  /*
    "Bought it, do not know what it cost." An empty box is that answer and only that
    answer — a typed `0` still means zero dinars and is still refused. Money coming in
    always has a figure, so the case exists on the spending side alone.
  */
  const noPrice = kind === "expense" && amount.trim() === "";
  const rate = currency === "RSD" ? 1 : rateFor(currency, rates);

  /* Submitting inside a transition keeps the reset next to the save, so the
     form empties itself the moment the entry lands — no effect, no flicker. */
  const submit = (formData: FormData) => {
    startTransition(async () => {
      const next = await saveTransaction(undefined, formData);
      setResult(next);
      if (!next?.ok) return;
      setAmount("");
      setCategoryId("");
      setTitle("");
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 1800);
    });
  };

  return (
    <div className="mx-auto max-w-140 pb-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
          Quick add
        </h1>
        <div className="flex items-center gap-2">
          <Link href="/private/money" className="text-[12.5px] font-semibold text-gold-hi">
            All entries
          </Link>
          {/*
            Quick add is a whole screen rather than a panel, so it had no X — and the
            way out of a screen you opened by mistake should not be the browser's back
            arrow. Same control, same corner, same size as every panel's.
          */}
          <button
            type="button"
            onClick={() => router.push("/private")}
            aria-label="Close quick add"
            title="Close"
            className="zv-press flex h-9 w-9 items-center justify-center rounded-ctrl border border-line bg-white/[0.045] text-ink hover:border-danger/50 hover:bg-danger-bg hover:text-danger"
          >
            <X className="h-4.5 w-4.5" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      <form action={submit} className="rounded-card border border-line bg-surface p-4">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="category_id" value={categoryId} />
        <input type="hidden" name="account_id" value={accountId} />
        <input type="hidden" name="currency" value={currency} />
        <input type="hidden" name="return_to" value="stay" />

        <div className="mb-3 grid grid-cols-2 gap-1 rounded-ctrl border border-line bg-white/[0.03] p-1">
          {[
            { value: "expense", label: "Spent" },
            { value: "income", label: "Received" },
          ].map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => {
                setKind(k.value);
                setCategoryId("");
              }}
              className={cn(
                "rounded-[6px] py-2 text-[13px] font-bold transition-colors",
                kind === k.value ? "bg-gold text-on-gold" : "text-muted",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>

        <MoneyField
          name="amount"
          value={amount}
          onValueChange={setAmount}
          placeholder="0"
          autoFocus
          required={kind !== "expense"}
          aria-label="Amount"
          inputClassName="mono w-full rounded-ctrl border border-line bg-white/[0.035] px-4 py-4 text-center text-[34px] font-semibold text-ink placeholder:text-faint focus:border-gold focus:shadow-ring focus:outline-none"
        />

        <div className="mt-2 flex items-center justify-center gap-1">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={cn(
                "rounded-pill border px-3 py-1 text-[12px] font-bold transition-colors",
                currency === c ? "border-gold/40 bg-active-bg text-gold" : "border-line text-muted",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        {currency !== "RSD" && parsed > 0 && (
          <p className="mono mt-2 text-center text-[12px] text-muted">≈ {fmt(parsed * rate)}</p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={cn(
                "truncate rounded-ctrl border px-2 py-3 text-[12.5px] font-semibold transition-colors",
                categoryId === c.id
                  ? "border-gold/50 bg-active-bg text-gold"
                  : "border-line text-muted hover:text-ink",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        {accounts.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAccountId(a.id)}
                className={cn(
                  "rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                  accountId === a.id
                    ? "border-gold/40 bg-active-bg text-gold"
                    : "border-line text-muted",
                )}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}

        {/*
          Quick add is two taps and stays two taps, so this is one optional line rather
          than a required field: type what it was if you know, leave it and the entry
          still goes in under its category.
        */}
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder={
            kind === "income"
              ? "Where from? (optional)"
              : noPrice
                ? "What did you buy? (required — there is no price)"
                : "What was it? (optional)"
          }
          aria-label="Name"
          className="zv-field mt-3 w-full rounded-ctrl border border-line bg-white/[0.035] px-3 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring focus:outline-none"
        />

        {result?.error && (
          <p className="mt-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {result?.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || (noPrice ? !title.trim() : parsed <= 0)}
          className={buttonClasses("primary", "mt-4 w-full py-3 text-[15px]")}
        >
          {pending
            ? "Saving…"
            : saved
              ? "Saved"
              : noPrice
                ? "Save without a price"
                : "Save"}
        </button>

        {/*
          Only shown once the amount is actually empty, so the fast path — type the
          figure, tap a category, done — never grows a line explaining a case it is not
          in. Spelling out what "no price" costs you is worth it here: the entry does not
          reach the budget until the figure does, and that should not be a surprise on
          the 30th.
        */}
        {noPrice && (
          <p className="mt-2 text-center text-[11.5px] text-muted">
            Goes in with the name and the date. It counts for nothing until you add the
            price — the overview keeps it in front of you.
          </p>
        )}

        {saved && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-ok">
            <Check className="h-4 w-4" /> Logged. Add another.
          </p>
        )}
      </form>

      <p className="mono mt-3 text-center text-[12px] text-muted">
        Spent today: {fmt(spentToday)}
      </p>
    </div>
  );
}
