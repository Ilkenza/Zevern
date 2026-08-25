import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && (
        <div className="zv-empty-icon mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/3 text-faint">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-xs text-[12.5px] text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
