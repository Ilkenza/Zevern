"use client";

/**
 * Everything waiting on a decision, in one card.
 *
 * This was four cards — bills due, entries with no price, budgets gone over, bills
 * coming — each with its own heading, stacked in the order they were written. The count
 * said four and you scrolled past three headings to find them. The rows are the same
 * rows; what went is three card headers and the scroll they cost.
 *
 * The two kinds that can be finished on the spot keep their controls, because that is the
 * whole reason this belongs on the screen you open every morning rather than being a set
 * of links to elsewhere.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import {
  postAllDueFixed,
  postRecurring,
  priceTransaction,
  removeTransaction,
  skipRecurring,
} from "@/app/(app)/private/actions";
import { MoneyField } from "@/components/ui/MoneyField";
import { buttonClasses } from "@/components/ui/Button";
import { MoreRow } from "@/components/ui/MoreRow";
import { useMoney } from "@/lib/money/currency";
import { formatAmount } from "@/lib/money";
import type { Need } from "./needs-you";
import type { RecurringRow } from "@/lib/types";
import type { DueSoon } from "@/lib/data/money";

/** How many of the automatically recorded ones get named before it becomes a count. */
const AUTO_NAMED = 3;

/** A fixed rule entered before its date books itself; anything else waits for a tap. */
function booksItself(item: RecurringRow): boolean {
  return (
    !item.variable &&
    Number(item.amount) > 0 &&
    String(item.created_at).slice(0, 10) < item.next_on
  );
}

function BookRow({ need, rule }: { need: Need; rule: RecurringRow }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();
  const hasDefault = !rule.variable && Number(rule.amount) > 0;

  const book = () => {
    const typed = Number(amount.replace(",", "."));
    const value = typed > 0 ? typed : hasDefault ? Number(rule.amount) : 0;
    if (!(value > 0)) return;
    startTransition(async () => {
      await postRecurring(rule.id, value);
      setAmount("");
      router.refresh();
    });
  };

  return (
    <div className="need-line is-late">
      <span className="need-dot" aria-hidden />
      <span className="need-say">
        <span className="need-title">{need.title}</span>
        <span className="need-detail">{need.detail}</span>
      </span>
      <span className="need-do">
        <MoneyField
          className="contents"
          name="amount"
          value={amount}
          onValueChange={setAmount}
          placeholder={hasDefault ? "Different amount?" : `Amount ${rule.currency}`}
          aria-label={`Amount for ${rule.name}`}
          inputClassName="w-32 rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-[12.5px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring focus:outline-none"
        />
        <button
          type="button"
          onClick={book}
          disabled={pending}
          className={buttonClasses("primary", "px-2.5 py-1.5 text-[12px]")}
        >
          {pending ? "…" : "Book"}
        </button>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await skipRecurring(rule.id);
              router.refresh();
            })
          }
          disabled={pending}
          className={buttonClasses("ghost", "px-2 py-1.5 text-[12px]")}
        >
          Skip
        </button>
      </span>
    </div>
  );
}

function PriceRow({ need, tx }: { need: Need; tx: { id: string; currency: string } }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const typed = Number(amount.replace(",", ".")) || 0;

  return (
    <div className="need-line is-quiet">
      <span className="need-dot" aria-hidden />
      <span className="need-say">
        <span className="need-title">{need.title}</span>
        <span className="need-detail">{error ?? need.detail}</span>
      </span>
      <span className="need-do">
        <MoneyField
          className="contents"
          name="amount"
          value={amount}
          onValueChange={setAmount}
          placeholder={`Price ${tx.currency}`}
          aria-label={`Price for ${need.title}`}
          inputClassName="w-32 rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-[12.5px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring focus:outline-none"
        />
        <button
          type="button"
          disabled={pending || !(typed > 0)}
          onClick={() =>
            startTransition(async () => {
              const result = await priceTransaction(tx.id, typed);
              if (result?.error) {
                setError(result.error);
                return;
              }
              setError(null);
              setAmount("");
              router.refresh();
            })
          }
          className={buttonClasses("primary", "px-2.5 py-1.5 text-[12px]")}
        >
          {pending ? "…" : "Save"}
        </button>
        {/*
          The honest second option. Some of these are never going to get a price — the
          receipt is gone, it was a friend's round, it did not really happen. Leaving them
          to sit here forever is how a band stops being read, so the way out is next to
          the way to finish it.
        */}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await removeTransaction(tx.id);
              if (result?.error) setError(result.error);
              else router.refresh();
            })
          }
          className={buttonClasses("ghost", "px-2 py-1.5 text-[12px]")}
        >
          Remove
        </button>
      </span>
    </div>
  );
}

export function NeedsList({
  needs,
  hidden,
  due,
  soon,
  free,
}: {
  needs: Need[];
  hidden: number;
  /** Every rule that has fallen due, including the ones that book themselves. */
  due: RecurringRow[];
  soon: DueSoon;
  free: number;
}) {
  const { fmt, fmtShort } = useMoney();
  const router = useRouter();
  const posted = useRef(false);
  const [busy, setBusy] = useState(false);

  const auto = due.filter(booksItself);

  /*
    Fixed rules entered ahead of time book themselves the first time this screen is opened
    after they fall due.

    This is a behaviour, not a display, and it used to live inside the "Due now" card — so
    folding that card into this list had to bring it along or scheduled payments would
    quietly stop recording. The line below is the only trace it leaves, and it says which.
  */
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

  const after = free - soon.total;

  /*
    Nothing waiting, nothing booked — nothing drawn.

    The fortnight band used to keep this card alive on a day with no needs in it, which
    put a total for the next two weeks under a heading that says "Needs you" and above a
    sentence saying nothing does. It is real information and it has a screen: Upcoming.
    Here it earns its place only beside the things it is context for.

    The hook above still runs on the days this returns null, which is the point — the
    scheduled payments book themselves whether or not there is a card to say so.
  */
  if (needs.length === 0 && auto.length === 0) return null;

  return (
    <div className="zv-panel overflow-hidden rounded-card border border-line bg-surface">
      {(auto.length > 0 || busy) && (
        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-[12px] text-muted">
          <Repeat className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">
            {busy
              ? "Recording scheduled payments…"
              : `Recorded automatically: ${auto
                  .slice(0, AUTO_NAMED)
                  .map((f) => `${f.name} ${formatAmount(Number(f.amount), f.currency)}`)
                  .join(", ")}${
                  auto.length > AUTO_NAMED ? ` and ${auto.length - AUTO_NAMED} more` : ""
                }`}
          </span>
        </div>
      )}

      {needs.map((need) => {
        if (need.action.kind === "book") {
          return <BookRow key={need.id} need={need} rule={need.action.rule} />;
        }
        if (need.action.kind === "price") {
          return <PriceRow key={need.id} need={need} tx={need.action.tx} />;
        }
        return (
          <Link key={need.id} href={need.action.href} className={`need-line is-${need.tone}`}>
            <span className="need-dot" aria-hidden />
            <span className="need-say">
              <span className="need-title">{need.title}</span>
              <span className="need-detail">{need.detail}</span>
            </span>
            {/*
              A row about a missing figure cannot print one. `0` would be a measurement
              nobody took, and the dash is the same mark the goals and the trend use for
              "nothing recorded" — one vocabulary for absence across the screen.
            */}
            <span className={`mono need-amt${need.tone === "over" ? " is-over" : ""}`}>
              {need.amount === null ? "—" : fmt(need.amount)}
            </span>
            <span className="need-cta">{need.action.cta}</span>
          </Link>
        );
      })}

      <MoreRow count={hidden} label={`${hidden} more once these are done`} />

      {/*
        The sum and what it leaves, on one line.

        The most useful sentence the old "Due soon" card had, and the only part of it worth
        keeping now the items themselves are rows above: how much is going out over the
        fortnight, and what survives it. When there is not enough the label changes rather
        than the figure growing a minus sign — a shortfall read at a glance as a negative
        is a shortfall read as a typo.

        Rounded, unlike the rows above it, and the difference is not a style choice. Every
        figure in the list is an amount somebody is about to pay, and those are read to the
        dinar. These two are a sum and a remainder — nobody writes a cheque for either, and
        at nine digits the exact one takes a second to read and tells you nothing the
        rounded one did not. The full figures are on the hero, three inches up.
      */}
      {soon.count > 0 && (
        <div className="due-soon-band">
          <span className="due-soon-total" title={fmt(soon.total)}>
            {fmtShort(soon.total)}
          </span>
          <span className="due-soon-when">
            out over {soon.days} days · {soon.count} {soon.count === 1 ? "item" : "items"}
          </span>
          <span
            className={`due-soon-left${after < 0 ? " is-short" : ""}`}
            title={fmt(Math.abs(after))}
          >
            {after < 0 ? `Short by ${fmtShort(-after)}` : `Leaves ${fmtShort(after)} free`}
          </span>
        </div>
      )}
    </div>
  );
}

