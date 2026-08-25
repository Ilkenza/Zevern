/**
 * The pieces every part of the Upcoming screen repeats: the two class tokens, the
 * separator, the count beside a panel title, and the marker that says — without a
 * word — whether a line is a fact or a guess.
 */

/** Small caps label — column heads and captions, same token as Setup and Goals. */
export const caps = "text-[10.5px] font-semibold uppercase tracking-wider text-faint";

/** A category with no colour of its own falls back to a token, never a stray hex. */
export const NO_COLOUR = "var(--color-faint)";

/**
 * The marker down the left of a row, and the whole of what it says: a solid bar is a
 * rule that repeats, a broken one is a one-off that has been planned, and a faint
 * dotted one is the projection. Solid means the date and the amount are both known.
 */
export function Marker({ source, color }: { source: string; color: string | null }) {
  const shade = color ?? NO_COLOUR;
  if (source === "everyday") {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 h-8 w-1 shrink-0 rounded-pill"
        style={{
          background: `repeating-linear-gradient(to bottom, var(--color-faint) 0 2px, transparent 2px 5px)`,
        }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 h-8 w-1 shrink-0 rounded-pill"
      style={{
        background:
          source === "planned"
            ? `repeating-linear-gradient(to bottom, ${shade} 0 5px, transparent 5px 8px)`
            : shade,
      }}
    />
  );
}

/** The line beside a panel title: how many of the thing there are. */
export function PanelMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11.5px] font-semibold whitespace-nowrap text-muted">{children}</span>
  );
}

export function Dot() {
  return (
    <span aria-hidden="true" className="text-faint">
      ·
    </span>
  );
}

