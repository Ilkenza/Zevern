"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close panel"
        onClick={onClose}
        className="ag-overlay-in absolute inset-0 bg-black/60"
      />
      <div className="ag-panel-in absolute inset-y-0 right-0 flex w-full max-w-110 flex-col border-l border-line bg-surface shadow-[0_0_60px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-[17px] font-extrabold tracking-[-0.3px] text-ink">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="zv-press rounded-ctrl p-1.5 text-muted hover:bg-white/4 hover:text-ink"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="ag-panel-body-in flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
