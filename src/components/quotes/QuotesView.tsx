import Link from "next/link";
import { Plus, FileSpreadsheet, LayoutList } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { quoteStatusBadge } from "@/lib/status";
import { quoteTotal } from "@/lib/quotes/total";
import { formatMoney, formatDate } from "@/lib/format";
import type { QuoteWithClient } from "@/lib/types";

export function QuotesView({ quotes }: { quotes: QuoteWithClient[] }) {
  return (
    <div className="mx-auto max-w-300">
      <PageHeader
        kicker="Before the work"
        title="Quotes"
        lede="What you offered, for how much, and whether it turned into a job."
        stats={[{ label: "Quotes", value: String(quotes.length) }]}
        actions={
          <>
            <Link href="/quotes/catalog" className={buttonClasses("secondary")}>
              <LayoutList className="h-4 w-4" />
              Catalog
            </Link>
            <Link href="/quotes/new" className={buttonClasses("primary", "zv-turn")}>
              <Plus className="h-4 w-4" />
              New quote
            </Link>
          </>
        }
      />

      <Panel>
        {quotes.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="No quotes yet"
            description="Build a quote from your feature catalog, send it, and convert it to an invoice."
            action={
              <Link href="/quotes/new" className={buttonClasses("primary")}>
                New quote
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  {["Title", "Client", "Status", "Total", "Date"].map(
                    (h, idx) => (
                      <th
                        key={h}
                        className={`border-b border-line-soft px-4 py-2.75 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted ${
                          idx >= 3 ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const badge = quoteStatusBadge(q.status);
                  return (
                    <tr
                      key={q.id}
                      className="zv-row"
                    >
                      <td className="border-b border-line-soft px-4 py-3 font-semibold text-ink">
                        <Link
                          href={`/quotes/${q.id}`}
                          transitionTypes={["zv-forward"]}
                          className="hover:text-gold-hi"
                        >
                          {q.title}
                        </Link>
                      </td>
                      <td className="border-b border-line-soft px-4 py-3 text-muted">
                        {q.client?.name ?? "—"}
                      </td>
                      <td className="border-b border-line-soft px-4 py-3">
                        <Badge status={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="mono border-b border-line-soft px-4 py-3 text-right text-ink">
                        {formatMoney(quoteTotal(q.items), q.currency)}
                      </td>
                      <td className="mono border-b border-line-soft px-4 py-3 text-right text-muted">
                        {formatDate(q.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
