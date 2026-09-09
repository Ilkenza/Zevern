"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  refreshRatesFromNbs,
  saveRates,
  setDefaultCurrency,
  type MoneyState,
} from "@/app/(app)/private/actions";
import { Button, buttonClasses } from "@/components/ui/Button";
import { CURRENCIES } from "@/lib/money";
import { useDefaultCurrency } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import { SwapLabel, caps } from "./kit";
import { todayISO } from "@/lib/format";

/** A rate is a figure first: big, mono, and editable in place. */
function RateTile({ code, name, value }: { code: string; name: string; value: number }) {
  // Pulling the NBS rate changes this figure while the reader is looking at it.
  // That change is the entire answer to the button they pressed, so the new
  // figure arrives rather than replacing the old one between two frames. It
  // clears itself when the animation ends, so the next pull animates too.
  const [shown, setShown] = useState<{ value: number; landed: boolean }>({ value, landed: false });

  if (shown.value !== value) {
    setShown({ value, landed: true });
  }

  return (
    <label className="setup-rate-tile block rounded-card border border-line bg-surface-2 px-3.5 py-3">
      <span className={caps}>1 {code} in dinars</span>
      <input
        name={name}
        defaultValue={String(value)}
        inputMode="decimal"
        aria-label={`Dinars for one ${code}`}
        onAnimationEnd={() => setShown({ value, landed: false })}
        className={cn(
          "mono mt-1 w-full rounded-ctrl border border-transparent bg-transparent px-1 py-0.5 text-[22px] font-semibold tracking-[-0.5px] text-ink hover:border-line focus:border-gold focus:shadow-ring",
          shown.landed && "zv-figure-in",
        )}
      />
    </label>
  );
}

/**
 * The currency a new entry, rule, goal or account opens on.
 *
 * It sits with the rates because this is the one section about currency, and it is the
 * question the rates below only make sense as an answer to: everything is totalled in
 * dinars, but what you type most often does not have to be.
 */
function DefaultCurrency() {
  const router = useRouter();
  const current = useDefaultCurrency();
  const [pending, startTransition] = useTransition();

  const pick = (code: string) =>
    startTransition(async () => {
      await setDefaultCurrency(code);
      router.refresh();
    });

  return (
    <div className="border-b border-line-soft px-4 py-3.5">
      <span className={caps}>Your currency</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CURRENCIES.map((code) => {
          const on = code === current;
          return (
            <button
              key={code}
              type="button"
              onClick={() => pick(code)}
              disabled={pending || on}
              aria-pressed={on}
              className={cn(
                "mono rounded-pill border px-3 py-1 text-[12px] font-bold transition-colors",
                on
                  ? "border-gold/45 bg-active-bg text-gold-hi"
                  : "border-line text-muted hover:border-line-soft hover:text-ink",
              )}
            >
              {code}
            </button>
          );
        })}
      </div>
      {/* Four lines said one thing: it changes the display, not the records. */}
      <p className="mt-2 text-[11.5px] text-muted">
        Changes what you read. Dinars stay the unit underneath, so nothing recorded moves.
      </p>
    </div>
  );
}

/**
 * The rates, and the currency they are read in.
 *
 * `needed` is the whole of the change he asked for: with everything in dinars there is
 * nothing to convert, and a panel that keeps two boxes and a `not today's, pull the NBS
 * rate' warning in front of somebody who holds no euros is nagging about a number that
 * multiplies nothing. It comes back by itself the moment an account, a thing on the
 * shopping list, or the currency being read is not RSD.
 *
 * The currency picker stays either way. It is how a dinar profile stops being one, so
 * hiding it behind "you have no foreign currency" would lock the door from the inside.
 */
export function RatesPanel({
  eur,
  usd,
  updatedOn,
  needed,
  use,
}: {
  eur: number;
  usd: number;
  updatedOn: string | null;
  /** Whether anything on the profile is held or read in a currency other than dinars. */
  needed: boolean;
  /** How many things today's rate multiplies, and which currencies they are in. */
  use: { count: number; currencies: string[] };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveRates, undefined);
  const [fetching, startFetch] = useTransition();
  const [fetchError, setFetchError] = useState<string | null>(null);

  const today = todayISO();
  const stale = !updatedOn || updatedOn < today;

  const pull = () => {
    setFetchError(null);
    startFetch(async () => {
      const result = await refreshRatesFromNbs();
      if (result?.error) setFetchError(result.error);
      else router.refresh();
    });
  };

  return (
    <div>
      <DefaultCurrency />

      {!needed && (
        <p className="px-4 py-4 text-[12.5px] leading-relaxed text-muted">
          Everything you have is in dinars, so there is nothing to convert and no rate to
          keep up to date. The euro and dollar rates appear here as soon as an account, a
          thing you buy, or the currency above is not RSD.
        </p>
      )}

      <form action={formAction} className="px-4 py-4" hidden={!needed}>
        {/*
          Why the boxes are here, said before they are.

          "Rates aren't needed, my currency is RSD" is a fair thing to think while looking
          at two boxes and a warning that they are out of date — the panel gave no reason
          for existing. It does now, and the reason is a count of the person's own rows: a
          standing rule billed in dollars is converted afresh every month, and it is this
          figure it is multiplied by.
        */}
        {use.count > 0 && (
          <p className="mb-3 text-[12px] leading-relaxed text-muted">
            {use.count === 1 ? "One thing is" : `${use.count} things are`} billed in{" "}
            <b className="mono font-semibold text-ink">{use.currencies.join(" and ")}</b> —
            accounts, standing rules and prices on the shopping list. Every one of them is
            turned into dinars by the {use.currencies.length === 1 ? "rate" : "rates"}{" "}
            below, each time it is read.
          </p>
        )}

        <div className="grid gap-2.5 min-[420px]:grid-cols-2">
          <RateTile code="EUR" name="rate_eur" value={eur} />
          <RateTile code="USD" name="rate_usd" value={usd} />
        </div>

        <p className="mt-3 text-[11.5px] text-faint">
          <span className="mono">
            {updatedOn ? `Rate list of ${updatedOn}` : "No rate list pulled yet"}
          </span>
          {stale && (
            <span className="ml-2 text-draft">
              — not today&apos;s, pull the NBS rate before you trust a converted total
            </span>
          )}
        </p>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={pull}
            disabled={fetching || pending}
            className={buttonClasses("secondary", "money-premium-button")}
          >
            <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
            <SwapLabel pending={fetching} idle="Today's NBS rate" busy="Fetching…" />
          </button>
          <Button type="submit" variant="primary" className="money-premium-button" disabled={pending || fetching}>
            <SwapLabel pending={pending} idle="Save rates" busy="Saving…" />
          </Button>
          {state?.ok && <span className="text-[12px] text-ok">Saved.</span>}
          {state?.error && <span className="text-[12px] text-danger">{state.error}</span>}
          {fetchError && <span className="text-[12px] text-danger">{fetchError}</span>}
        </div>

        {/*
          The old four lines and the four above it were the same paragraph twice, on one
          screen. This is the half the other one does not say: an old entry keeps the rate
          it was written at, so editing these never moves a month that is already closed.
        */}
        <p className="mt-3.5 border-t border-line-soft pt-3 text-[12.5px] text-muted">
          Used for new entries only — past months keep the rate they were written at.
        </p>
      </form>
    </div>
  );
}

/**
 * The badge for the section heading.
 *
 * It lives here rather than in the page because the rule behind it — "not today's" —
 * belongs to the thing being described, and a second copy of that comparison somewhere
 * else is how the badge and the panel start disagreeing about the same date.
 */
export function ratesBadge(updatedOn: string | null) {
  // Local, not UTC — otherwise fresh rates read as stale until 02:00 in Belgrade.
  const today = todayISO();
  const stale = !updatedOn || updatedOn < today;
  return {
    status: (stale ? "draft" : "ok") as "draft" | "ok",
    label: !updatedOn ? "Never pulled" : stale ? "Not today's" : "Today's rate",
  };
}

/* ------------------------------------------------------- the calendar feed */

