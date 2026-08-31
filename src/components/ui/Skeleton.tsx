import { cn } from "@/lib/utils";

/**
 * A block standing in for something that has not arrived.
 *
 * Shape matters more than anything else here: a placeholder the wrong size makes the
 * real content jump when it lands, which is worse than no placeholder at all. So the
 * page skeletons below are laid out against the pages they cover — a header of the
 * right height, a panel of the right width, rows at the right pitch.
 */
export function Skeleton({
  className,
  w,
  h = 12,
}: {
  className?: string;
  /** Width, as a CSS length. Rows vary theirs so a list does not look printed. */
  w?: string;
  h?: number;
}) {
  return (
    <div
      className={cn("zv-skeleton", className)}
      style={{ width: w, height: `${h}px` }}
      aria-hidden="true"
    />
  );
}

/**
 * The header every page now opens with, in placeholder form.
 *
 * It is drawn rather than skipped because the header is the tallest thing above the
 * fold: leaving it out and then dropping it in pushes the whole page down at the
 * moment the data lands.
 */
function HeadSkeleton() {
  return (
    <div className="zv-pagehead">
      <div className="min-w-0">
        <Skeleton w="7rem" h={10} />
        <Skeleton className="mt-3" w="12rem" h={28} />
        <Skeleton className="mt-3" w="22rem" h={11} />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton w="3.5rem" h={30} />
        <Skeleton w="7.5rem" h={36} />
      </div>
    </div>
  );
}

/** A run of list rows at the pitch the real table uses. */
function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  // Widths repeat on a cycle rather than randomly: a random width is different on
  // the server and the client, and React calls that a hydration error.
  const widths = ["11rem", "8.5rem", "13rem", "9.5rem", "12rem", "10rem"];

  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-line-soft px-4 py-3.5 last:border-b-0"
        >
          <Skeleton w={widths[i % widths.length]} h={12} />
          <Skeleton className="hidden sm:block" w="7rem" h={11} />
          <div className="flex-1" />
          <Skeleton className="hidden md:block rounded-pill" w="4.5rem" h={18} />
          <Skeleton w="3.5rem" h={11} />
        </div>
      ))}
    </div>
  );
}

/**
 * What a list screen shows while its rows are in flight: the header, a panel, and a
 * run of rows. Every list page in the app has this shape, so one skeleton covers all
 * of them and there is nothing to keep in sync per screen.
 */
export function ListSkeleton({
  rows = 6,
  maxWidth = "max-w-300",
}: {
  rows?: number;
  maxWidth?: string;
}) {
  return (
    <div className={cn("mx-auto", maxWidth)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <HeadSkeleton />
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="border-b border-line-soft px-4 py-3">
          <Skeleton w="5rem" h={10} />
        </div>
        <RowsSkeleton rows={rows} />
      </div>
    </div>
  );
}

/**
 * What the budgets screen shows while its cards are in flight.
 *
 * It was borrowing `CardsSkeleton` — three figures across the top and one panel — and
 * the budgets screen is none of those things: it is a short heading, a toolbar, and a
 * two-column grid of cards. So the placeholder drew a layout the page never arrives at,
 * and the whole screen rearranged itself the moment the data landed. Which is the one
 * thing the comment in that `loading.tsx` says a skeleton must not do.
 *
 * The card shell is `.bud-card` itself rather than a shape that resembles it, for the
 * same reason the entries skeleton borrows `.zv-entry`: padding, border and radius
 * cannot drift from the thing they stand in for if they are the same rule.
 */
export function BudgetsSkeleton({ cards = 6 }: { cards?: number }) {
  // Fixed cycle, not random: a random width differs between server and client, and
  // React calls that a hydration error.
  const names = ["8rem", "10.5rem", "7rem", "9.5rem", "11rem", "8.5rem"];

  return (
    <div className="pb-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <Skeleton w="6.5rem" h={22} />
          <Skeleton className="mt-2.5" w="19rem" h={11} />
        </div>
        <Skeleton w="8.5rem" h={34} />
      </div>

      <div className="zv-toolbar mb-5">
        <div className="zv-toolbar-find">
          <Skeleton w="100%" h={31} />
        </div>
        <Skeleton w="8.5rem" h={31} />
        <Skeleton w="10rem" h={31} />
        <Skeleton w="32px" h={31} />
      </div>

      <div className="grid gap-2.5 md:grid-cols-2">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="bud-card">
            {/*
              The real card's own rhythm, measured off the live page rather than guessed:
              a 37px head, the line of time at 73, the note at 100, the strip at 142, and
              222 in total. The first draft left the strip out and came to 121 — a hundred
              pixels short on every card, which on a two-column grid is the page growing
              half a screen at the moment the data lands.
            */}
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="flex h-[37px] items-center justify-between gap-4">
                <Skeleton w={names[i % names.length]} h={13} />
                <Skeleton w="6rem" h={19} />
              </div>

              <div className="mt-[21px] flex h-4 items-center gap-2.5">
                <Skeleton w="2.6rem" h={10} />
                <Skeleton className="flex-1 rounded-pill" w="100%" h={8} />
                <Skeleton w="2.6rem" h={10} />
              </div>

              <div className="mt-[11px] flex h-[30px] items-center">
                <Skeleton w="11rem" h={11} />
              </div>

              {/* The strip of finished periods, which most cards carry. */}
              <div className="mt-3 h-[62px] border-t border-line-soft pt-2.5">
                <div className="grid grid-cols-6 items-end gap-1.5" style={{ minHeight: "28px" }}>
                  {[14, 22, 18, 26, 11, 24].map((h, k) => (
                    <Skeleton key={k} w="100%" h={h} />
                  ))}
                </div>
                <Skeleton className="mt-2" w="9rem" h={10} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * What a screen made of cards shows — the overview, the money pages. A row of figures
 * across the top, then panels.
 */
export function CardsSkeleton({
  kpis = 4,
  panels = 2,
  hero = false,
  maxWidth = "max-w-300",
}: {
  kpis?: number;
  panels?: number;
  /**
   * A full-width band above the cards, for screens that lead with one figure.
   *
   * Without it the overview's skeleton drew four equal cards where the page has a band
   * and three, so the layout rearranged itself the moment the data landed — which is
   * the one thing a skeleton exists to prevent.
   */
  hero?: boolean;
  maxWidth?: string;
}) {
  return (
    <div className={cn("mx-auto space-y-5", maxWidth)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <HeadSkeleton />

      {hero && (
        <div className="rounded-card border border-line bg-surface p-5">
          <Skeleton w="6rem" h={10} />
          <Skeleton className="mt-3.5" w="13rem" h={34} />
          <Skeleton className="mt-3" w="16rem" h={11} />
        </div>
      )}

      {/* The columns follow the count, so three cards never sit in a grid built for four. */}
      <div
        className={cn(
          "grid gap-3 min-[520px]:grid-cols-2",
          kpis === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4",
        )}
      >
        {Array.from({ length: kpis }, (_, i) => (
          <div key={i} className="rounded-card border border-line bg-surface p-4">
            <Skeleton w="4.5rem" h={10} />
            <Skeleton className="mt-3" w="7rem" h={22} />
            <Skeleton className="mt-2.5" w="5.5rem" h={10} />
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: panels }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="border-b border-line-soft px-4 py-3">
              <Skeleton w="6rem" h={11} />
            </div>
            <RowsSkeleton rows={4} />
          </div>
        ))}
      </div>
    </div>
  );
}


