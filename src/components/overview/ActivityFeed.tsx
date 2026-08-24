import Link from "next/link";
import {
  Users,
  FolderKanban,
  ListChecks,
  ReceiptText,
  Send,
  type LucideIcon,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import type { ActivityItem, ActivityType } from "@/lib/data/activity";

const META: Record<
  ActivityType,
  { icon: LucideIcon; verb: string; href: (id: string) => string }
> = {
  client: { icon: Users, verb: "New client", href: (id) => `/clients/${id}` },
  project: {
    icon: FolderKanban,
    verb: "New project",
    href: (id) => `/projects/${id}`,
  },
  task: { icon: ListChecks, verb: "New task", href: () => `/tasks` },
  invoice: {
    icon: ReceiptText,
    verb: "New invoice",
    href: (id) => `/invoices/${id}`,
  },
  lead: { icon: Send, verb: "New lead", href: (id) => `/leads/${id}` },
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="overview-feed">
      {items.map((it, index) => {
        const m = META[it.type];
        const Icon = m.icon;
        return (
          <Link
            key={`${it.type}-${it.id}`}
            href={m.href(it.id)}
            className="overview-list-row flex items-center gap-3 border-b border-line-soft px-4 py-2.5 transition-colors last:border-b-0 hover:bg-white/2"
            style={{ animationDelay: `${220 + index * 55}ms` }}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/3 text-faint">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
              <span className="text-muted">{m.verb} · </span>
              {it.label}
            </div>
            <span className="mono shrink-0 text-[11px] text-faint">
              {formatRelativeTime(it.created_at)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
