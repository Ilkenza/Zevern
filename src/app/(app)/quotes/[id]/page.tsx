import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Printer, ArrowUpRight, FileUp } from "lucide-react";
import { getQuote } from "@/lib/data/quotes";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { deleteQuote, convertQuoteToInvoice } from "../actions";
import { quoteStatusBadge } from "@/lib/status";
import { quoteTotal } from "@/lib/quotes/total";
import { formatMoney, formatDate } from "@/lib/format";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) notFound();

  const badge = quoteStatusBadge(quote.status);
  const total = quoteTotal(quote.items);

  return (
    <div className="mx-auto max-w-250 space-y-6">
      <Link
        href="/quotes"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-ink"
      
        transitionTypes={["zv-back"]}
      >
        <ArrowLeft className="h-4 w-4" />
        Quotes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-extrabold tracking-[-0.5px] text-ink">
            {quote.title}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge status={badge.variant}>{badge.label}</Badge>
            {quote.client?.name && (
              <span className="text-[13px] text-muted">
                {quote.client.name}
              </span>
            )}
            <span className="mono text-[12px] text-faint">
              {formatDate(quote.created_at)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/print/quote/${quote.id}`}
            className={buttonClasses("secondary")}
          >
            <Printer className="h-4 w-4" />
            Print
          </Link>
          {quote.invoice_id ? (
            <Link
              href={`/invoices/${quote.invoice_id}`}
              className={buttonClasses("secondary")}
            >
              <ArrowUpRight className="h-4 w-4" />
              View invoice
            </Link>
          ) : (
            <form action={convertQuoteToInvoice.bind(null, quote.id)}>
              <Button type="submit" variant="primary">
                <FileUp className="h-4 w-4" />
                Convert to invoice
              </Button>
            </form>
          )}
          <Link
            href={`/quotes/${quote.id}/edit`}
            className={buttonClasses("secondary")}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
          <DeleteButton
            action={deleteQuote.bind(null, quote.id)}
            confirmText={`Delete quote "${quote.title}"?`}
          />
        </div>
      </div>

      <Panel title="Items">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                  Item
                </th>
                <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                  Price
                </th>
                <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                  Qty
                </th>
                <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((it, i) => (
                <tr key={i}>
                  <td className="border-b border-line-soft px-4 py-3 text-ink">
                    {it.label}
                  </td>
                  <td className="mono border-b border-line-soft px-4 py-3 text-right text-muted">
                    {formatMoney(it.price, quote.currency)}
                  </td>
                  <td className="mono border-b border-line-soft px-4 py-3 text-right text-muted">
                    {it.qty}
                  </td>
                  <td className="mono border-b border-line-soft px-4 py-3 text-right text-ink">
                    {formatMoney(it.price * it.qty, quote.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-6 px-4 py-3">
          <span className="text-[13px] font-semibold text-muted">Total</span>
          <span className="mono text-[18px] font-bold text-ink">
            {formatMoney(total, quote.currency)}
          </span>
        </div>
      </Panel>
    </div>
  );
}
