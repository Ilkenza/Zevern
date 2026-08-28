/**
 * Shown while this route's data is in flight.
 *
 * A `loading.tsx` is what makes the route stream: Next wraps the page in a Suspense
 * boundary, so the shell and this placeholder paint immediately and the content
 * arrives when the queries do. Before these files, every navigation held the whole
 * screen blank until the last query resolved.
 */
import { CardsSkeleton } from "@/components/ui/Skeleton";

/*
  The skeleton is measured to the page it covers.

  Every one of these used the default `max-w-300` while the screens behind them run at
  220, 280 or 300 — so a placeholder was wider than its own content and the page visibly
  narrowed the moment the data landed. A skeleton has to be the width of the thing it is
  standing in for, or it is announcing a layout that never arrives.
*/
export default function Loading() {
  return <CardsSkeleton hero kpis={3} panels={2} maxWidth="max-w-300" />;
}
