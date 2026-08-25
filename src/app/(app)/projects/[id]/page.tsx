import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { deleteProject } from "../actions";
import { projectStatusBadge } from "@/lib/status";
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

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const badge = projectStatusBadge(project.status);

  return (
    <div className="mx-auto max-w-300 space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-ink"
      
        transitionTypes={["zv-back"]}
      >
        <ArrowLeft className="h-4 w-4" />
        Projects
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-extrabold tracking-[-0.5px] text-ink">
            {project.title}
          </h1>
          <div className="mt-2">
            <Badge status={badge.variant}>{badge.label}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects?edit=${project.id}`}
            className={buttonClasses("secondary")}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
          <DeleteButton
            action={deleteProject.bind(null, project.id)}
            confirmText={`Delete "${project.title}"?`}
          />
        </div>
      </div>

      <Panel title="Details">
        <div className="grid grid-cols-2 gap-5 px-4 py-4 sm:grid-cols-3">
          <Stat label="Client">
            {project.client?.name ?? <span className="text-muted">—</span>}
          </Stat>
          <Stat label="Value">
            <span className="mono">
              {formatMoney(project.value, project.currency)}
            </span>
          </Stat>
          <Stat label="Due">
            <span className="mono">{formatDate(project.due_date)}</span>
          </Stat>
        </div>
      </Panel>

      {project.description && (
        <Panel title="Description">
          <p className="whitespace-pre-wrap px-4 py-4 text-[13px] leading-relaxed text-muted">
            {project.description}
          </p>
        </Panel>
      )}
    </div>
  );
}
