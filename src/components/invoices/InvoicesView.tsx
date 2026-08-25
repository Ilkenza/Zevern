"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ReceiptText, Pencil } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { effectiveInvoiceStatus, invoiceStatusBadge } from "@/lib/status";
import { formatMoney, formatDate } from "@/lib/format";
import type { Invoice, InvoiceWithClient } from "@/lib/types";
import { InvoiceForm, type ClientOption } from "./InvoiceForm";

export type InvoicesPanel =
  | { mode: "new" }
  | { mode: "edit"; invoice: Invoice }
  | null;

export function InvoicesView({
  invoices,
  clients,
  suggestedNumber,
  panel,
}: {
  invoices: InvoiceWithClient[];
  clients: ClientOption[];
  suggestedNumber: string;
  panel: InvoicesPanel;
}) {
  const router = useRouter();
  const close = () => router.push("/invoices");

  return (
    <div className="mx-auto max-w-300">
      <PageHeader
        kicker="Getting paid"
        title="Invoices"
        lede="What has been sent, what has been settled, and what is late."
        stats={[
          { label: "All", value: String(invoices.length) },
          {
            label: "Unpaid",
            value: String(invoices.filter((i) => i.status !== "paid").length),
            tone: invoices.some((i) => effectiveInvoiceStatus(i) === "overdue")
              ? "danger"
              : "gold",
          },
        ]}
        actions={
          <Link href="/invoices?new=1" className={buttonClasses("primary", "zv-turn")}>
            <Plus className="h-4 w-4" />
            New invoice
          </Link>
        }
      />

      <Panel>
        {invoices.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No invoices yet"
            description="Issue your first invoice to track paid, pending and overdue amounts."
            action={
              <Link href="/invoices?new=1" className={buttonClasses("primary")}>
                New invoice
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Number
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Client
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Status
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Amount
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Due
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const badge = invoiceStatusBadge(effectiveInvoiceStatus(inv));
                  return (
                    <tr
                      key={inv.id}
                      className="zv-row group"
                    >
                      <td className="mono border-b border-line-soft px-4 py-3 font-semibold text-ink">
                        <Link
                          href={`/invoices/${inv.id}`}
                          transitionTypes={["zv-forward"]}
                          className="hover:text-gold-hi"
                        >
                          {inv.number ?? "—"}
                        </Link>
                      </td>
                      <td className="border-b border-line-soft px-4 py-3 text-muted">
                        {inv.client?.name ?? "—"}
                      </td>
                      <td className="border-b border-line-soft px-4 py-3">
                        <Badge status={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="mono border-b border-line-soft px-4 py-3 text-right text-ink">
                        {formatMoney(inv.amount, inv.currency)}
                      </td>
                      <td className="mono border-b border-line-soft px-4 py-3 text-right text-muted">
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-3 text-right">
                        <Link
                          href={`/invoices?edit=${inv.id}`}
                          aria-label={`Edit invoice ${inv.number ?? ""}`}
                          className="inline-flex rounded-ctrl p-1.5 text-faint opacity-0 transition-opacity hover:bg-white/5 hover:text-ink group-hover:opacity-100"
                        >
                          <Pencil className="h-3.75 w-3.75" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.mode === "edit" ? "Edit invoice" : "New invoice"}
      >
        <InvoiceForm
          invoice={panel?.mode === "edit" ? panel.invoice : undefined}
          clients={clients}
          suggestedNumber={suggestedNumber}
        />
      </SlideOver>
    </div>
  );
}
