"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, ChevronRight, Copy, RefreshCw } from "lucide-react";
import { generateCalendarToken } from "@/app/(app)/private/calendar-actions";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { SwapLabel, caps } from "./kit";

/** How far ahead the feed reaches — the same window the route serves. */
const FEED_DAYS = 120;

const SUBSCRIBE: { app: string; steps: string[] }[] = [
  {
    app: "Google Calendar",
    steps: [
      "On a computer — the phone app cannot add subscriptions.",
      "Other calendars → + → From URL.",
      "Paste, then Add calendar.",
    ],
  },
  {
    app: "Apple Calendar",
    steps: [
      "iPhone: Calendars → Add Calendar → Add Subscription Calendar.",
      "Mac: File → New Calendar Subscription.",
      "Paste, then set Refresh to hourly.",
    ],
  },
];

/**
 * The address of the private feed, and the little a person needs in order to decide
 * whether to hand it to Google.
 *
 * This panel used to explain itself at length: an opening paragraph, a boxed paragraph
 * about the token being a password, six bullets of what it does and does not carry, and
 * six numbered steps — all open at once, above one button. Every sentence was true and
 * the screen was unreadable, which makes the true sentences worthless: a wall of prose
 * over a control is read as decoration and skipped, warning and all.
 *
 * So it says the same things in a tenth of the words, and the part nobody needs twice —
 * how to paste a URL into a calendar app — is folded away until it is asked for. The
 * warning survives because it is the one line here that changes what somebody does.
 */
export function CalendarPanel({ origin, token: saved }: { origin: string; token: string | null }) {
  const [token, setToken] = useState<string | null>(saved);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = token ? `${origin}/api/calendar/${token}` : null;

  const generate = () =>
    startTransition(async () => {
      setError(null);
      const result = await generateCalendarToken();
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.token) {
        setToken(result.token);
        setConfirming(false);
        setCopied(false);
        setFresh(true);
      }
    });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Copy failed — select the address and copy it by hand.");
    }
  };

  return (
    <div className="space-y-3.5 px-4 py-4">
      {url ? (
        <>
          <div className="flex flex-col gap-2 min-[560px]:flex-row min-[560px]:items-stretch">
            <code
              onAnimationEnd={() => setFresh(false)}
              className={cn(
                "mono min-w-0 flex-1 rounded-ctrl border border-line bg-white/3 px-3 py-2 text-[12px] break-all text-ink",
                fresh && "zv-figure-in",
              )}
            >
              {url}
            </code>
            <Button
              type="button"
              variant="primary"
              onClick={copy}
              className="shrink-0 px-3 py-1.5 text-[12.5px]"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <SwapLabel pending={copied} idle="Copy" busy="Copied" />
            </Button>
          </div>

          {/*
            One line, because it is the only line here that changes a decision. The old
            version made the same point over four lines inside a coloured box, which is
            how a warning gets skipped.
          */}
          <p className="rounded-ctrl border border-gold/25 bg-active-bg px-3 py-2 text-[12.5px] text-muted">
            <b className="text-gold">Treat it like a password.</b> No sign-in — the link
            itself is the key. Replace it below and the old one stops answering.
          </p>

          <dl className="grid gap-x-6 gap-y-1 text-[12.5px] min-[560px]:grid-cols-[auto_1fr]">
            <dt className={caps}>Shows</dt>
            <dd className="text-muted">
              Name, cost, date and how often — {FEED_DAYS} days ahead.
            </dd>
            <dt className={caps}>Never</dt>
            <dd className="text-muted">
              Balances, spending, goals, budgets, or anything that can sign in or write.
            </dd>
          </dl>

          {/*
            Folded, because it is read once and never again. `details` rather than state:
            the browser already does this, and it works before hydration.
          */}
          <details className="group border-t border-line-soft pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-semibold text-muted hover:text-ink">
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              How to subscribe
            </summary>
            <div className="mt-3 grid gap-4 min-[640px]:grid-cols-2">
              {SUBSCRIBE.map((how) => (
                <div key={how.app}>
                  <div className={caps}>{how.app}</div>
                  <ol className="mt-1.5 space-y-1 text-[12.5px] text-muted">
                    {how.steps.map((step, i) => (
                      <li key={step} className="flex gap-2.5">
                        <span className="mono shrink-0 text-[11.5px] text-faint">{i + 1}</span>
                        <span className="min-w-0">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
            {confirming ? (
              <>
                <span className="text-[12.5px] text-muted">
                  Calendars already subscribed stop updating.
                </span>
                <Button
                  type="button"
                  variant="danger"
                  onClick={generate}
                  disabled={pending}
                  className="px-3 py-1.5 text-[12.5px]"
                >
                  <SwapLabel pending={pending} idle="Replace it" busy="Replacing…" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="px-3 py-1.5 text-[12.5px]"
                >
                  Keep it
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirming(true)}
                className="px-3 py-1.5 text-[12.5px]"
              >
                <RefreshCw className="h-4 w-4" />
                Replace the address
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="primary" onClick={generate} disabled={pending}>
            <CalendarClock className="h-4 w-4" />
            <SwapLabel pending={pending} idle="Create the address" busy="Creating…" />
          </Button>
          <span className="text-[12.5px] text-faint">
            Nothing is published until you press this.
          </span>
        </div>
      )}

      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

/** The badge for the section heading — see the note on `ratesBadge`. */
export function calendarBadge(token: string | null) {
  return {
    status: (token ? "ok" : "draft") as "ok" | "draft",
    label: token ? "Address live" : "Not set up",
  };
}
