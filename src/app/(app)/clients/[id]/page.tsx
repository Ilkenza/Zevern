import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getClient } from "@/lib/data/clients";
import { getProjectsByClient } from "@/lib/data/projects";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { deleteClient } from "../actions";
import { projectStatusBadge } from "@/lib/status";
import { formatCurrency, formatDate } from "@/lib/format";
import { FolderKanban } from "lucide-react";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const projects = await getProjectsByClient(id);

  return (
    <div className="mx-auto max-w-300 space-y-6">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-ink"
      
        transitionTypes={["zv-back"]}
      >
        <ArrowLeft className="h-4 w-4" />
        Clients
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-extrabold tracking-[-0.5px] text-ink">
            {client.name}
          </h1>
          {client.contact && (
            <p className="mt-1 text-[13px] text-muted">{client.contact}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/clients?edit=${client.id}`}
            className={buttonClasses("secondary")}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
          <DeleteButton
            action={deleteClient.bind(null, client.id)}
            confirmText={`Delete "${client.name}"? Its projects stay but lose this client.`}
          />
        </div>
      </div>

      {client.notes && (
        <Panel title="Notes">
          <p className="whitespace-pre-wrap px-4 py-4 text-[13px] leading-relaxed text-muted">
            {client.notes}
          </p>
        </Panel>
      )}

      <Panel title="Projects">
        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects for this client"
            description="Create a project and assign it to this client."
            action={
              <Link href="/projects?new=1" className={buttonClasses("primary")}>
                New project
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Project
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Status
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Value
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Due
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const badge = projectStatusBadge(p.status);
                  return (
                    <tr
                      key={p.id}
                      className="transition-colors hover:bg-white/2"
                    >
                      <td className="border-b border-line-soft px-4 py-3 font-semibold text-ink">
                        <Link
                          href={`/projects/${p.id}`}
                          className="hover:text-gold-hi"
                        >
                          {p.title}
                        </Link>
                      </td>
                      <td className="border-b border-line-soft px-4 py-3">
                        <Badge status={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="mono border-b border-line-soft px-4 py-3 text-right text-ink">
                        {formatCurrency(p.value)}
                      </td>
                      <td className="mono border-b border-line-soft px-4 py-3 text-right text-muted">
                        {formatDate(p.due_date)}
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
