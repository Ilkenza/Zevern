"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * The panel that slides in from the side — and, on a phone, covers the screen.
 *
 * Three things about it were wrong there. `inset-y-0` resolves against the layout
 * viewport, which on a mobile browser is taller than what you can actually see while
 * the address bar is showing, so the bottom of a long form — the Save button — sat
 * underneath the browser chrome with no way to reach it. Locking the page behind it
 * left the scroll position behind too, so closing dropped you back at the top of a
 * list you had scrolled halfway down. And it was a plain `div`, so a screen reader
 * never announced that anything had opened and the keyboard could still tab into the
 * page behind it.
 *
 * And it is rendered into the body rather than where it is written. `<main>` is
 * wrapped in a ViewTransition, which gives it a view-transition-name and therefore a
 * stacking context of its own — so a panel inside it could not paint above the
 * topbar no matter what z-index it asked for. The visible symptom was a panel whose
 * header, and with it the close button, sat underneath the search bar. A portal puts
 * it back at the top of the document where `fixed inset-0` means what it says.
 */

/** SSR-safe "are we in the browser yet", without a setState in an effect. */
const subscribeToNothing = () => () => {};
export function SlideOver({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;

    returnTo.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;

      // Keep the keyboard inside the panel: tabbing past the last control of a form
      // that covers the whole screen should not land on a link nobody can see.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    };

    /*
      Freeze the page without losing where it was. `overflow: hidden` on its own lets
      the body jump to the top on iOS; pinning it at the offset it already had, and
      putting that offset back on close, is what keeps the list underneath still.
    */
    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close panel"
        onClick={onClose}
        className="ag-overlay-in absolute inset-0 bg-black/60"
      />
      {/*
        `100dvh` rather than the layout viewport: on a phone the difference is exactly
        the height of the address bar, and what goes missing under it is always the
        bottom of the form — which is where the button that saves it lives.
      */}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ag-panel-in absolute right-0 top-0 flex h-[100dvh] w-full max-w-110 flex-col border-l border-line bg-surface shadow-[0_0_60px_rgba(0,0,0,0.6)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="min-w-0 truncate font-display text-[17px] font-extrabold tracking-[-0.3px] text-ink">
            {title}
          </h2>
          {/*
            It was a bare glyph in muted grey on a grey header — the same weight as a
            decoration, and the one control every panel needs. Give it a border and a
            surface and it reads as a button; make the target 40px and a thumb can
            actually hit it.
          */}
          <button
            onClick={onClose}
            aria-label="Close panel"
            title="Close"
            className="zv-press flex h-10 w-10 shrink-0 items-center justify-center rounded-ctrl border border-line bg-white/[0.045] text-ink hover:border-danger/50 hover:bg-danger-bg hover:text-danger"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>
        {/*
          The bottom padding clears the home indicator on a phone that has one, so the
          last control in a form is not sitting underneath it.

          `zv-scroll-fade` puts a shadow under the header the moment there is anything
          above the fold, and lifts it again at the top. Without it a long form simply
          stopped at the header's hairline with no sign that it continued past it —
          which on a panel this tall is the difference between a form you finish and one
          you think you have finished.
        */}
        <div className="ag-panel-body-in zv-scroll-fade flex-1 overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
          {/*
            Room under the last control, as content rather than as padding.

            Chrome does not count a scroll container's bottom padding as scrollable, so
            the panel's own `pb-` is invisible the moment the content is taller than the
            panel — which is exactly when it is needed. A spacer is content, so it always
            scrolls into view, and the Save button stops sitting on the bottom edge.
          */}
          <div aria-hidden className="h-6" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
