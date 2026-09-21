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
            // "In progress" — the same count the Overview's `Active projects` shows. This
            // read `"active"`, which is not a status, and so showed 0 whatever was running.
            value: String(projects.filter((p) => p.status === "in_progress").length),
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
                  <th className="hidden border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted sm:table-cell">
                    Client
                  </th>
                  <th className="hidden border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted sm:table-cell">
                    Status
                  </th>
                  <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                    Value
                  </th>
                  <th className="hidden border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted sm:table-cell">
                    Due
                  </th>
                  <th className="border-b border-line-soft py-2.75 pr-3 sm:px-4" />
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
                      <td className="border-b border-line-soft px-4 py-3 font-semibold text-ink max-sm:w-full max-sm:max-w-0">
                        <Link
                          href={`/projects/${p.id}`}
                          transitionTypes={["zv-forward"]}
                          className="hover:text-gold-hi"
                        >
                          {p.title}
                        </Link>
                        {/*
                          On a phone the row is two lines instead of six columns: who it is
                          for and when it is due under the title, the status under the value.
                          Six columns in 350px either scroll sideways — hiding the value, the
                          one figure the list is for — or squeeze every title to one word a line.

                          The cell is `w-full max-w-0` there, the same on every list: a table
                          sizes a column by its longest line that cannot wrap, and a truncated
                          line counts at its full length — so without it this one line pushed
                          the value back off the screen. With it the column takes what is left
                          and the line ends in an ellipsis.
                        */}
                        {(p.client?.name || p.due_date) && (
                          <div className="mt-0.5 truncate text-[11.5px] font-normal text-muted sm:hidden">
                            {[p.client?.name, p.due_date ? `due ${formatDate(p.due_date)}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="hidden border-b border-line-soft px-4 py-3 text-muted sm:table-cell">
                        {p.client?.name ?? "—"}
                      </td>
                      <td className="hidden border-b border-line-soft px-4 py-3 sm:table-cell">
                        <Badge status={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="border-b border-line-soft px-4 py-3 text-right text-ink">
                        <div className="mono whitespace-nowrap">
                          {formatMoney(p.value, p.currency)}
                        </div>
                        <div className="mt-1 sm:hidden">
                          <Badge status={badge.variant}>{badge.label}</Badge>
                        </div>
                      </td>
                      <td className="mono hidden border-b border-line-soft px-4 py-3 text-right whitespace-nowrap text-muted sm:table-cell">
                        {formatDate(p.due_date)}
                      </td>
                      <td className="border-b border-line-soft py-3 pr-3 text-right sm:px-4">
                        <Link
                          href={`/projects?edit=${p.id}`}
                          aria-label={`Edit ${p.title}`}
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
