import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * The page that shows when there is no page: a 404, a crash, a route that needed a
 * row that has since been deleted.
 *
 * Deliberately not a client component, so the same face can be used by `not-found.tsx`
 * (server) and `error.tsx` (client) — the one interactive part, a retry button, is
 * passed in by whoever has a `reset` to give it.
 */
export function StatusScreen({
  icon: Icon,
  title,
  description,
  reference,
  action,
  home = true,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** The `digest` of a server error — the only thing that ties this screen to a log line. */
  reference?: string;
  action?: React.ReactNode;
  /** A way back. Off for screens that are already inside the shell's navigation. */
  home?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/3 text-faint">
          <Icon className="h-5.5 w-5.5" />
        </div>
      )}
      <h1 className="font-display text-[18px] font-bold text-ink">{title}</h1>
      {description && (
        <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted">{description}</p>
      )}
      {reference && (
        <p className="mt-3 font-mono text-[11.5px] text-faint">Reference {reference}</p>
      )}
      {(action || home) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {action}
          {home && (
            <Link href="/" className={buttonClasses(action ? "secondary" : "primary")}>
              Back to the overview
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
