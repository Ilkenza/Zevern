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

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
/*
  An account row, at three widths.

  It used to be one column below 420px, and a phone is 360. That put every one of the
  five controls on a line of its own with its own label above it — name, then `Bank
  account`, then `RSD`, then `BALANCE` and a field — five rows and a lot of air for one
  account, eight times down the page. It was not broken; it was unreadable, which is
  worse, because nothing about it looks like a fault to be reported.

  Two columns from the start instead. The name spans them, because a name is the row's
  subject and wants the width; type and currency sit side by side, which is how they are
  read anyway ("bank account, in dinars"); the balance takes its own full line, because
  it is the figure and the figure gets room. From 720px the desktop table takes over
  unchanged.
*/
export const accountCols =
  "grid grid-cols-2 gap-2 min-[720px]:grid-cols-[minmax(0,1fr)_8.5rem_5.5rem_11rem_9.5rem] min-[720px]:items-center min-[720px]:gap-3";

/*
  The composer's own two columns: the name, and the button that files it.

  It used to share a template with the saved categories, and that is what put a phantom
  7.5rem column at the end of every saved row — a track sized for controls the composer
  does not have. They are no longer the same shape anyway: the saved ones are tiles in a
  grid, and this is the single full-width line underneath them.
*/
export const categoryAddCols =
  "grid grid-cols-1 gap-2 min-[480px]:grid-cols-[minmax(0,1fr)_9rem] min-[480px]:items-center min-[480px]:gap-3";

/**
 * Whether anything has ever been filed here.
 *
 * It used to be the name's first letter in a 26px box, and the letter was never worth
 * its room: it is the first character of the word printed beside it, so the box repeated
 * what the row already said and did it sixty times down a grid, which reads as a wall of
 * boxes before it reads as anything. The one fact in there was the ring — gold when the
 * ledger has entries under this name, plain when it has none and nothing would be lost
 * by removing it.
 *
 * So the box went and the fact stayed, as the rail it always was underneath: a lit edge
 * on what is in use, an unlit one on what is not. Same column to scan down, none of the
 * glyphs.
 */
export function RowMark({ used }: { used: boolean }) {
  return <span className={cn("setup-mark", used && "is-used")} aria-hidden="true" />;
}

/**
 * What has been filed here — the fact that tells a real category from a typo, and the one
 * that says whether removing it would lose anything.
 */
export function RowUses({ count }: { count: number }) {
  // Nothing to say when nothing has been filed: the mark beside it is already unlit, and
  // a tile that spells out "not used yet" fifty times is a wall of the same sentence.
  if (count === 0) return <span className="setup-uses is-empty" aria-hidden="true" />;
  return (
    <span className="setup-uses mono" title={`${count} ${count === 1 ? "entry" : "entries"}`}>
      {count}
    </span>
  );
}

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
 * What a composer is holding, emptied only when a row was actually made.
 *
 * React clears a `<form action>` as soon as its action lands — every time, refused or
 * not. So a name the app had just turned down went out of the box together with the
 * complaint about it, and trying again meant typing the whole thing a second time. The
 * fields are driven from here instead, and here empties on the one thing that means the
 * row exists: `ok` coming back.
 *
 * Reset while rendering rather than from an effect, the same way `useSavedPulse` below
 * counts saves — an effect that sets state runs a beat late, so the box would paint the
 * old text once before clearing it.
 */
export function useComposer<T extends object>(
  state: MoneyState,
  empty: T,
): [T, (patch: Partial<T>) => void] {
  const [held, setHeld] = useState<{ seen: MoneyState; values: T }>({
    seen: state,
    values: empty,
  });

  if (held.seen !== state) {
    setHeld({ seen: state, values: state?.ok ? empty : held.values });
  }

  const put = (patch: Partial<T>) =>
    setHeld((h) => ({ seen: h.seen, values: { ...h.values, ...patch } }));

  return [held.values, put];
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

/**
 * A row that commits when you leave it, instead of asking you to press Save.
 *
 * Setup renders one row per account and one per category, and each carried its own
 * Save button — seventeen of them in a single column on a real account, all identical,
 * all gold-adjacent, none of them telling you anything. A Save button that is always
 * there is not an affordance, it is furniture: you cannot tell from it whether this
 * row has unsaved work, which is the only question it could usefully answer.
 *
 * So the button appears only while the row is dirty, and the row saves itself when
 * focus leaves it. Two details make that safe:
 *
 *   - `relatedTarget` is checked against the form. Tabbing from the name field to the
 *     colour swatch, or clicking the bin, is movement *within* the row, and a row does
 *     not commit while you are still working inside it.
 *   - Nothing happens unless something actually changed. Clicking into a row and out
 *     again fires no action, so the ledger is not rewritten by a stray click.
 *
 * `enabled` is false for the composer at the bottom of each list: adding a thing is a
 * decision, and a half-typed new category must never save itself because the phone
 * rang.
 */
export function useRowCommit(enabled: boolean, submit?: (data: FormData) => void) {
  const [dirty, setDirty] = useState(false);

  /*
    Sent to the action by hand, rather than by submitting the form element.

    React resets a `<form action={...}>` once its action succeeds, and a reset does not
    put a select back to the value it is showing — it puts it back to the option carrying
    the `selected` attribute, and a React-rendered `<option>` carries none. So the reset
    lands on the *first* option, which on this row is `Not food or drink'. React sees no
    state change and therefore does not re-render, so nothing corrects the box: the
    database has `Food', the row has `Food' in its head, and the screen says otherwise
    until the page is reloaded.

    That is the whole of "sačuva se food i drink ali moram da refrešam", measured: the
    box read `food' at 300ms and `other' at 1,200 — the moment the action came back —
    while the server payload for that same row already said `food'.

    Dispatching the action directly is the same call by another road, and React has no
    form submission to tidy up afterwards.
  */
  const send = (form: HTMLFormElement | null) => {
    if (!form) return;
    if (submit) submit(new FormData(form));
    else form.requestSubmit();
    setDirty(false);
  };

  const onInput = () => {
    if (enabled) setDirty(true);
  };

  const onBlur = (event: React.FocusEvent<HTMLFormElement>) => {
    if (!enabled || !dirty) return;
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    send(event.currentTarget);
  };

  /*
    A dropdown saves the moment it is answered, rather than waiting to be left.

    Typing is unfinished until you stop — that is what `onBlur` above is for, and it is
    right for a name or a price. Picking from a list is not: the answer is complete at the
    click, there is nothing more to add to it, and waiting for focus to leave makes the
    save depend on where the person happens to click next.

    Which is how `Food' would not stick. Focus stays on a select after you choose, so
    nothing was submitted; and on a native menu the browser's own focus handling around
    the popup can spend the blur before the choice is even made — the form then commits
    the old value and marks itself clean, and the choice that follows has nothing left to
    trigger it. Reported as "neće da se sačuva kao food ili drink", and true of the
    currency and the category too; they had simply been luckier.
  */
  const onPick = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!enabled) return;
    // The DOM already holds the new value, so the FormData this builds is the answer —
    // no need to wait a render for React state to catch up.
    send(event.currentTarget.form);
  };

  return { dirty, onInput, onBlur, onPick };
}

/**
 * A dropdown's value: what was just picked, or failing that what the row says.
 *
 * Neither half works alone, and both were tried.
 *
 * Uncontrolled — `defaultValue` — looks right and is not: React re-applies the default on
 * every *update* of a select, not only on mount. So the row saves, something re-renders
 * before the fresh server props have landed, and the control snaps back to the old answer.
 * Reported as "sačuva se food i drink ali moram da refrešam": the database had it, the
 * screen did not, and only a reload could tell you which was true.
 *
 * Controlled off state seeded once from props has the opposite fault: the seed is taken at
 * mount and never looked at again, so a remount after a save shows whatever the props held
 * at that instant — the control disagreeing with the row it stands for, in the other
 * direction.
 *
 * So: the pick wins while there is one, and the row is the answer the rest of the time. A
 * remount clears the pick and falls back to the row, which by then is the saved value.
 */
export function usePicked(stored: string) {
  const [picked, setPicked] = useState<string | null>(null);
  return [picked ?? stored, setPicked] as const;
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

/**
 * Delete, asked twice.
 *
 * The bin sat one pixel from Save, the same size and the same weight, and deleted an
 * account or a category on a single click with nothing in between. An account carries
 * every transaction ever logged against it; that is not a control that should be one
 * slip of the mouse away from a control you press all day.
 *
 * The confirmation is the button itself rather than a dialog. A modal over a dense
 * list of rows loses which row it was about, and it stops the one thing that makes
 * this safe: the second click is in a different place, with a different word on it,
 * so the muscle memory of the first click cannot complete the second.
 *
 * It disarms on a timer and on blur, so a row left armed does not stay armed for the
 * rest of the session.
 */
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
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer.current);
  }, [armed]);

  if (armed) {
    return (
      <button
        type="button"
        aria-label={`Confirm: ${label}`}
        disabled={pending}
        /*
          Focus moves to the confirmation, which does two jobs at once: Enter now
          completes the delete for anyone on a keyboard, and clicking anywhere else
          genuinely blurs this button — which is what disarms it. Without the focus,
          the blur handler below can never fire and the row stays armed until the
          timer runs out.
        */
        autoFocus
        onBlur={() => setArmed(false)}
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
              setArmed(false);
              throw error;
            }
            /*
              Re-entered, because everything after an `await` has left the transition.
              Fired loose, the refresh was untracked: `pending` went false the instant the
              server answered, so the button stopped spinning while the row it deleted was
              still on screen. Inside it, the spinner runs until the list is actually
              without that row.
            */
            startTransition(() => router.refresh());
          });
        }}
        className="zv-row-delete-confirm"
      >
        {pending ? (
          <Loader2 className="h-3.25 w-3.25 animate-spin" aria-hidden="true" />
        ) : (
          "Delete?"
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setArmed(true)}
      className="zv-row-delete rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-danger"
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


/* cache-name probe: harmless comment */
