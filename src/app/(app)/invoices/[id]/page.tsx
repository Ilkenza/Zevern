import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { getInvoice } from "@/lib/data/invoices";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { deleteInvoice } from "../actions";
import { effectiveInvoiceStatus, invoiceStatusBadge } from "@/lib/status";
import { formatMoney, formatDate } from "@/lib/format";

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="mt-1 text-[14px] text-ink">{children}</div>
    </div>
  );
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  const badge = invoiceStatusBadge(effectiveInvoiceStatus(invoice));

  return (
    <div className="mx-auto max-w-300 space-y-6">
      <Link
        href="/invoices"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-ink"
      
        transitionTypes={["zv-back"]}
      >
        <ArrowLeft className="h-4 w-4" />
        Invoices
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mono font-display text-[24px] font-extrabold tracking-[-0.5px] text-ink">
            {invoice.number ?? "Invoice"}
          </h1>
          <div className="mt-2">
            <Badge status={badge.variant}>{badge.label}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/print/invoice/${invoice.id}`}
            className={buttonClasses("secondary")}
          >
            <Printer className="h-4 w-4" />
            Print
          </Link>
          <Link
            href={`/invoices?edit=${invoice.id}`}
            className={buttonClasses("secondary")}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
          <DeleteButton
            action={deleteInvoice.bind(null, invoice.id)}
            confirmText={`Delete invoice ${invoice.number ?? ""}?`}
          />
        </div>
      </div>

      <Panel title="Details">
        <div className="grid grid-cols-2 gap-5 px-4 py-4 sm:grid-cols-4">
          <Stat label="Client">
            {invoice.client?.name ?? <span className="text-muted">—</span>}
          </Stat>
          <Stat label="Amount">
            <span className="mono">
              {formatMoney(invoice.amount, invoice.currency)}
            </span>
          </Stat>
          <Stat label="Issued">
            <span className="mono">{formatDate(invoice.issued_at)}</span>
          </Stat>
          <Stat label="Due">
            <span className="mono">{formatDate(invoice.due_date)}</span>
          </Stat>
        </div>
      </Panel>

      {invoice.items.length > 0 && (
        <Panel title="Line items">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.07em] text-muted">
                <th className="px-4 py-2 font-bold">Description</th>
                <th className="px-4 py-2 text-right font-bold">Qty</th>
                <th className="px-4 py-2 text-right font-bold">Unit</th>
                <th className="px-4 py-2 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={i} className="border-t border-line-soft">
                  <td className="px-4 py-2.5 text-ink">{it.label}</td>
                  <td className="mono px-4 py-2.5 text-right text-muted">
                    {it.qty}
                  </td>
                  <td className="mono px-4 py-2.5 text-right text-muted">
                    {formatMoney(it.price, invoice.currency)}
                  </td>
                  <td className="mono px-4 py-2.5 text-right text-ink">
                    {formatMoney(it.price * it.qty, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
