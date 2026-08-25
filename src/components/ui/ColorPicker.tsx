"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pipette, Plus } from "lucide-react";
import { saveCustomColor } from "@/app/(app)/private/actions";
import { SWATCHES } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Accepts `#abc` and `#aabbcc`, with or without the hash, and normalises both. */
function normalise(raw: string): string | null {
  const hex = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
}

/**
 * Colour choice for categories, accounts and goals: the house palette, whatever the
 * owner has saved of their own, and a wheel for anything else.
 *
 * The value rides in a hidden input, so this drops into the existing forms without
 * any of them learning about state — they still just read `name` from the FormData.
 */
export function ColorPicker({
  name,
  value,
  custom = [],
  label = "Colour",
}: {
  name: string;
  value?: string | null;
  /** Colours this account has saved before, newest first. */
  custom?: string[];
  label?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(normalise(value ?? "") ?? SWATCHES[0]);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(selected);
  const [pending, startTransition] = useTransition();
  const wheel = useRef<HTMLInputElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // The picker is a popover, so it closes the way every popover should: click away,
  // or press Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popover.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (hex: string) => {
    setSelected(hex);
    setTyped(hex);
  };

  const isCustom = !SWATCHES.includes(selected);
  const canSave = isCustom && !custom.includes(selected);

  const keep = () =>
    startTransition(async () => {
      await saveCustomColor(selected);
      router.refresh();
    });

  return (
    <div className="relative" ref={popover}>
      <input type="hidden" name={name} value={selected} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${label}: ${selected}`}
        aria-expanded={open}
        aria-controls={panelId}
        title={selected}
        className="flex cursor-pointer items-center gap-1.5 rounded-ctrl border border-line bg-white/[0.035] px-2 py-1.5 transition-colors hover:border-line-soft hover:bg-white/[0.06]"
      >
        <span
          className="block h-4.5 w-4.5 rounded-full ring-1 ring-inset ring-black/25"
          style={{ background: selected }}
        />
        <span className="mono text-[11px] uppercase text-muted">{selected.slice(1)}</span>
      </button>

      {open && (
        <div
          id={panelId}
          /*
            `right-0` hangs the panel off the trigger's right edge, so a 248px panel
            opened from a control near the left of a phone starts at a negative x and
            half the swatches are unreachable. Anchoring left on narrow screens and
            capping the width to the viewport keeps it on screen at any size.
          */
          className="absolute left-0 z-40 mt-2 w-[min(15.5rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-3 shadow-2xl min-[420px]:left-auto min-[420px]:right-0"
        >
          <Group title="Palette">
            {SWATCHES.map((hex) => (
              <Dot key={hex} hex={hex} selected={selected === hex} onPick={pick} />
            ))}
          </Group>

          {custom.length > 0 && (
            <Group title="Saved">
              {custom.map((hex) => (
                <Dot key={hex} hex={hex} selected={selected === hex} onPick={pick} />
              ))}
            </Group>
          )}

          <div className="mt-3 border-t border-line-soft pt-3">
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
              Custom
            </div>
            <div className="flex items-center gap-1.5">
              {/* The native colour input is the wheel; the swatch in front of it is
                  ours, because the browser's own button cannot be styled. */}
              <button
                type="button"
                onClick={() => wheel.current?.click()}
                aria-label="Open the colour wheel"
                className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-ctrl border border-line transition-colors hover:border-gold"
                style={{ background: selected }}
              >
                <Pipette className="h-3.5 w-3.5 text-black/55 mix-blend-luminosity" />
                <input
                  ref={wheel}
                  type="color"
                  value={selected}
                  onChange={(e) => pick(e.target.value)}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                />
              </button>

              <div className="flex flex-1 items-center rounded-ctrl border border-line bg-white/[0.035] pl-2 focus-within:border-gold focus-within:shadow-ring">
                <span className="mono text-[12px] text-faint">#</span>
                <input
                  value={typed.replace(/^#/, "")}
                  onChange={(e) => {
                    setTyped(e.target.value);
                    const hex = normalise(e.target.value);
                    if (hex) setSelected(hex);
                  }}
                  onBlur={() => setTyped(selected)}
                  spellCheck={false}
                  maxLength={7}
                  aria-label="Hex colour"
                  className="mono w-full bg-transparent px-1.5 py-1.5 text-[12px] uppercase text-ink focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={keep}
                disabled={!canSave || pending}
                aria-label="Save this colour"
                title={canSave ? "Keep this colour" : "Already saved"}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-ctrl border transition-colors",
                  canSave
                    ? "cursor-pointer border-line text-muted hover:border-gold hover:text-gold"
                    : "cursor-not-allowed border-line-soft text-faint opacity-50",
                )}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
        {title}
      </div>
      <div className="grid grid-cols-8 gap-1.5">{children}</div>
    </div>
  );
}

function Dot({
  hex,
  selected,
  onPick,
}: {
  hex: string;
  selected: boolean;
  onPick: (hex: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(hex)}
      aria-label={hex}
      aria-pressed={selected}
      title={hex}
      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full ring-1 ring-inset ring-black/25 transition-transform hover:scale-110 motion-reduce:transform-none"
      style={{ background: hex }}
    >
      {selected && <Check className="h-3.5 w-3.5 text-black/70" strokeWidth={3} />}
    </button>
  );
}
