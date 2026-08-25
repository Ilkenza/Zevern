"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ListChecks, Pencil, AlertTriangle, Inbox, CalendarRange } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { deleteTask, quickAddTask } from "@/app/(app)/tasks/actions";
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

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return { weekday: WEEKDAY[d.getUTCDay()], day: d.getUTCDate(), month: MONTH[d.getUTCMonth()] };
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** How late something is, in words, for the band that holds only late things. */
function lateBy(due: string, today: string): string {
  const days = Math.round(
    (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${due}T00:00:00Z`).getTime()) / 86_400_000,
  );
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days late`;
  if (days < 14) return "a week late";
  if (days < 60) return `${Math.round(days / 7)} weeks late`;
  return `${Math.round(days / 30)} months late`;
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

function RowActions({
  task,
  basePath,
  workspace,
}: {
  task: TaskWithProject;
  basePath: string;
  workspace: TaskWorkspace;
}) {
  return (
    <span className="task-actions">
      <Link
        href={`${basePath}?edit=${task.id}`}
        aria-label={`Edit ${task.title}`}
        title="Edit"
        className="task-edit"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
      <DeleteButton
        compact
        label={`Delete ${task.title}`}
        confirmText={`Delete "${task.title}"? This cannot be undone.`}
        action={async () => {
          await deleteTask(task.id, workspace);
        }}
      />
    </span>
  );
}

/**
 * One task, one line, full width.
 *
 * Everything on the screen is now a single day's worth of work, so the row does not
 * have to repeat which band it is in — the rail above already said that. What is
 * left is the thing itself, what it belongs to, how urgent it is and, when it has
 * one, the hour it is due at.
 */
function TaskRow({
  task,
  basePath,
  workspace,
  note,
}: {
  task: TaskWithProject;
  basePath: string;
  workspace: TaskWorkspace;
  /** Only the late band and the parked band need to say when — the rest is the rail. */
  note?: string;
}) {
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
      {note ? (
        <span className="task-row-note">{note}</span>
      ) : (
        task.due_at && <span className="mono task-row-date">{formatDateTime(task.due_at)}</span>
      )}
      <RowActions task={task} basePath={basePath} workspace={workspace} />
    </div>
  );
}

/**
 * One field, and the date the rail is currently pointing at.
 *
 * Passing a function to `action` lets React clear the field itself once the task is
 * in, which is what makes this usable for three thoughts in a row rather than one.
 */
function QuickAdd({
  workspace,
  dueOn,
  placeholder,
  hint,
}: {
  workspace: TaskWorkspace;
  /** `null` files it with no date at all. */
  dueOn: string | null;
  placeholder: string;
  hint: string;
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
      {/*
        Midnight, not nine o'clock. A quick add is a date, not an appointment — and
        `09:00` meant anything typed after breakfast was stamped with a time that had
        already gone. `formatDateTime` reads midnight as "no time was set".
      */}
      {dueOn && <input type="hidden" name="due_at" value={`${dueOn}T00:00`} />}
      <Plus className="task-quickadd-icon h-4 w-4" aria-hidden />
      <input
        name="title"
        required
        maxLength={200}
        placeholder={placeholder}
        aria-label={placeholder}
        className="task-quickadd-input"
      />
      <span className="task-quickadd-hint">{hint}</span>
      <button type="submit" className="task-quickadd-go">
        Add
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------- the rail */

type Band = {
  key: string;
  /** The line the chip leads with. */
  lead: string;
  /** The smaller line under it — a date, or nothing. */
  sub?: string;
  tone: "late" | "day" | "today" | "parked";
  tasks: TaskWithProject[];
  /** Where a quick add typed while this band is open should land. */
  dueOn: string | null;
  title: string;
  empty: string;
  placeholder: string;
  hint: string;
};

function Chip({ band, on, onPick }: { band: Band; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={cn("task-chip", `task-chip-${band.tone}`, on && "task-chip-on")}
    >
      <span className="task-chip-lead">{band.lead}</span>
      {band.sub && <span className="task-chip-sub">{band.sub}</span>}
      <span className={cn("mono task-chip-count", band.tasks.length === 0 && "is-zero")}>
        {band.tasks.length}
      </span>
    </button>
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

  const open = useMemo(() => tasks.filter((t) => t.status === "todo"), [tasks]);
  const done = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  /*
    A week of days, and the three bands that are not days.

    The old screen was Today plus Late / This week / Later — four blocks on the page at
    once, three of them usually reporting things you were not going to do today, and
    every one of them growing downwards as tasks piled up. This shows one band at a
    time and puts the rest in a rail you can count at a glance: the page stops growing,
    and "what does Thursday look like" becomes one click instead of a scroll.
  */
  const bands = useMemo<Band[]>(() => {
    const horizon = addDays(today, 6);
    const list: Band[] = [];

    const late = open
      .filter((t) => {
        const d = dayOf(t);
        return d !== null && d < today;
      })
      .sort((a, b) => (dayOf(a) ?? "").localeCompare(dayOf(b) ?? ""));

    if (late.length > 0) {
      list.push({
        key: "late",
        lead: "Late",
        tone: "late",
        tasks: late,
        dueOn: today,
        title: "Past their date",
        empty: "Nothing is late.",
        placeholder: "Something else that should already be done?",
        hint: "lands on today",
        sub: plural(late.length, "task", "tasks"),
      });
    }

    for (let i = 0; i < 7; i += 1) {
      const iso = addDays(today, i);
      const p = parts(iso);
      const lead = i === 0 ? "Today" : i === 1 ? "Tomorrow" : p.weekday;
      list.push({
        key: iso,
        lead,
        sub: `${p.day} ${p.month}`,
        tone: i === 0 ? "today" : "day",
        tasks: open.filter((t) => dayOf(t) === iso),
        dueOn: iso,
        title: i === 0 ? "Today" : `${p.weekday} ${p.day} ${p.month}`,
        empty: i === 0 ? "Nothing due today." : "Nothing due that day.",
        placeholder: i === 0 ? "What needs doing today?" : `What needs doing on ${lead}?`,
        hint: i === 0 ? "lands on today" : `lands on ${p.day} ${p.month}`,
      });
    }

    const later = open.filter((t) => {
      const d = dayOf(t);
      return d !== null && d > horizon;
    });
    const undated = open.filter((t) => dayOf(t) === null);

    if (later.length > 0) {
      list.push({
        key: "later",
        lead: "Later",
        sub: "beyond the week",
        tone: "parked",
        tasks: later.sort((a, b) => (dayOf(a) ?? "").localeCompare(dayOf(b) ?? "")),
        dueOn: addDays(today, 7),
        title: "Beyond this week",
        empty: "Nothing parked further out.",
        placeholder: "Something for later?",
        hint: "lands next week",
      });
    }

    list.push({
      key: "undated",
      lead: "No date",
      sub: "someday",
      tone: "parked",
      tasks: undated,
      dueOn: null,
      title: "No date on it",
      empty: "Everything open has a date.",
      placeholder: "Something you are not dating yet?",
      hint: "no date",
    });

    return list;
  }, [open, today]);

  // Late first, because a day you have already missed outranks the one you are in.
  const [picked, setPicked] = useState<string | null>(null);
  const fallback = bands.some((b) => b.key === "late") ? "late" : today;
  const activeKey = picked && bands.some((b) => b.key === picked) ? picked : fallback;
  const band = bands.find((b) => b.key === activeKey) ?? bands[0];

  const lateCount = bands.find((b) => b.key === "late")?.tasks.length ?? 0;
  const todayCount = bands.find((b) => b.key === today)?.tasks.length ?? 0;

  const summary = (() => {
    if (open.length === 0) return "Nothing open. Enjoy it.";
    const said: string[] = [];
    if (lateCount) said.push(`${plural(lateCount, "task is", "tasks are")} late`);
    if (todayCount) said.push(`${plural(todayCount, "is", "are")} due today`);
    if (!said.length) return `Nothing due yet — ${plural(open.length, "task", "tasks")} ahead.`;
    return `${said.join(", ")}.`;
  })();

  return (
    <div className="tasks-premium money-premium mx-auto max-w-300">
      <div className="money-page-head mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="money-page-kicker">{personal ? "Private" : "Freelance"} · Tasks</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            {personal ? "Personal tasks" : "Tasks"}
          </h1>
          <p className={cn("task-summary", lateCount > 0 && "task-summary-late")}>{summary}</p>
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
          <nav className="task-rail" aria-label="Pick a day">
            {bands.map((b) => (
              <Chip key={b.key} band={b} on={b.key === activeKey} onPick={() => setPicked(b.key)} />
            ))}
          </nav>

          {band && (
            <section className="task-panel">
              <header className="task-panel-head">
                <span className="task-panel-title">
                  {band.tone === "late" ? (
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  ) : band.tone === "parked" ? (
                    <Inbox className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {band.title}
                </span>
                <span className="mono task-panel-count">
                  {band.tasks.length === 0 ? "clear" : plural(band.tasks.length, "task", "tasks")}
                </span>
              </header>

              <QuickAdd
                workspace={workspace}
                dueOn={band.dueOn}
                placeholder={band.placeholder}
                hint={band.hint}
              />

              {band.tasks.length === 0 ? (
                <p className="task-panel-empty">{band.empty}</p>
              ) : (
                <div className="task-panel-body">
                  {band.tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      basePath={basePath}
                      workspace={workspace}
                      note={
                        band.tone === "late" && dayOf(t)
                          ? lateBy(dayOf(t) as string, today)
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {done.length > 0 && (
        <details className="task-done">
          <summary className="task-done-summary">
            <span>{plural(done.length, "finished task", "finished tasks")}</span>
            <i aria-hidden />
          </summary>
          <div className="task-done-body">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} basePath={basePath} workspace={workspace} />
            ))}
          </div>
        </details>
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
