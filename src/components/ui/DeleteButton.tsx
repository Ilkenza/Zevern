"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { buttonClasses } from "./Button";

export function DeleteButton({
  action,
  label = "Delete",
  confirmText = "Delete this permanently? This cannot be undone.",
  compact = false,
}: {
  action: () => void | Promise<void>;
  label?: string;
  confirmText?: string;
  /** Row variant: just the bin icon, no button chrome. The confirm modal stays the same. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  const confirm = () => {
    startTransition(async () => {
      await action();
      setOpen(false);
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
          className="zv-rowctrl zv-rowctrl-danger"
        >
          <Trash2 className="h-3.75 w-3.75" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClasses("danger")}
        >
          <Trash2 className="h-4 w-4" />
          {label}
        </button>
      )}

      {/*
        Safe on the server: `open` starts false, so `dialog` is null through the
        render that gets hydrated, and the portal only ever opens on a click.
      */}
      {dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
