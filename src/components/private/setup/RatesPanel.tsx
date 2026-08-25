"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshRatesFromNbs, saveRates, type MoneyState } from "@/app/(app)/private/actions";
import { Button, buttonClasses } from "@/components/ui/Button";
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
              — not today&apos;s, pull the NBS rate before you trust a total in dinars
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
          Everything is totalled in dinars. These are the rates used when you enter something in
          euros or dollars — the rate is stored with each entry, so past months never move when you
          update them here.
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

