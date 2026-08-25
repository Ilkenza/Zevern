"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Users, Pencil } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { clientTierBadge } from "@/lib/status";
import { formatDate } from "@/lib/format";
import type { Client } from "@/lib/types";
import type { ClientWithCount } from "@/lib/data/clients";
import { ClientForm } from "./ClientForm";

export type ClientsPanel =
  | { mode: "new" }
  | { mode: "edit"; client: Client }
  | null;

export function ClientsView({
  clients,
  panel,
}: {
  clients: ClientWithCount[];
  panel: ClientsPanel;
}) {
  const router = useRouter();
  const close = () => router.push("/clients");

  const businessTypes = [
    ...new Set(clients.map((c) => c.business_type?.trim()).filter(Boolean) as string[]),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto max-w-300">
      <PageHeader
        kicker="Who you work for"
        title="Clients"
        lede="Everyone you invoice, what they are worth, and how to reach them."
        stats={[
          { label: "Clients", value: String(clients.length) },
          {
            label: "With work",
            value: String(clients.filter((c) => (c.projects?.[0]?.count ?? 0) > 0).length),
            tone: "gold",
          },
        ]}
        actions={
          <Link href="/clients?new=1" className={buttonClasses("primary", "zv-turn")}>
            <Plus className="h-4 w-4" />
            New client
          </Link>
        }
      />

      <Panel>
        {clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Add your first client to start tracking projects and invoices."
            action={
              <Link href="/clients?new=1" className={buttonClasses("primary")}>
                New client
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Name
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Contact
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Tier
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Projects
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Added
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75" />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    className="zv-row group"
                  >
                    <td className="border-b border-line-soft px-4 py-3 font-semibold text-ink">
                      <Link
                        href={`/clients/${c.id}`}
                        transitionTypes={["zv-forward"]}
                        className="hover:text-gold-hi"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="border-b border-line-soft px-4 py-3 text-muted">
                      {c.contact ?? "—"}
                      {c.contact_channel && (
                        <span className="block text-[11.5px] text-faint">
                          {c.contact_channel}
                        </span>
                      )}
                    </td>
                    <td className="border-b border-line-soft px-4 py-3">
                      {clientTierBadge(c.tier) ? (
                        <Badge status={clientTierBadge(c.tier)!.variant}>
                          {clientTierBadge(c.tier)!.label}
                        </Badge>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="mono border-b border-line-soft px-4 py-3 text-right text-muted">
                      {c.projects?.[0]?.count ?? 0}
                    </td>
                    <td className="mono border-b border-line-soft px-4 py-3 text-right text-muted">
                      {formatDate(c.created_at)}
                    </td>
                    <td className="border-b border-line-soft px-4 py-3 text-right">
                      <Link
                        href={`/clients?edit=${c.id}`}
                        aria-label={`Edit ${c.name}`}
                        className="inline-flex rounded-ctrl p-1.5 text-faint opacity-0 transition-opacity hover:bg-white/5 hover:text-ink group-hover:opacity-100"
                      >
                        <Pencil className="h-3.75 w-3.75" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.mode === "edit" ? "Edit client" : "New client"}
      >
        {panel?.mode === "edit" ? (
          <ClientForm client={panel.client} businessTypes={businessTypes} />
        ) : (
          <ClientForm businessTypes={businessTypes} />
        )}
      </SlideOver>
    </div>
  );
}
