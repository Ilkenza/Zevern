import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One section of the page, with the heading the index jumps to.
 *
 * It replaces the shared `Panel` here for one reason: every section needs an `id` and
 * a scroll offset that clears the sticky topbar, and threading those through a generic
 * panel would put page-specific plumbing in a primitive that eight other screens use.
 */
export function SetupSection({
  id,
  icon: Icon,
  title,
  meta,
  lede,
  children,
  className,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  meta?: React.ReactNode;
  lede?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("setup-section", className)}>
      <header className="setup-section-head">
        <span className="setup-section-icon" aria-hidden="true">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <h2 className="setup-section-title">{title}</h2>
          {lede && <p className="setup-section-lede">{lede}</p>}
        </span>
        {meta && <span className="setup-section-meta">{meta}</span>}
      </header>
      <div className="setup-section-body">{children}</div>
    </section>
  );
}
