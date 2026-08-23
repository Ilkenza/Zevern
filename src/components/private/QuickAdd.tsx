"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { saveTransaction, type MoneyState } from "@/app/(app)/private/actions";
import { buttonClasses } from "@/components/ui/Button";
import { CURRENCIES, formatRsd, rateFor, type Rates } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MoneyAccount, MoneyCategory } from "@/lib/types";

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
  const router = useRouter();
  const [result, setResult] = useState<MoneyState>();
  const [pending, startTransition] = useTransition();

  const [kind, setKind] = useState("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("RSD");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [saved, setSaved] = useState(false);

  const visible = categories.filter((c) => c.kind === kind);
  const parsed = Number(amount.replace(",", ".")) || 0;
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
        <Link href="/private/money" className="text-[12.5px] font-semibold text-gold-hi">
          All entries
        </Link>
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

        <input
          name="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          autoFocus
          required
          aria-label="Amount"
          className="mono w-full rounded-ctrl border border-line bg-white/[0.035] px-4 py-4 text-center text-[34px] font-semibold text-ink placeholder:text-faint focus:border-gold focus:outline-none"
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
          <p className="mono mt-2 text-center text-[12px] text-muted">≈ {formatRsd(parsed * rate)}</p>
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
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: c.color ?? "#565c6b" }}
              />
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

        {result?.error && (
          <p className="mt-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {result?.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || parsed <= 0}
          className={buttonClasses("primary", "mt-4 w-full py-3 text-[15px]")}
        >
          {pending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>

        {saved && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-ok">
            <Check className="h-4 w-4" /> Logged. Add another.
          </p>
        )}
      </form>

      <p className="mono mt-3 text-center text-[12px] text-muted">
        Spent today: {formatRsd(spentToday)}
      </p>
    </div>
  );
}
