"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight, PartyPopper } from "lucide-react";
import { hideOnboarding } from "@/app/(app)/actions";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { Onboarding } from "@/lib/data/onboarding";

/** Circumference of the r=26 ring, so the dash offset can be a plain fraction of it. */
const RING = 2 * Math.PI * 26;

function ProgressRing({ done, total }: { done: number; total: number }) {
  const fraction = total === 0 ? 0 : done / total;

  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 60 60" className="h-16 w-16 -rotate-90" aria-hidden="true">
        <circle cx="30" cy="30" r="26" fill="none" strokeWidth="5" className="stroke-white/8" />
        <circle
          cx="30"
          cy="30"
          r="26"
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          className="stroke-gold transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - fraction)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="mono text-[13px] font-semibold text-ink">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

/**
 * The first thing a new account sees. Every step is answered from real data, so it
 * ticks itself off as the work gets done rather than asking anyone to mark it.
 */
export function GettingStarted({ onboarding }: { onboarding: Onboarding }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { steps, done, total, complete } = onboarding;

  const dismiss = () =>
    startTransition(async () => {
      await hideOnboarding();
      router.refresh();
    });

  // The next unfinished step is the one worth pointing at; the rest stay visible
  // so the whole path is legible from the first minute.
  const next = steps.find((s) => !s.done);

  return (
    <section
      aria-labelledby="getting-started-heading"
      className="overflow-hidden rounded-card border border-line bg-surface"
    >
      <div className="flex flex-wrap items-center gap-4 border-b border-line-soft px-4 py-4 sm:px-5">
        <ProgressRing done={done} total={total} />

        <div className="min-w-0 flex-1">
          <h2
            id="getting-started-heading"
            className="font-display text-[17px] font-bold tracking-[-0.3px] text-ink"
          >
            {complete ? "That is the whole loop" : "Set up your workspace"}
          </h2>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
            {complete ? (
              <>
                You have taken a lead all the way to an invoice. Nothing here is left to
                explain — this card is done.
              </>
            ) : (
              <>
                Six steps, each one a real piece of work rather than a tour.{" "}
                {next && <span className="text-ink">Next: {next.title.toLowerCase()}.</span>}
              </>
            )}
          </p>
        </div>

        {complete ? (
          <button
            type="button"
            onClick={dismiss}
            disabled={pending}
            className={buttonClasses("primary")}
          >
            <PartyPopper className="h-4 w-4" />
            {pending ? "…" : "Clear this"}
          </button>
        ) : (
          <button
            type="button"
            onClick={dismiss}
            disabled={pending}
            className="text-[12px] font-semibold text-faint transition-colors hover:text-muted"
          >
            {pending ? "…" : "Hide"}
          </button>
        )}
      </div>

      <ol className="divide-y divide-line-soft">
        {steps.map((step) => {
          const isNext = !complete && step.key === next?.key;
          return (
            <li
              key={step.key}
              className={cn(
                "flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5",
                isNext && "bg-active-bg",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border",
                  step.done
                    ? "border-transparent bg-ok text-[#10231a]"
                    : isNext
                      ? "border-gold text-gold"
                      : "border-line text-faint",
                )}
              >
                {step.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>

              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-[13.5px] font-semibold",
                    step.done ? "text-muted line-through decoration-line" : "text-ink",
                  )}
                >
                  {step.title}
                </div>
                {!step.done && (
                  <div className="text-[11.5px] leading-relaxed text-muted">{step.detail}</div>
                )}
              </div>

              {step.done ? (
                <span className="mono text-[11px] uppercase tracking-wider text-ok">Done</span>
              ) : (
                <Link
                  href={step.href}
                  className={buttonClasses(isNext ? "primary" : "secondary", "px-3 py-1.5")}
                >
                  {step.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
