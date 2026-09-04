"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses, type ButtonVariant } from "./Button";

export function DeleteButton({
  action,
  label = "Delete",
  confirmText = "Delete this permanently? This cannot be undone.",
  compact = false,
  variant = "danger",
  className,
}: {
  /**
   * What the confirmation actually does.
   *
   * A delete that returns `{ error }` failed and nothing was removed — say so and leave
   * the screen alone. Returning nothing still means it worked, which is what every
   * caller that has not been converted yet does.
   */
  action: () => void | Promise<{ error?: string } | void>;
  label?: string;
  confirmText?: string;
  /** Row variant: just the bin icon, no button chrome. The confirm modal stays the same. */
  compact?: boolean;
  /**
   * How loud the trigger is. The confirm step inside the dialog stays exactly as it is,
   * and its own button stays red — that is the one that actually deletes something.
   *
   * A solid red trigger is right where deleting is one of several things on offer. It is
   * wrong where it is the only other thing you can do beside Save: two filled buttons in
   * one footer means the panel is recommending both.
   */
  variant?: ButtonVariant;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  /*
    The dialog's job ends the moment you confirm.

    Two versions of this were wrong in opposite directions. It first closed as soon as the
    server action resolved and left the row on screen for another second while the fresh
    list came back — a delete that looked like it had not happened. Holding the dialog open
    until the refresh landed fixed the row and broke the dialog: the confirmation sat there
    after the decision had been made.

    Neither is fixable by timing, because the two are on different clocks. So the question
    the dialog exists to ask — are you sure — is answered and gone, and the row takes
    responsibility for looking deleted from the same instant (see MoneyView's `Row`).
    A failure puts both back and says why.
  */
  const confirm = () => {
    setFailed(null);
    setOpen(false);
    startTransition(async () => {
      /*
        A refused delete must not look like one that worked.

        These actions logged the database's complaint and carried on — revalidate,
        redirect, and the row you deleted turns up again on the next screen with nothing
        anywhere saying why. So the answer is read: on a failure the list is left exactly
        as it was and the reason goes on screen, and only a delete that actually happened
        gets the refresh.
      */
      const result = await action();
      if (result && "error" in result && result.error) {
        setFailed(result.error);
        return;
      }
      startTransition(() => router.refresh());
    });
  };

  /*
    The dialog goes to `document.body`, not next to the button that opened it.

    In a task row the bin lives inside `.task-actions`, and that wrapper fades its
    children out when the pointer leaves the row. The dialog was one of those
    children — so clicking delete, then moving the mouse to the Cancel button,
    made the whole confirmation disappear on the way there. A portal takes it out
    of that subtree entirely, and also out of any ancestor with a `transform`,
    which would otherwise turn `position: fixed` into something anchored to a card.
  */
  const dialog = open ? (
    <div
      className="zv-confirm fixed inset-0 z-100 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete"
    >
      <div
        className="ag-overlay-in absolute inset-0 bg-black/60"
        onClick={() => !pending && setOpen(false)}
      />
      <div className="zv-confirm-card relative w-full max-w-95 rounded-card border border-line bg-surface p-5 shadow-2xl">
        <div className="text-[14px] font-semibold text-ink">Confirm delete</div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{confirmText}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className={buttonClasses("secondary")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className={buttonClasses("danger")}
          >
            <Trash2 className="h-4 w-4" />
            {pending ? "Deleting…" : label}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          title={label}
          className={cn("zv-rowctrl zv-rowctrl-danger", className)}
        >
          <Trash2 className="h-3.75 w-3.75" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClasses(variant, className)}
        >
          <Trash2 className="h-4 w-4" />
          {label}
        </button>
      )}

      {/*
        Beside the button that was pressed, not in the dialog — the dialog is gone by the
        time the answer arrives, and a second one opening on its own would read as the app
        asking again rather than as it refusing.
      */}
      {failed && (
        <p role="alert" className="zv-delete-failed">
          {failed}
        </p>
      )}

      {/*
        Safe on the server: `open` starts false, so `dialog` is null through the
        render that gets hydrated, and the portal only ever opens on a click.
      */}
      {dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}

