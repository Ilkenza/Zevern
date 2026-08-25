import { cn } from "@/lib/utils";

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        // `zv-panel` is the entrance and the hover warmth. It comes first so a screen
        // with its own tuned treatment — the money pages have several — overrides it
        // from globals.css rather than being overridden by it.
        "zv-panel overflow-hidden rounded-card border border-line bg-surface",
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
          {title && <h2 className="text-[13px] font-bold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
