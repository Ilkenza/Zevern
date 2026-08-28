import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/**
 * A dart in a bullseye — three concentric rings with an arrow struck through the centre.
 *
 * Hand-drawn rather than imported, because neither half of what is needed exists in the
 * icon set this app uses. Lucide's `Goal` is an arc with an arrow and reads as a swoosh
 * at a glance; its `Target` has the rings but no arrow, and is already spent on Budgets.
 * The version with both — `target-arrow` — lives in `lucide-lab`, a separate package that
 * would be a dependency carried for exactly one icon.
 *
 * Geometry, written down so it stays adjustable rather than magic:
 *
 *   centre    (10, 14) — sits the rings low and left, leaving the top-right quadrant
 *             clear for the arrow to come in through
 *   rings     r 8.5 / 5.2 / 2 — outer, middle, bullseye
 *   shaft     a 45° line from the centre out past the last ring
 *   flight    a kite aligned *to the shaft* rather than to the box: its long axis runs
 *             along the arrow and its short axis across it, so it reads as fletching
 *             instead of as a diamond that happens to be nearby
 *
 * Props match lucide's, so it drops into the same places with the same `className` and
 * `strokeWidth` and inherits `currentColor` like every other icon on the screen.
 */
/*
  `forwardRef` with lucide's own prop type, so this is interchangeable with a real lucide
  icon rather than merely similar to one. The nav table and `EmptyState` both type their
  `icon` slot as `LucideIcon`, which is a `ForwardRefExoticComponent` — a plain function
  component is structurally not one, and TypeScript says so.

  `size` and `absoluteStrokeWidth` are pulled out of the spread because they are lucide's
  API, not SVG attributes: `size` drives width and height here, and the second is accepted
  and ignored so a caller passing it does not put an unknown attribute on the element.
*/
export const GoalIcon = forwardRef<SVGSVGElement, LucideProps>(function GoalIcon(
  { strokeWidth = 2, size = 24, ...rest },
  ref,
) {
  // `absoluteStrokeWidth` is part of lucide's API and not an SVG attribute; taking it out
  // of the spread keeps React from warning about an unknown attribute on the element.
  const { absoluteStrokeWidth, ...svg } = rest;
  void absoluteStrokeWidth;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...svg}
    >
      {/*
        `fill="none"` as an attribute and not only in CSS: a circle's default fill is
        black, and a stylesheet that has not arrived yet must never be able to paint
        three black discs in the middle of a card. It has happened once already.
      */}
      <circle cx="10" cy="14" r="8.5" fill="none" />
      <circle cx="10" cy="14" r="5.2" fill="none" />
      <circle cx="10" cy="14" r="2" fill="none" />
      <path d="M10 14 20.6 3.4" fill="none" />
      <path d="M20.62 3.38 19.77 6.77 16.38 7.62 17.23 4.23Z" fill="none" />
    </svg>
  );
});
