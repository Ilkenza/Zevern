"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import { postRecurring, skipRecurring, postAllDueFixed } from "@/app/(app)/private/actions";
import { Panel } from "@/components/ui/Panel";
import { buttonClasses } from "@/components/ui/Button";
import { formatAmount } from "@/lib/money";
import type { RecurringRow } from "@/lib/types";

function VariableRow({ item }: { item: RecurringRow }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();

  const book = () => {
    const value = Number(amount.replace(",", "."));
    if (!(value > 0)) return;
    startTransition(async () => {
      await postRecurring(item.id, value);
      setAmount("");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold text-ink">{item.name}</div>
        <div className="mono text-[11.5px] text-muted">
          due {item.next_on} · {item.category?.name ?? "No category"} · amount changes
        </div>
      </div>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        placeholder={`Amount ${item.currency}`}
        aria-label={`Amount for ${item.name}`}
        className="w-32 rounded-ctrl border border-line bg-white/[0.035] px-3 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-gold focus:outline-none"
      />
      <button
        type="button"
        onClick={book}
        disabled={pending}
        className={buttonClasses("primary", "px-3 py-1.5")}
      >
        {pending ? "…" : "Book"}
      </button>
      <button
        type="button"
        onClick={() => startTransition(async () => {
          await skipRecurring(item.id);
          router.refresh();
        })}
        disabled={pending}
        className={buttonClasses("ghost", "px-2 py-1.5")}
      >
        Skip
      </button>
    </div>
  );
}

/**
 * Fixed items book themselves the first time the page is opened after they fall due;
 * variable ones (struja, voda) wait here for a number.
 */
export function DueRecurringPanel({ due }: { due: RecurringRow[] }) {
  const router = useRouter();
  const posted = useRef(false);
  const [busy, setBusy] = useState(false);

  const fixed = due.filter((d) => !d.variable && Number(d.amount) > 0);
  const variable = due.filter((d) => d.variable || Number(d.amount) <= 0);

  useEffect(() => {
    if (posted.current || fixed.length === 0) return;
    posted.current = true;
    setBusy(true);
    (async () => {
      await postAllDueFixed();
      router.refresh();
      setBusy(false);
    })();
  }, [fixed.length, router]);

  if (due.length === 0) return null;

  return (
    <Panel
      title="Due now"
      action={
        <span className="text-[11.5px] text-muted">
          {busy ? "Booking fixed items…" : `${variable.length || fixed.length} waiting`}
        </span>
      }
    >
      <div>
        {fixed.length > 0 && (
          <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-[12px] text-muted">
            <Repeat className="h-3.5 w-3.5" />
            {fixed.length} fixed{" "}
            {fixed.length === 1 ? "item is" : "items are"} being booked automatically (
            {fixed.map((f) => `${f.name} ${formatAmount(Number(f.amount), f.currency)}`).join(", ")}
            ).
          </div>
        )}
        {variable.map((item) => (
          <VariableRow key={item.id} item={item} />
        ))}
      </div>
    </Panel>
  );
}
