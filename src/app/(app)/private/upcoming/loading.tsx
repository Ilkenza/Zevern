/**
 * Shown while this route's data is in flight.
 *
 * A `loading.tsx` is what makes the route stream: Next wraps the page in a Suspense
 * boundary, so the shell and this placeholder paint immediately and the content
 * arrives when the queries do. Before these files, every navigation held the whole
 * screen blank until the last query resolved.
 */
import { CardsSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <CardsSkeleton kpis={3} panels={2} maxWidth="max-w-220" />;
}
