"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban, Pencil } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { projectStatusBadge } from "@/lib/status";
import { formatMoney, formatDate } from "@/lib/format";
import type { Project, ProjectWithClient } from "@/lib/types";
import { ProjectForm, type ClientOption } from "./ProjectForm";

export type ProjectsPanel =
  | { mode: "new" }
  | { mode: "edit"; project: Project }
  | null;

export function ProjectsView({
  projects,
  clients,
  panel,
}: {
  projects: ProjectWithClient[];
  clients: ClientOption[];
  panel: ProjectsPanel;
}) {
  const router = useRouter();
  const close = () => router.push("/projects");

  return (
    <div className="mx-auto max-w-300">
      <PageHeader
        kicker="The work itself"
        title="Projects"
        lede="What is on, what is waiting, and what is finished."
        stats={[
          { label: "All", value: String(projects.length) },
          {
            label: "Active",
            value: String(projects.filter((p) => p.status === "active").length),
            tone: "gold",
          },
        ]}
        actions={
          <Link href="/projects?new=1" className={buttonClasses("primary", "zv-turn")}>
            <Plus className="h-4 w-4" />
            New project
          </Link>
        }
      />

      <Panel>
        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create your first project to track its status and value."
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
                    Client
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
                  <th className="border-b border-line-soft px-4 py-2.75" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const badge = projectStatusBadge(p.status);
                  return (
                    <tr
                      key={p.id}
                      className="zv-row group"
                    >
                      <td className="border-b border-line-soft px-4 py-3 font-semibold text-ink">
                        <Link
                          href={`/projects/${p.id}`}
                          transitionTypes={["zv-forward"]}
                          className="hover:text-gold-hi"
                        >
                          {p.title}
                        </Link>
                      </td>
                      <td className="border-b border-line-soft px-4 py-3 text-muted">
                        {p.client?.name ?? "—"}
                      </td>
                      <td className="border-b border-line-soft px-4 py-3">
                        <Badge status={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="mono border-b border-line-soft px-4 py-3 text-right text-ink">
                        {formatMoney(p.value, p.currency)}
                      </td>
                      <td className="mono border-b border-line-soft px-4 py-3 text-right text-muted">
                        {formatDate(p.due_date)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-3 text-right">
                        <Link
                          href={`/projects?edit=${p.id}`}
                          aria-label={`Edit ${p.title}`}
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
        title={panel?.mode === "edit" ? "Edit project" : "New project"}
      >
        <ProjectForm
          project={panel?.mode === "edit" ? panel.project : undefined}
          clients={clients}
        />
      </SlideOver>
    </div>
  );
}
