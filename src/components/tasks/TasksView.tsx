"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ListChecks, Pencil } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { priorityBadge } from "@/lib/status";
import { formatDateTime, isToday, isOverdue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Task, TaskWithProject } from "@/lib/types";
import { TaskCheckbox } from "./TaskCheckbox";
import { TaskForm, type ProjectOption } from "./TaskForm";

export type TasksPanel = { mode: "new" } | { mode: "edit"; task: Task } | null;
export type TaskWorkspace = "work" | "personal";

function TaskRow({ task, basePath }: { task: TaskWithProject; basePath: string }) {
  const done = task.status === "done";
  const pb = priorityBadge(task.priority);
  return (
    <div className="group flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0 hover:bg-white/2">
      <TaskCheckbox id={task.id} done={done} />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[13.5px] font-medium",
            done ? "text-faint line-through" : "text-ink",
          )}
        >
          {task.title}
        </div>
        {task.project?.title && (
          <Link
            href={`/projects/${task.project_id}`}
            className="text-[11.5px] text-muted hover:text-gold-hi"
          >
            {task.project.client?.name ? `${task.project.client.name} · ` : ""}
            {task.project.title}
          </Link>
        )}
      </div>
      {!done && <Badge status={pb.variant}>{pb.label}</Badge>}
      <span className="mono w-30 shrink-0 text-right text-[12px] text-muted">
        {formatDateTime(task.due_at)}
      </span>
      <Link
        href={`${basePath}?edit=${task.id}`}
        aria-label={`Edit ${task.title}`}
        className="inline-flex rounded-ctrl p-1.5 text-faint opacity-0 transition-opacity hover:bg-white/5 hover:text-ink group-hover:opacity-100"
      >
        <Pencil className="h-3.75 w-3.75" />
      </Link>
    </div>
  );
}

function Section({
  title,
  accent,
  tasks,
  basePath,
}: {
  title: string;
  accent: string;
  tasks: TaskWithProject[];
  basePath: string;
}) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line-soft bg-white/15 px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.07em]">
        <span className={accent}>{title}</span>
        <span className="mono text-faint">{tasks.length}</span>
      </div>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} basePath={basePath} />
      ))}
    </div>
  );
}

export function TasksView({
  tasks,
  projects,
  panel,
  workspace = "work",
}: {
  tasks: TaskWithProject[];
  projects: ProjectOption[];
  panel: TasksPanel;
  workspace?: TaskWorkspace;
}) {
  const router = useRouter();
  const personal = workspace === "personal";
  const basePath = personal ? "/private/tasks" : "/tasks";
  const close = () => router.push(basePath);

  const open = tasks.filter((t) => t.status === "todo");
  const done = tasks.filter((t) => t.status === "done");

  const overdue = open.filter((t) => isOverdue(t.due_at));
  const today = open.filter((t) => isToday(t.due_at));
  const upcoming = open.filter(
    (t) => t.due_at && !isOverdue(t.due_at) && !isToday(t.due_at),
  );
  const noDate = open.filter((t) => !t.due_at);

  return (
    <div className="mx-auto max-w-300">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
          {personal ? "Personal tasks" : "Tasks"}
        </h1>
        <Link href={`${basePath}?new=1`} className={buttonClasses("primary")}>
          <Plus className="h-4 w-4" />
          New task
        </Link>
      </div>

      <Panel>
        {tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No tasks yet"
            description={
              personal
                ? "Everything outside work lives here — errands, appointments, the small stuff."
                : "Add a task, set a priority and a due date to see it here."
            }
            action={
              <Link href={`${basePath}?new=1`} className={buttonClasses("primary")}>
                New task
              </Link>
            }
          />
        ) : (
          <div>
            <Section title="Overdue" accent="text-danger" tasks={overdue} basePath={basePath} />
            <Section title="Today" accent="text-gold" tasks={today} basePath={basePath} />
            <Section title="Upcoming" accent="text-muted" tasks={upcoming} basePath={basePath} />
            <Section title="No date" accent="text-muted" tasks={noDate} basePath={basePath} />
            <Section title="Done" accent="text-faint" tasks={done} basePath={basePath} />
          </div>
        )}
      </Panel>

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.mode === "edit" ? "Edit task" : "New task"}
      >
        <TaskForm
          task={panel?.mode === "edit" ? panel.task : undefined}
          projects={projects}
          workspace={workspace}
        />
      </SlideOver>
    </div>
  );
}
