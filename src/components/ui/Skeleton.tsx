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
 * What a screen made of cards shows — the overview, the money pages. A row of figures
 * across the top, then panels.
 */
export function CardsSkeleton({
  kpis = 4,
  panels = 2,
  maxWidth = "max-w-300",
}: {
  kpis?: number;
  panels?: number;
  maxWidth?: string;
}) {
  return (
    <div className={cn("mx-auto space-y-5", maxWidth)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <HeadSkeleton />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
