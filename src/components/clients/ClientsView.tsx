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
                  <th className="hidden border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted sm:table-cell">
                    Contact
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted sm:text-left">
                    Tier
                  </th>
                  <th className="hidden border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted sm:table-cell">
                    Projects
                  </th>
                  <th className="hidden border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted sm:table-cell">
                    Added
                  </th>
                  <th className="border-b border-line-soft py-2.75 pr-3 sm:px-4" />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    className="zv-row group"
                  >
                    <td className="border-b border-line-soft px-4 py-3 font-semibold text-ink max-sm:w-full max-sm:max-w-0">
                      <Link
                        href={`/clients/${c.id}`}
                        transitionTypes={["zv-forward"]}
                        className="hover:text-gold-hi"
                      >
                        {c.name}
                      </Link>
                      {/* Phone: how to reach them under the name; the tier stays as a column. */}
                      {(c.contact || c.contact_channel) && (
                        <div className="mt-0.5 truncate text-[11.5px] font-normal text-muted sm:hidden">
                          {[c.contact, c.contact_channel].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="hidden border-b border-line-soft px-4 py-3 text-muted sm:table-cell">
                      {c.contact ?? "—"}
                      {c.contact_channel && (
                        <span className="block text-[11.5px] text-faint">
                          {c.contact_channel}
                        </span>
                      )}
                    </td>
                    <td className="border-b border-line-soft px-4 py-3 text-right sm:text-left">
                      {clientTierBadge(c.tier) ? (
                        <Badge status={clientTierBadge(c.tier)!.variant}>
                          {clientTierBadge(c.tier)!.label}
                        </Badge>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                      <div className="mono mt-1 text-[11px] whitespace-nowrap text-faint sm:hidden">
                        {c.projects?.[0]?.count ?? 0}{" "}
                        {(c.projects?.[0]?.count ?? 0) === 1 ? "project" : "projects"}
                      </div>
                    </td>
                    <td className="mono hidden border-b border-line-soft px-4 py-3 text-right text-muted sm:table-cell">
                      {c.projects?.[0]?.count ?? 0}
                    </td>
                    <td className="mono hidden border-b border-line-soft px-4 py-3 text-right whitespace-nowrap text-muted sm:table-cell">
                      {formatDate(c.created_at)}
                    </td>
                    <td className="border-b border-line-soft py-3 pr-3 text-right sm:px-4">
                      <Link
                        href={`/clients?edit=${c.id}`}
                        aria-label={`Edit ${c.name}`}
                        className="inline-flex rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink focus-visible:text-ink"
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
