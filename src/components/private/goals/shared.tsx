/**
 * The handful of things every part of the goals screen needs: the two link targets,
 * three class strings that keep the cards and the composer measuring the same, and
 * the little count that sits beside a panel title.
 */

/** Small caps label — panel captions and composer headings, same as Setup. */
export const caps = "text-[10.5px] font-semibold uppercase tracking-wider text-faint";

/** A goal with no colour of its own falls back to the muted token, never a stray hex. */
export const NO_COLOUR = "var(--color-muted)";

/** Bare controls inside a card, measured the same way Setup measures its own. */
export const field =
  "rounded-ctrl border border-line bg-white/[0.035] px-2 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring";

export const GOALS_HREF = "/private/goals";
export const ARCHIVE_HREF = `${GOALS_HREF}?archived=1`;

/** The line beside a panel title: how many of the thing there are. */
export function PanelMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11.5px] font-semibold whitespace-nowrap text-muted">{children}</span>
  );
}

