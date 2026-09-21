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
                  <th className="hidden border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted sm:table-cell">
                    Client
                  </th>
                  <th className="hidden border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted sm:table-cell">
                    Status
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Amount
                  </th>
                  <th className="hidden border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted sm:table-cell">
                    Due
                  </th>
                  <th className="border-b border-line-soft py-2.75 pr-3 sm:px-4" />
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
                      <td className="border-b border-line-soft px-4 py-3 font-semibold text-ink max-sm:w-full max-sm:max-w-0">
                        <Link
                          href={`/invoices/${inv.id}`}
                          transitionTypes={["zv-forward"]}
                          className="mono whitespace-nowrap hover:text-gold-hi"
                        >
                          {inv.number ?? "—"}
                        </Link>
                        {/* Phone: who and when under the number, the status under the amount. */}
                        {(inv.client?.name || inv.due_date) && (
                          <div className="mt-0.5 truncate text-[11.5px] font-normal text-muted sm:hidden">
                            {[inv.client?.name, inv.due_date ? `due ${formatDate(inv.due_date)}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="hidden border-b border-line-soft px-4 py-3 text-muted sm:table-cell">
                        {inv.client?.name ?? "—"}
                      </td>
                      <td className="hidden border-b border-line-soft px-4 py-3 sm:table-cell">
                        <Badge status={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="border-b border-line-soft px-4 py-3 text-right text-ink">
                        <div className="mono whitespace-nowrap">
                          {formatMoney(inv.amount, inv.currency)}
                        </div>
                        <div className="mt-1 sm:hidden">
                          <Badge status={badge.variant}>{badge.label}</Badge>
                        </div>
                      </td>
                      <td className="mono hidden border-b border-line-soft px-4 py-3 text-right whitespace-nowrap text-muted sm:table-cell">
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="border-b border-line-soft py-3 pr-3 text-right sm:px-4">
                        <Link
                          href={`/invoices?edit=${inv.id}`}
                          aria-label={`Edit invoice ${inv.number ?? ""}`}
                          className="inline-flex rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink focus-visible:text-ink"
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
