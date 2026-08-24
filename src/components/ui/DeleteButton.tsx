"use client";

import { useEffect, useState, useTransition } from "react";
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

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          title={label}
          className="inline-flex cursor-pointer rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-danger"
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

      {open && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !pending && setOpen(false)}
          />
          <div className="relative w-full max-w-95 rounded-card border border-line bg-surface p-5 shadow-2xl">
            <div className="text-[14px] font-semibold text-ink">
              Confirm delete
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              {confirmText}
            </p>
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
      )}
    </>
  );
}
