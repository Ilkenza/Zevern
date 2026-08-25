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
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
        Every figure in the private workspace is shown in this currency, and every new
        entry, rule, plan and goal opens on it. Dinars stay the unit underneath — each
        entry keeps the rate it was written at — so choosing another one changes what
        you read, never what is recorded.
      </p>
    </div>
  );
}

export function RatesPanel({ eur, usd, updatedOn }: { eur: number; usd: number; updatedOn: string | null }) {
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

      <form action={formAction} className="px-4 py-4">
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

        <p className="mt-3.5 border-t border-line-soft pt-3 text-[12.5px] leading-relaxed text-muted">
          Everything is totalled in dinars underneath. These are the rates used to write an
          entry made in euros or dollars, and to show your figures back in the currency
          above. Each entry keeps the rate it was written at, so past months never move
          when you update these.
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
  const today = new Date().toISOString().slice(0, 10);
  const stale = !updatedOn || updatedOn < today;
  return {
    status: (stale ? "draft" : "ok") as "draft" | "ok",
    label: !updatedOn ? "Never pulled" : stale ? "Not today's" : "Today's rate",
  };
}

/* ------------------------------------------------------- the calendar feed */

