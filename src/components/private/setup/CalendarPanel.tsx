"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, Copy, RefreshCw } from "lucide-react";
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
      "Open Google Calendar on a computer — subscriptions cannot be added from the phone app.",
      "In the left column, next to Other calendars, press + and choose From URL.",
      "Paste the address and press Add calendar. It reaches your phone on its own.",
    ],
  },
  {
    app: "Apple Calendar",
    steps: [
      "On iPhone: Calendars, then Add Calendar, then Add Subscription Calendar.",
      "On a Mac: File, then New Calendar Subscription.",
      "Paste the address and set Refresh to every hour, or every day.",
    ],
  },
];

/**
 * The address of the private feed, and everything a person needs to decide whether to
 * hand it to Google.
 *
 * The token is the whole credential, so the copy says that in plain words rather than
 * behind a euphemism: this is a capability URL — the same shape as the "secret address
 * in iCal format" Google hands out for its own private calendars — and anyone holding
 * it can read the list. The one honest mitigation is that replacing it is one press
 * and takes effect at once, so that button is here rather than buried.
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
    <div className="space-y-4 px-4 py-4">
        <p className="text-[12.5px] leading-relaxed text-muted">
          Nothing here reaches you unless you open the app. Subscribe your phone&apos;s calendar
          to the address below and every rule and planned one-off falling due in the next{" "}
          {FEED_DAYS} days turns up as an all-day entry, with a reminder the afternoon before.
          No account to make, no notifications to allow — the calendar you already carry does
          the reminding.
        </p>

        {url ? (
          <>
            <div>
              <div className={cn(caps, "mb-1.5")}>Your private address</div>
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
            </div>

            <div className="rounded-card border border-gold/25 bg-active-bg px-3.5 py-3">
              <div className={cn(caps, "text-gold")}>Treat it like a password</div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                There is no sign-in on that address — the random part of it{" "}
                <b className="text-ink">is</b> the password, the same way Google&apos;s own
                private calendar addresses work. Anyone who ends up holding the link can read
                the list, so keep it out of shared documents, screenshots and repositories.
                If it gets out, replace it below and the old address stops answering.
              </p>
            </div>

            <div className="grid gap-4 min-[640px]:grid-cols-2">
              <div>
                <div className={caps}>What it shows</div>
                <ul className="mt-2 space-y-1.5 text-[12.5px] text-muted">
                  <li>The name of each rule and planned one-off, and what it costs.</li>
                  <li>The dates it falls due, over the next {FEED_DAYS} days.</li>
                  <li>How often it repeats, its category, and how many payments are left.</li>
                </ul>
              </div>
              <div>
                <div className={caps}>What it never shows</div>
                <ul className="mt-2 space-y-1.5 text-[12.5px] text-muted">
                  <li>Your accounts, their balances, or what is available to spend.</li>
                  <li>Anything already spent, any goal, any budget.</li>
                  <li>Anything that could be used to sign in or to write.</li>
                </ul>
              </div>
            </div>

            <div className="grid gap-4 border-t border-line-soft pt-3.5 min-[640px]:grid-cols-2">
              {SUBSCRIBE.map((how) => (
                <div key={how.app}>
                  <div className={caps}>{how.app}</div>
                  <ol className="mt-2 space-y-2 text-[12.5px] text-muted">
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

            <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3.5">
              {confirming ? (
                <>
                  <span className="text-[12.5px] text-muted">
                    Replacing it revokes the old address. Every calendar already subscribed
                    stops updating until you paste the new one in.
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
                    Keep the current one
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
