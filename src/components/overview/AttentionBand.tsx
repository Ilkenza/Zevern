import Link from "next/link";
import { AlertTriangle, Clock, Send, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";

/**
 * The one thing a dashboard owes you that a list of numbers does not: what to do
 * next. Three things can be genuinely late — an invoice nobody paid, a task whose
 * date has gone, a lead you promised to call back — and each one is a link to the
 * screen where you fix it.
 *
 * When nothing is late this renders nothing at all. A band that is permanently on
 * screen saying "all clear" is a band people stop reading, and then it is still
 * being ignored on the day it finally turns red.
 */

export type Attention = {
  overdueInvoices: number;
  overdueAmount: number;
  overdueTasks: number;
  followups: number;
};

export function hasAttention(a: Attention): boolean {
  return a.overdueInvoices > 0 || a.overdueTasks > 0 || a.followups > 0;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function AttentionBand({ attention }: { attention: Attention }) {
  if (!hasAttention(attention)) return null;

  const items: {
    key: string;
    href: string;
    icon: typeof AlertTriangle;
    tone: "critical" | "warning";
    text: string;
    detail?: string;
  }[] = [];

  if (attention.overdueInvoices > 0) {
    items.push({
      key: "invoices",
      href: "/invoices",
      icon: AlertTriangle,
      tone: "critical",
      text: `${plural(attention.overdueInvoices, "invoice", "invoices")} overdue`,
      detail: formatCurrency(attention.overdueAmount),
    });
  }
  if (attention.overdueTasks > 0) {
    items.push({
      key: "tasks",
      href: "/tasks",
      icon: Clock,
      tone: "warning",
      text: `${plural(attention.overdueTasks, "task", "tasks")} past due`,
    });
  }
  if (attention.followups > 0) {
    items.push({
      key: "leads",
      href: "/leads",
      icon: Send,
      tone: "warning",
      text: `${plural(attention.followups, "follow-up", "follow-ups")} waiting`,
    });
  }

  return (
    <section className="attention-band" aria-label="Needs attention">
      <span className="attention-title">Needs attention</span>
      <div className="attention-items">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`attention-chip attention-${item.tone}`}
          >
            <item.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{item.text}</span>
            {item.detail && <span className="mono attention-detail">{item.detail}</span>}
            <ArrowRight className="attention-arrow h-3 w-3 shrink-0" aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  );
}
