"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ListChecks, Pencil, Sun, AlertTriangle, CalendarDays, Archive } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { quickAddTask } from "@/app/(app)/tasks/actions";
import { priorityBadge } from "@/lib/status";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Task, TaskWithProject } from "@/lib/types";
import { TaskCheckbox } from "./TaskCheckbox";
import { TaskForm, type ProjectOption } from "./TaskForm";

export type TasksPanel = { mode: "new" } | { mode: "edit"; task: Task } | null;
export type TaskWorkspace = "work" | "personal";

/** `iso` moved by whole days, kept as a wall-clock date string. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOf(task: TaskWithProject): string | null {
  return task.due_at ? task.due_at.slice(0, 10) : null;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/* -------------------------------------------------------------------- pieces */

/** Medium is the default and carries no information; only the exceptions get a mark. */
function PriorityDot({ priority }: { priority: string }) {
  if (priority === "med") return null;
  const pb = priorityBadge(priority);
  return (
    <span className={cn("task-prio", `task-prio-${priority}`)}>
      <i aria-hidden />
      {pb.label}
    </span>
  );
}

/** A task as a card, for the three columns. */
function TaskCard({ task, basePath }: { task: TaskWithProject; basePath: string }) {
  const done = task.status === "done";
  return (
    <div className={cn("task-card group", done && "task-card-done")}>
      <TaskCheckbox id={task.id} done={done} />
      <div className="task-card-body">
        <span className={cn("task-card-title", done && "line-through")}>{task.title}</span>
        {task.project?.title && (
          <Link href={`/projects/${task.project_id}`} className="task-card-project">
            {task.project.client?.name ? `${task.project.client.name} · ` : ""}
            {task.project.title}
          </Link>
        )}
        <span className="task-card-meta">
          <PriorityDot priority={task.priority} />
          {task.due_at && <span className="mono task-card-date">{formatDateTime(task.due_at)}</span>}
        </span>
      </div>
      <Link
        href={`${basePath}?edit=${task.id}`}
        aria-label={`Edit ${task.title}`}
        className="task-edit"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/** A task as a row, for the wider Today panel. */
function TaskRow({ task, basePath }: { task: TaskWithProject; basePath: string }) {
  const done = task.status === "done";
  return (
    <div className="task-row group">
      <TaskCheckbox id={task.id} done={done} />
      <div className="min-w-0 flex-1">
        <div className={cn("task-row-title", done && "text-faint line-through")}>{task.title}</div>
        {task.project?.title && (
          <Link href={`/projects/${task.project_id}`} className="task-card-project">
            {task.project.client?.name ? `${task.project.client.name} · ` : ""}
            {task.project.title}
          </Link>
        )}
      </div>
      <PriorityDot priority={task.priority} />
      {task.due_at && <span className="mono task-row-date">{formatDateTime(task.due_at)}</span>}
      <Link
        href={`${basePath}?edit=${task.id}`}
        aria-label={`Edit ${task.title}`}
        className="task-edit"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/**
 * One field, and a date the panel already knows.
 *
 * Passing a function to `action` lets React clear the field itself once the task is
 * in, which is what makes this usable for three thoughts in a row rather than one.
 */
function QuickAdd({
  workspace,
  dueOn,
  placeholder,
}: {
  workspace: TaskWorkspace;
  /** `null` files it with no date at all. */
  dueOn: string | null;
  placeholder: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      className="task-quickadd"
      action={async (formData: FormData) => {
        await quickAddTask(formData);
        router.refresh();
      }}
    >
      <input type="hidden" name="workspace" value={workspace} />
      {dueOn && <input type="hidden" name="due_at" value={`${dueOn}T09:00`} />}
      <Plus className="task-quickadd-icon h-4 w-4" aria-hidden />
      <input
        name="title"
        required
        maxLength={200}
        placeholder={placeholder}
        aria-label={placeholder}
        className="task-quickadd-input"
      />
      {/*
        Two ways to add a task is fine as long as they are visibly two different jobs.
        This one takes a title and nothing else, and says so: it lands on today at
        normal priority. Anything that needs a date, a project or a priority is what
        the New task button is for.
      */}
      <span className="task-quickadd-hint">adds to today</span>
      <button type="submit" className="task-quickadd-go">
        Add
      </button>
    </form>
  );
}

function Column({
  title,
  icon: Icon,
  tone,
  tasks,
  basePath,
  empty,
}: {
  title: string;
  icon: typeof Sun;
  tone: "late" | "week" | "later";
  tasks: TaskWithProject[];
  basePath: string;
  empty: string;
}) {
  return (
    <section className={cn("task-column", `task-column-${tone}`)}>
      <header className="task-column-head">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="task-column-title">{title}</span>
        <span className="mono task-column-count">{tasks.length}</span>
      </header>
      <div className="task-column-body">
        {tasks.length === 0 ? (
          <p className="task-column-empty">{empty}</p>
        ) : (
          tasks.map((t) => <TaskCard key={t.id} task={t} basePath={basePath} />)
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- view */

export function TasksView({
  tasks,
  projects,
  panel,
  workspace = "work",
  today,
}: {
  tasks: TaskWithProject[];
  projects: ProjectOption[];
  panel: TasksPanel;
  workspace?: TaskWorkspace;
  /** The user's own date, settled on the server so hydration cannot disagree. */
  today: string;
}) {
  const router = useRouter();
  const personal = workspace === "personal";
  const basePath = personal ? "/private/tasks" : "/tasks";
  const close = () => router.push(basePath);

  const open = tasks.filter((t) => t.status === "todo");
  const done = tasks.filter((t) => t.status === "done");
  const weekEnd = addDays(today, 7);

  /*
    Four buckets, and the split that matters is between late and today. The old screen
    put both under one heading, which is how a task quietly stays three days overdue:
    it keeps appearing on a list you have already read.
  */
  const overdue = open.filter((t) => {
    const d = dayOf(t);
    return d !== null && d < today;
  });
  const todayTasks = open.filter((t) => dayOf(t) === today);
  const week = open.filter((t) => {
    const d = dayOf(t);
    return d !== null && d > today && d <= weekEnd;
  });
  const later = open.filter((t) => {
    const d = dayOf(t);
    return d === null || d > weekEnd;
  });

  const summary = (() => {
    if (open.length === 0) return "Nothing open. Enjoy it.";
    const parts: string[] = [];
    if (overdue.length) parts.push(`${plural(overdue.length, "task is", "tasks are")} late`);
    if (todayTasks.length) parts.push(`${plural(todayTasks.length, "is", "are")} due today`);
    if (!parts.length) return `Nothing due yet — ${plural(open.length, "task", "tasks")} ahead.`;
    return `${parts.join(", ")}.`;
  })();

  return (
    <div className="tasks-premium money-premium mx-auto max-w-300">
      <div className="money-page-head mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="money-page-kicker">{personal ? "Private" : "Freelance"} · Tasks</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            {personal ? "Personal tasks" : "Tasks"}
          </h1>
          <p className={cn("task-summary", overdue.length > 0 && "task-summary-late")}>{summary}</p>
        </div>
        <Link
          href={`${basePath}?new=1`}
          className={buttonClasses("primary", "money-premium-button")}
        >
          <Plus className="h-4 w-4" />
          New task
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div className="money-empty-panel rounded-card border border-line bg-surface">
          <EmptyState
            icon={ListChecks}
            title="No tasks yet"
            description={
              personal
                ? "Everything outside work lives here — errands, appointments, the small stuff."
                : "Add a task, set a priority and a due date to see it here."
            }
            action={
              <Link
                href={`${basePath}?new=1`}
                className={buttonClasses("primary", "money-premium-button")}
              >
                New task
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {/*
            Today is the only list most days need, so it takes the room and the top of
            the page. Everything below it is context for it.
          */}
          <section className="task-focus">
            <header className="task-focus-head">
              <span className="money-page-kicker">
                <Sun className="mr-1.5 inline h-3 w-3" aria-hidden /> Today
              </span>
              <span className="mono task-focus-count">
                {todayTasks.length === 0 ? "clear" : plural(todayTasks.length, "task", "tasks")}
              </span>
            </header>

            <QuickAdd workspace={workspace} dueOn={today} placeholder="What needs doing today?" />

            <div className="task-focus-body">
              {todayTasks.length === 0 ? (
                <p className="task-focus-empty">
                  Nothing is due today.{" "}
                  {overdue.length > 0
                    ? "Clearing what is late is the next best thing."
                    : "The columns below are what is coming."}
                </p>
              ) : (
                todayTasks.map((t) => <TaskRow key={t.id} task={t} basePath={basePath} />)
              )}
            </div>
          </section>

          <div className="task-board">
            <Column
              title="Late"
              icon={AlertTriangle}
              tone="late"
              tasks={overdue}
              basePath={basePath}
              empty="Nothing is late."
            />
            <Column
              title="This week"
              icon={CalendarDays}
              tone="week"
              tasks={week}
              basePath={basePath}
              empty="Nothing due in the next seven days."
            />
            <Column
              title="Later & undated"
              icon={Archive}
              tone="later"
              tasks={later}
              basePath={basePath}
              empty="Nothing parked."
            />
          </div>

          {done.length > 0 && (
            <details className="task-done">
              <summary className="task-done-summary">
                <span>{plural(done.length, "finished task", "finished tasks")}</span>
                <i aria-hidden />
              </summary>
              <div className="task-done-body">
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} basePath={basePath} />
                ))}
              </div>
            </details>
          )}
        </>
      )}

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
