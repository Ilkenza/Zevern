"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import { postRecurring, skipRecurring, postAllDueFixed } from "@/app/(app)/private/actions";
import { Panel } from "@/components/ui/Panel";
import { MoreRow } from "@/components/ui/MoreRow";
import { buttonClasses } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";
import { formatAmount } from "@/lib/money";
import type { RecurringRow } from "@/lib/types";

/**
 * How many waiting items the overview shows before it stops.
 *
 * This list clears itself: book the four on screen, the page refreshes, and the next
 * four are there. So a cap costs nothing here — unlike the panels beside it, there is
 * no "all of them" screen being hidden, only an order of work being imposed. Forty
 * amount fields on the first screen you open in the morning is not a to-do list, it is
 * a reason to close the app.
 */
const DUE_SHOWN = 4;

/** Enough names to recognise the batch. Past three it is a paragraph, not a note. */
const AUTO_NAMED = 3;

/**
 * An item books itself only when the amount is known AND it was entered before the
 * date it falls due. Something added today with today's date waits for a tap instead —
 * otherwise saving it would immediately post an entry nobody confirmed.
 */
function booksItself(item: RecurringRow): boolean {
  return (
    !item.variable &&
    Number(item.amount) > 0 &&
    String(item.created_at).slice(0, 10) < item.next_on
  );
}

/** One waiting item: variable ones need an amount, fixed ones may override theirs. */
function DueRow({ item }: { item: RecurringRow }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();

  const hasDefault = !item.variable && Number(item.amount) > 0;

  const book = () => {
    const typed = Number(amount.replace(",", "."));
    const value = typed > 0 ? typed : hasDefault ? Number(item.amount) : 0;
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
          due {item.next_on} ·{" "}
          {item.goal ? (
            <span className="text-held">into {item.goal.name}</span>
          ) : (
            (item.category?.name ?? "No category")
          )}{" "}
          ·{" "}
          {hasDefault
            ? `usually ${formatAmount(Number(item.amount), item.currency)}`
            : "amount changes"}
        </div>
      </div>
      <MoneyField
        className="contents"
        name="amount"
        value={amount}
        onValueChange={setAmount}
        placeholder={hasDefault ? "Different amount?" : `Amount ${item.currency}`}
        aria-label={`Amount for ${item.name}`}
        inputClassName="w-36 rounded-ctrl border border-line bg-white/[0.035] px-3 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring focus:outline-none"
      />
      <button
        type="button"
        onClick={book}
        disabled={pending}
        className={buttonClasses("primary", "px-3 py-1.5")}
      >
        {pending ? "…" : "Record payment"}
      </button>
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await skipRecurring(item.id);
            router.refresh();
          })
        }
        disabled={pending}
        className={buttonClasses("ghost", "px-2 py-1.5")}
      >
        Skip
      </button>
    </div>
  );
}

/**
 * Fixed items entered ahead of time book themselves the first time the page is opened
 * after they fall due. Everything else — variable items, and anything entered today —
 * waits here for a confirmation.
 */
export function DueRecurringPanel({ due }: { due: RecurringRow[] }) {
  const router = useRouter();
  const posted = useRef(false);
  const [busy, setBusy] = useState(false);

  const auto = due.filter(booksItself);
  const waiting = due.filter((d) => !booksItself(d));
  const shown = waiting.slice(0, DUE_SHOWN);

  useEffect(() => {
    if (posted.current || auto.length === 0) return;
    posted.current = true;
    setBusy(true);
    (async () => {
      await postAllDueFixed();
      router.refresh();
      setBusy(false);
    })();
  }, [auto.length, router]);

  if (due.length === 0) return null;

  return (
    <Panel
      title="Due now"
      action={
        <span className="text-[11.5px] text-muted">
          {busy ? "Recording scheduled payments…" : `${waiting.length || auto.length} waiting`}
        </span>
      }
    >
      <div>
        {auto.length > 0 && (
          <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-[12px] text-muted">
            <Repeat className="h-3.5 w-3.5" />
            <span className="min-w-0 truncate">
              Recorded automatically:{" "}
              {auto
                .slice(0, AUTO_NAMED)
                .map((f) => `${f.name} ${formatAmount(Number(f.amount), f.currency)}`)
                .join(", ")}
              {auto.length > AUTO_NAMED && ` and ${auto.length - AUTO_NAMED} more`}
            </span>
          </div>
        )}
        {shown.map((item) => (
          <DueRow key={item.id} item={item} />
        ))}
        <MoreRow
          count={waiting.length - shown.length}
          label={`${waiting.length - shown.length} more once these are done`}
        />
      </div>
    </Panel>
  );
}
