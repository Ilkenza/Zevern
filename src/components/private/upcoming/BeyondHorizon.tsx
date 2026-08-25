import Link from "next/link";
import { Pencil } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PlannedRow } from "@/lib/types";
import { planHref } from "./index";
import { Marker, PanelMeta } from "./ui";

export function BeyondHorizon({ items, horizon }: { items: PlannedRow[]; horizon: string }) {
  if (items.length === 0) return null;

  return (
    <Panel
      className="money-summary-panel upcoming-panel"
      title="Further out"
      action={
        <PanelMeta>
          {items.length} planned past <span className="mono">{horizon}</span>
        </PanelMeta>
      }
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 border-b border-line-soft px-4 py-2 last:border-b-0"
        >
          <Marker source="planned" color={item.category?.color ?? null} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-ink">{item.name}</div>
            <div className="mono text-[11.5px] text-muted">
              {item.due_on} · {item.category?.name ?? "No category"}
            </div>
          </div>
          <span
            className={cn(
              "mono shrink-0 text-[13px] font-semibold",
              item.kind === "income" ? "text-ok" : "text-ink",
            )}
          >
            {item.kind === "income" ? "+" : "−"} {formatAmount(Number(item.amount), item.currency)}
          </span>
          <Link
            href={planHref(item.id)}
            aria-label={`Edit ${item.name}`}
            title={`Edit ${item.name}`}
            className="zv-rowctrl"
          >
            <Pencil className="h-3.75 w-3.75" />
          </Link>
        </div>
      ))}
    </Panel>
  );
}

