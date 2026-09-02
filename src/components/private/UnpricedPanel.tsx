"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { priceTransaction, removeTransaction } from "@/app/(app)/private/actions";
import { Panel } from "@/components/ui/Panel";
import { MoreRow } from "@/components/ui/MoreRow";
import { buttonClasses } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";
import type { TransactionRow } from "@/lib/types";

/**
 * One entry that went in without a price, and the one field that finishes it.
 *
 * The figure is typed in the currency the entry was logged under, not today's default:
 * a shop in Vienna logged in EUR is finished in EUR, at the rate that was saved with
 * it. Anything else would quietly re-price a past day at today's rate.
 */
function UnpricedRow({ tx }: { tx: TransactionRow }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const typed = Number(amount.replace(",", ".")) || 0;

  const save = () => {
    if (!(typed > 0)) return;
    startTransition(async () => {
      const result = await priceTransaction(tx.id, typed);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setAmount("");
      router.refresh();
    });
  };

  return (
    <div className="border-b border-line-soft px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-ink">
            {tx.title ?? tx.category?.name ?? "—"}
          </div>
          <div className="mono truncate text-[11.5px] text-muted">
            {tx.occurred_on}
            {tx.category?.name && tx.title ? ` · ${tx.category.name}` : ""}
            {tx.account?.name ? ` · ${tx.account.name}` : ""}
          </div>
        </div>
        <MoneyField
          className="contents"
          name="amount"
          value={amount}
          onValueChange={setAmount}
          placeholder={`Price ${tx.currency}`}
          aria-label={`Price for ${tx.title ?? "this entry"}`}
          inputClassName="w-36 rounded-ctrl border border-line bg-white/[0.035] px-3 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring focus:outline-none"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || !(typed > 0)}
          className={buttonClasses("primary", "px-3 py-1.5")}
        >
          {pending ? "…" : "Save"}
        </button>
        {/*
          The honest second option. Some of these are never going to get a price — the
          receipt is gone, it was a friend's round, it did not really happen. Leaving
          them to sit in this panel forever is how a panel stops being read; so the way
          out is here, next to the way to finish it.
        */}
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              // The refresh belongs to DeleteButton's transition, not to a call after
              // the await — see the note there.
              const result = await removeTransaction(tx.id);
              if (result?.error) setError(result.error);
            })
          }
          disabled={pending}
          className={buttonClasses("ghost", "px-2 py-1.5")}
        >
          Remove
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

/**
 * Four at a time, for the same reason "Due now" shows four: the pile clears itself.
 * Price these, the page refreshes, the next four arrive. Nothing is hidden that some
 * other screen would have shown — there is no screen for unpriced entries but this one.
 */
const PRICE_SHOWN = 4;

/**
 * Everything bought but not yet priced.
 *
 * This is the second half of a two-part entry, and the app owes you a place to finish
 * it. Without one, "save it without the price" is just a way of losing a purchase: it
 * would sit in the ledger counting for nothing, and no screen would ever bring it up
 * again. The panel sits on the overview beside "Due now" for the same reason that one
 * does — it is a small pile of things only you can clear, and it is on the first screen
 * you open.
 *
 * It renders nothing when the pile is empty, which is most days.
 */
export function UnpricedPanel({ entries }: { entries: TransactionRow[] }) {
  if (entries.length === 0) return null;

  return (
    <Panel
      title="Missing transaction amounts"
      action={
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
          <ReceiptText className="h-3.5 w-3.5" />
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      }
    >
      <div>
        {entries.slice(0, PRICE_SHOWN).map((tx) => (
          <UnpricedRow key={tx.id} tx={tx} />
        ))}
        <MoreRow
          count={entries.length - PRICE_SHOWN}
          label={`${entries.length - PRICE_SHOWN} more once these are priced`}
        />
      </div>
    </Panel>
  );
}
