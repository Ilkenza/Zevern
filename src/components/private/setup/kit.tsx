"use client";

/**
 * The kit the Setup rows are built from: the column templates that keep three
 * separate <form> elements lining up, the two hooks behind the add-and-save motion,
 * and the small pieces every row repeats.
 *
 * It is one module because these things are only correct together — a row measured
 * with a different template, or animated by a second copy of the same hook, is how
 * the columns start disagreeing.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { MoneyState } from "@/app/(app)/private/actions";
import { cn } from "@/lib/utils";

export const field =
  "rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring";

/** Small caps label — column heads, composer captions, tile labels. */
export const caps = "text-[10.5px] font-semibold uppercase tracking-wider text-faint";

/**
 * One column template, shared by the head strip, every account row and the
 * composer — they are separate <form> elements, so the columns only line up if
 * every one of them is measured the same way. Fixed widths for everything but
 * the name, which takes the slack.
 *
 * Under 420px each field takes its own line; up to 720px they pair up; above
 * that an account is one line, read left to right: what it is, what is in it.
 */
export const accountCols =
  "grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 min-[720px]:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem_7rem_7.5rem] min-[720px]:items-center min-[720px]:gap-3";

export const categoryCols =
  "grid grid-cols-2 items-center gap-2 min-[480px]:grid-cols-[minmax(0,1fr)_auto_7.5rem] min-[480px]:gap-3";

/**
 * How a row leaves: it fades and drifts a little towards the trash it was sent
 * to, so the gap that opens a moment later reads as a row that left rather than
 * a row that vanished. `translate` and not `transform`, because that is the
 * property Tailwind's translate utilities set. `relative` is here for the save
 * confirmation, which is an overlay on the row.
 */
export const rowMotion =
  "relative transition-[opacity,translate] duration-150 ease-out motion-reduce:transition-none";

const NONE: ReadonlySet<string> = new Set();

type Arrivals = { key: string; ids: ReadonlySet<string>; fresh: ReadonlySet<string> };

/**
 * The ids that turned up after the first render — the rows the user just added.
 * Whatever was already on screen when the page loaded is never "new", so
 * arriving at Setup animates nothing; only adding something does.
 *
 * The comparison happens during render, not in an effect: the new row has to
 * carry the class the very first time it paints, or it would sit there for a
 * frame and then start fading in from nothing.
 */
export function useArrived(ids: string[]): ReadonlySet<string> {
  const key = ids.join(",");
  const [seen, setSeen] = useState<Arrivals>(() => ({ key, ids: new Set(ids), fresh: NONE }));

  if (seen.key !== key) {
    setSeen({
      key,
      ids: new Set(ids),
      fresh: new Set(ids.filter((id) => !seen.ids.has(id))),
    });
  }

  return seen.fresh;
}

/**
 * Counts the saves a row has reported. The count is the key on the confirmation,
 * so saving the same row twice replays it instead of leaving a finished
 * animation on screen. A new result from the action is a new object, which is
 * what makes a second identical save countable at all.
 */
export function useSavedPulse(state: MoneyState): number {
  const [seen, setSeen] = useState<{ state: MoneyState; pulse: number }>({ state, pulse: 0 });

  if (seen.state !== state) {
    setSeen({ state, pulse: state?.ok ? seen.pulse + 1 : seen.pulse });
  }

  return seen.pulse;
}

/** The receipt for a save: a tint over the row, held long enough to read, then gone. */
export function SavedFlash() {
  return (
    <span
      aria-hidden="true"
      className="zv-row-saved pointer-events-none absolute inset-0 bg-active-bg"
    />
  );
}

/**
 * The two faces of a button that can be busy, stacked in one grid cell. The
 * button is therefore as wide as the longer label from the start, so "Save"
 * turning into "Saving…" never moves anything next to it. The faces cross-fade;
 * under reduced motion they simply swap.
 */
export function SwapLabel({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  const face =
    "col-start-1 row-start-1 transition-opacity duration-150 ease-out motion-reduce:transition-none";
  return (
    <span className="grid text-center whitespace-nowrap">
      <span aria-hidden={pending} className={cn(face, pending && "opacity-0")}>
        {idle}
      </span>
      <span aria-hidden={!pending} className={cn(face, !pending && "opacity-0")}>
        {busy}
      </span>
    </span>
  );
}

export function RowDelete({
  onDelete,
  label,
  onLeaving,
}: {
  onDelete: () => Promise<void>;
  label: string;
  onLeaving?: (leaving: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={label}
      disabled={pending}
      onClick={() => {
        // The row starts leaving on the click rather than on the answer, so the
        // gap that opens when the data comes back reads as "that one left"
        // instead of as a row that blinked out of existence.
        onLeaving?.(true);
        startTransition(async () => {
          try {
            await onDelete();
          } catch (error) {
            onLeaving?.(false); // it did not leave after all
            throw error;
          }
          router.refresh();
        });
      }}
      className="rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-danger disabled:opacity-50"
    >
      <Trash2 className="h-3.75 w-3.75" />
    </button>
  );
}

/** The line under a panel title: how many of the thing there are. */
export function PanelMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11.5px] font-semibold whitespace-nowrap text-muted">{children}</span>
  );
}

/** Caption above a composer, so adding never looks like editing. */
export function AddCaption({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5">
      <Plus className="h-3.5 w-3.5 text-gold" />
      <span className={caps}>{children}</span>
    </div>
  );
}

export function RowError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 text-[11px] text-danger">{message}</p>;
}

