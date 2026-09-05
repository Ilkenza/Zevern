"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ListChecks,
  Pencil,
  AlertTriangle,
  Inbox,
  CalendarRange,
  ArrowLeft,
  CalendarDays,
  Check,
  SkipForward, ChevronDown } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { TaskMonth } from "./TaskMonth";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListBar } from "@/components/ui/ListBar";
import { buttonClasses } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import {
  deleteTask,
  quickAddTask,
  rescheduleTask,
  toggleTask,
} from "@/app/(app)/tasks/actions";
import { priorityBadge } from "@/lib/status";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fold } from "@/lib/money/entry-search";
import type { Task, TaskWithProject } from "@/lib/types";
import { TaskCheckbox } from "./TaskCheckbox";
import { TaskForm, type ProjectOption } from "./TaskForm";

export type TasksPanel = { mode: "new" } | { mode: "edit"; task: Task } | null;
export type TaskWorkspace = "work" | "personal";

/** The main panel is a focus list, not the whole backlog. */
const FOCUS_LIMIT = 10;

/** High first. One table, because two places sort by priority and they must agree. */
const RANK: Record<string, number> = { high: 0, med: 1, low: 2 };

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
  onEdit,
}: {
  task: TaskWithProject;
  basePath: string;
  workspace: TaskWorkspace;
  onEdit?: () => void;
}) {
  return (
    <span className="task-actions">
      <Link
        href={`${basePath}?edit=${task.id}`}
        onClick={onEdit}
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
  hideDate = false,
  onEdit,
}: {
  task: TaskWithProject;
  basePath: string;
  workspace: TaskWorkspace;
  /** Only the late band and the parked band need to say when — the rest is the rail. */
  note?: string;
  /** A day panel already names the date once; repeating it on every row adds no information. */
  hideDate?: boolean;
  onEdit?: () => void;
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
        !hideDate && task.due_at && <span className="mono task-row-date">{formatDateTime(task.due_at)}</span>
      )}
      <RowActions task={task} basePath={basePath} workspace={workspace} onEdit={onEdit} />
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

/**
 * One band, as a tab.
 *
 * It was a tile: two lines, a border, a fill, ninety pixels of height, and ten of them
 * across the top of the screen. That cost a third of the page for an answer that is
 * mostly nought — six of the seven days this week hold nothing — and the row of them
 * could not be made to sit right at every width, because a row holding a variable number
 * of tiles will one day hold the wrong number. Three attempts, three shapes, the same
 * fault each time.
 *
 * A tab has no box to run out of room in. Ten of them are one line of text, the day and
 * its count, and the whole picker is forty-six pixels instead of two hundred. The
 * underline says which one you are on; the date is dropped because the panel below
 * prints the full title anyway, and `Mon` inside this week needs no year.
 *
 * A day holding nothing is dimmed rather than hidden — it is still somewhere to put
 * something, and an empty Wednesday you cannot click is a Wednesday you cannot plan.
 */
function Chip({ band, on, onPick }: { band: Band; on: boolean; onPick: () => void }) {
  const empty = band.tasks.length === 0;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={cn("task-tab", `task-tab-${band.tone}`, on && "is-on", empty && "is-zero")}
    >
      {band.lead}
      <span className="mono task-tab-count">{band.tasks.length}</span>
    </button>
  );
}

/**
 * One band, as a section in a list rather than as the whole screen.
 *
 * The screen used to show a rail of days and one band under it: to see Thursday you
 * clicked Thursday, and the ninety-three tasks on this account were reachable only seven
 * at a time. Every list app people actually live in — Todoist, Asana, ClickUp — stacks
 * its sections instead and lets the scroll do the work, because the question "what is
 * coming" is answered by seeing the shape of the week, not by visiting it.
 *
 * Collapsible, with the count in the header, so a long band can be folded out of the way
 * without leaving the page. Open by default where there is something in it: a section
 * that hides its contents until you ask is a rail again, one indent further in.
 */
/**
 * How many rows a section shows before it offers the rest.
 *
 * Sixty-two tasks are past their date, and the list printed all sixty-two: at forty-one
 * pixels a row that is two and a half thousand pixels of one section, so `Today` — the
 * band anybody opens this screen for — began four screens below the fold. The stacked
 * sections were supposed to make the week readable in one scroll and instead made the
 * first band swallow it.
 *
 * Six is enough to see what a day is made of and short enough that the next heading is
 * still on screen, which is the whole point of the sections. Nothing is hidden: the
 * count sits in the header, and the rest is one press away.
 */
const PREVIEW = 6;

/**
 * How many more rows a press adds.
 *
 * `Show all 62` was one press back to a section two thousand pixels tall — the cap
 * undone in a single gesture, with no way to ask for a bit more. Ten at a time keeps the
 * choice with the reader: a glance costs nothing, a second look costs ten rows, and the
 * end of a band arrives when it arrives.
 */
const STEP = 10;

/**
 * How many days the strip carries, today included.
 *
 * Seven, while the days were tiles that had to fit across the page. Now they scroll, so
 * the limit is no longer the width — it is how far ahead it is worth being able to point
 * at, and four weeks is a month's planning without the strip becoming a calendar. Past
 * it, `Later` still gathers everything.
 */
const DAYS_AHEAD = 28;

function TaskSection({
  band,
  today,
  basePath,
  workspace,
  open: isOpen,
  onToggle,
}: {
  band: Band;
  today: string;
  basePath: string;
  workspace: TaskWorkspace;
  open: boolean;
  onToggle: () => void;
}) {
  const dated = band.tone === "day" || band.tone === "today";
  /*
    Local, not lifted like `shut`. Which band you expanded is about the row you are
    reading right now — it does not want to survive collapsing the section, and a second
    map in the parent would be a second thing to keep in step with the first.
  */
  const [extra, setExtra] = useState(0);
  const shown = band.tasks.slice(0, PREVIEW + extra);
  const rest = band.tasks.length - shown.length;
  const next = Math.min(STEP, rest);

  return (
    <section className={cn("task-sec", `is-${band.tone}`, isOpen && "is-open")}>
      <header className="task-sec-head">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="task-sec-toggle"
        >
          <ChevronDown className="h-3.5 w-3.5 task-sec-caret" aria-hidden />
          <span className="task-sec-title">{band.title}</span>
          <span className="task-sec-count mono">{band.tasks.length}</span>
        </button>
      </header>

      {isOpen && (
        <div className="task-sec-body">
          {shown.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              basePath={basePath}
              workspace={workspace}
              hideDate={dated}
              note={band.tone === "late" && dayOf(t) ? lateBy(dayOf(t) as string, today) : undefined}
            />
          ))}
          {band.tasks.length === 0 && <p className="task-sec-empty">{band.empty}</p>}

          {/*
            The rest of the band, named by how many rather than by a word.

            `Show more` would not say whether pressing it costs you three rows or
            fifty-four, and on this screen that is the difference between a glance and a
            scroll. Once open it says `Show fewer` and gives the count back.
          */}
          {rest > 0 && (
            <button
              type="button"
              onClick={() => setExtra((was) => was + STEP)}
              className="task-sec-more"
            >
              Show {next} more
              <span className="task-sec-more-rest">{rest} left</span>
            </button>
          )}
          {rest === 0 && extra > 0 && (
            <button type="button" onClick={() => setExtra(0)} className="task-sec-more">
              Show fewer
            </button>
          )}

          <QuickAdd
            workspace={workspace}
            dueOn={band.dueOn}
            placeholder={band.placeholder}
            hint={band.hint}
          />
        </div>
      )}
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

  /*
    A way to find one task among fifty.

    This screen shows one band at a time and puts the rest in a rail, which is what keeps
    it from growing downwards — and it is exactly what makes a single task hard to find:
    it is on some day, and the only way to learn which was to click through seven of them.

    So the search narrows every band at once rather than the one on screen. The counts in
    the rail are read off these same lists, so typing a word turns the rail into an answer
    — "it is on Thursday" — before you have clicked anything. Priority is deliberately not
    a filter here: the bands are the priority, and a second axis over them would be two
    screens fighting for the same list.
  */
  const [q, setQ] = useState("");
  const term = fold(q.trim());
  const open = useMemo(
    () =>
      tasks.filter(
        (t) => t.status === "todo" && (!term || fold(t.title ?? "").includes(term)),
      ),
    [tasks, term],
  );
  const done = useMemo(
    () =>
      tasks.filter(
        (t) => t.status === "done" && (!term || fold(t.title ?? "").includes(term)),
      ),
    [tasks, term],
  );
  const hits = open.length + done.length;

  /*
    A week of days, and the three bands that are not days.

    The old screen was Today plus Late / This week / Later — four blocks on the page at
    once, three of them usually reporting things you were not going to do today, and
    every one of them growing downwards as tasks piled up. This shows one band at a
    time and puts the rest in a rail you can count at a glance: the page stops growing,
    and "what does Thursday look like" becomes one click instead of a scroll.
  */
  /*
    The day on screen. Declared above the bands because one of them is built from it: the
    calendar can land on a day the seven-day rail has no chip for, and that day needs a
    band like any other.
  */
  const [picked, setPicked] = useState<string | null>(null);

  /*
    The strip, and the two ways it moves.

    `nudge` is the arrows. The effect is the other half: picking `Later` from the far end,
    or landing on a day the calendar chose, has to bring that tab into view — a strip that
    scrolls but never scrolls itself leaves you looking at a row that does not contain the
    thing you just chose.

    `block: "nearest"` because `scrollIntoView` will otherwise scroll the *page* to centre
    the tab vertically, throwing the tasks under it off screen to fix the strip above it.
  */
  const strip = useRef<HTMLElement>(null);

  const nudge = (dir: 1 | -1) => {
    const el = strip.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const bands = useMemo<Band[]>(() => {
    const horizon = addDays(today, DAYS_AHEAD - 1);
    const list: Band[] = [];

    const late = open
      .filter((t) => {
        const d = dayOf(t);
        return d !== null && d < today;
      })
      /*
        Worst first, then oldest.

        It was oldest first, which is the right order for a queue you will finish and the
        wrong one for a band of sixty-two you will not. Now that a section shows six rows
        before offering the rest, those six are the argument for the whole band — and the
        six oldest are whatever happened to slip first, not what matters. The `2 weeks
        late` note on each row still carries the age.
      */
      .sort(
        (a, b) =>
          (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1) ||
          (dayOf(a) ?? "").localeCompare(dayOf(b) ?? ""),
      );

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

    for (let i = 0; i < DAYS_AHEAD; i += 1) {
      const iso = addDays(today, i);
      const p = parts(iso);
      /*
        `Mon` is a name for one week and an ambiguity for four — the strip now holds four
        Mondays. Past the first week the day number joins it, which is the shortest thing
        that tells them apart.
      */
      const lead =
        i === 0 ? "Today" : i === 1 ? "Tomorrow" : i < 7 ? p.weekday : `${p.weekday} ${p.day}`;
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
        sub: `beyond ${DAYS_AHEAD} days`,
        tone: "parked",
        tasks: later.sort((a, b) => (dayOf(a) ?? "").localeCompare(dayOf(b) ?? "")),
        dueOn: addDays(today, DAYS_AHEAD),
        title: `Beyond the next ${DAYS_AHEAD} days`,
        empty: "Nothing parked further out.",
        placeholder: "Something for later?",
        hint: `lands in ${DAYS_AHEAD} days`,
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

    /*
      And the day the calendar is standing on, when the rail has no chip for it.

      Added here rather than handled beside the rail so that everything downstream — the
      panel, the quick add that lands on the right date, the review — carries on unchanged.
      A day is a day; where it was chosen is not the list's business.
    */
    if (picked && /^\d{4}-\d{2}-\d{2}$/.test(picked) && !list.some((b) => b.key === picked)) {
      const p = parts(picked);
      list.push({
        key: picked,
        lead: p.weekday,
        sub: `${p.day} ${p.month}`,
        tone: picked < today ? "late" : "day",
        tasks: open
          .filter((t) => dayOf(t) === picked)
          .sort((a, b) => (dayOf(a) ?? "").localeCompare(dayOf(b) ?? "")),
        dueOn: picked,
        title: `${p.weekday} ${p.day} ${p.month}`,
        empty: "Nothing due that day.",
        placeholder: `What needs doing on ${p.day} ${p.month}?`,
        hint: `lands on ${p.day} ${p.month}`,
      });
    }

    return list;
  }, [open, today, picked]);

  /*
    Which of the two readings of the same list is on screen.

    `Days` is the rail — seven days and three buckets, the shape for "what is today". The
    calendar is the shape for the other question, which is *when*: it is the only view
    that can show an empty Thursday three weeks out without reading every row between here
    and there. Nothing below the switch knows which one chose the day.
  */
  /*
    Which shape the list is read in. `list` leads because it is the one that answers the
    question this screen exists for without a click: everything, in order, in one scroll.
  */
  const [mode, setMode] = useState<"list" | "days" | "month">("list");
  const asMonth = mode === "month";
  /* Sections a person has folded shut. Absent means open — see `TaskSection`. */
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [reviewing, setReviewing] = useState(false);
  /*
    Whether this review is over the whole band or only what the focus list left behind.

    Two different intents on one flow. The panel's own `Review remaining 52` means the
    ones the focus list did not show; the bar at the top of the page means all sixty-two,
    because that is the number on the bar and a review that quietly starts at the
    eleventh would be counting something else.
  */
  const [reviewAll, setReviewAll] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewPending, startReviewTransition] = useTransition();
  const fallback = bands.some((b) => b.key === "late") ? "late" : today;
  const activeKey = picked && bands.some((b) => b.key === picked) ? picked : fallback;

  /*
    Bring the chosen tab into view.

    A strip that scrolls but never scrolls itself leaves you looking at a row that does
    not contain the thing you just chose — picking `Later` from the far end, or landing on
    a day the calendar picked, would move the panel below while the strip above stayed
    where it was. `block: "nearest"` because the default would scroll the *page* to centre
    the tab vertically, pushing the tasks off screen to tidy the strip above them.
  */
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>(".task-tab.is-on")
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeKey]);
  const band = bands.find((b) => b.key === activeKey) ?? bands[0];
  const rankedTasks = [...(band?.tasks ?? [])].sort(
    (a, b) => (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1),
  );
  /*
    How many extra rows the open day is showing, and which day asked for them.

    Keyed by the band rather than reset by an effect: picking another day makes the key
    stop matching and the count falls back to nought on its own. React Compiler will not
    take a `setState` in an effect, and this needs no effect to begin with.
  */
  const [dayExtra, setDayExtra] = useState<{ key: string; n: number }>({ key: "", n: 0 });
  const shownOnDay = FOCUS_LIMIT + (dayExtra.key === activeKey ? dayExtra.n : 0);
  const focusTasks = rankedTasks.slice(0, shownOnDay);
  const remainingTasks = rankedTasks.slice(shownOnDay);
  const reviewPool = reviewAll ? rankedTasks : remainingTasks;
  const safeReviewIndex = reviewPool.length ? Math.min(reviewIndex, reviewPool.length - 1) : 0;
  const reviewTask = reviewPool[safeReviewIndex] ?? null;
  const reviewComplete = reviewing && (reviewed >= reviewTotal || reviewTask === null);

  /*
    How many open tasks land on each day, and which of those days are already behind.

    Over every open task rather than over the bands, because the bands stop at seven days
    and the calendar does not — that is the whole reason it exists.
  */
  const byDay = useMemo(() => {
    const counts = new Map<string, number>();
    const late = new Set<string>();
    for (const task of open) {
      const day = dayOf(task);
      if (!day) continue;
      counts.set(day, (counts.get(day) ?? 0) + 1);
      if (day < today) late.add(day);
    }
    return { counts, late };
  }, [open, today]);

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

  const leaveReview = () => {
    setReviewing(false);
    setReviewAll(false);
    setReviewIndex(0);
    setReviewed(0);
    setReviewTotal(0);
  };

  const beginReview = () => {
    setReviewing(true);
    setReviewAll(false);
    setReviewIndex(0);
    setReviewed(0);
    setReviewTotal(remainingTasks.length);
  };

  /*
    The one thing that makes sixty-two into sixty-one.

    This flow already existed and was unreachable: it lived at the bottom of the `One
    day` panel, under a focus list, in a mode he was not in. So the screen offered every
    way of *looking* at a backlog and no way of *deciding* it, and no arrangement of rows
    — not a board, not a calendar — takes a task off that list. One decision at a time
    does.
  */
  const startTriage = () => {
    setMode("days");
    setPicked("late");
    setReviewing(true);
    setReviewAll(true);
    setReviewIndex(0);
    setReviewed(0);
    setReviewTotal(lateCount);
  };

  const reviewMove = (dueOn: string | null) => {
    if (!reviewTask || reviewPending) return;
    startReviewTransition(async () => {
      await rescheduleTask(reviewTask.id, dueOn, workspace);
      setReviewed((value) => value + 1);
      router.refresh();
    });
  };

  const reviewDone = () => {
    if (!reviewTask || reviewPending) return;
    startReviewTransition(async () => {
      await toggleTask(reviewTask.id, true);
      setReviewed((value) => value + 1);
      router.refresh();
    });
  };

  const reviewSkip = () => {
    if (!reviewTask || reviewPending) return;
    setReviewed((value) => value + 1);
    setReviewIndex((value) => (remainingTasks.length > 1 ? (value + 1) % remainingTasks.length : 0));
  };

  const reviewDates = (() => {
    if (!band) return [];
    if (band.key === "late") {
      return [
        { label: "Today", on: today },
        { label: "Tomorrow", on: addDays(today, 1) },
      ];
    }
    if (band.key === today) {
      return [
        { label: "Tomorrow", on: addDays(today, 1) },
        { label: "Later", on: addDays(today, 7) },
      ];
    }
    if (band.key === "later") {
      return [
        { label: "Today", on: today },
        { label: "No date", on: null },
      ];
    }
    if (band.key === "undated") {
      return [
        { label: "Today", on: today },
        { label: "Tomorrow", on: addDays(today, 1) },
      ];
    }
    const reviewDue = reviewTask ? dayOf(reviewTask) : null;
    return [
      { label: "Today", on: today },
      { label: "Later", on: addDays(reviewDue ?? today, 7) },
    ];
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
          {/*
            Above the rail, because it governs the rail rather than the band under it.
            Only once the list is long enough that finding a task by eye has stopped
            being possible; below that the rail already shows you everything.
          */}
          {/*
            Above the search and the switch, because it is not another way of looking.

            With sixty-two past their date the first thing on this screen was sixty-two
            rows, and every control over them was a way of arranging the same sixty-two.
            The bar says the number and offers the only action that changes it.
          */}
          {lateCount > 0 && !reviewing && (
            <div className="task-triage">
              <div>
                <strong>{plural(lateCount, "task is", "tasks are")} past their date</strong>
                <span>One at a time: do it, move it, or drop it.</span>
              </div>
              <button type="button" onClick={startTriage}>
                Go through them
              </button>
            </div>
          )}

          {tasks.length >= 12 && (
            <ListBar
              query={q}
              onQuery={setQ}
              searchLabel="Search tasks…"
              shown={hits}
              total={tasks.length}
              onClear={() => setQ("")}
            />
          )}

          {/* What the counts in the rail now mean, said before they are read as days. */}
          {term !== "" && (
            <p className="task-hits">
              {hits === 0
                ? `Nothing matches “${q.trim()}”. All ${tasks.length} are still here.`
                : "The counts in the rail are the matches, not the day."}
            </p>
          )}

          {/*
            Two readings of one list. The switch is the app's own segmented control — the
            same one the workspace uses above every screen and the entry form uses for its
            kinds — so a person meets it here already knowing what it does.
          */}
          <div className="zv-seg task-views" role="group" aria-label="How to look at them">
            <button
              type="button"
              onClick={() => setMode("list")}
              aria-pressed={mode === "list"}
              className={cn(mode === "list" && "is-on")}
            >
              <ListChecks className="h-3.5 w-3.5" aria-hidden /> List
            </button>
            <button
              type="button"
              onClick={() => setMode("days")}
              aria-pressed={mode === "days"}
              className={cn(mode === "days" && "is-on")}
            >
              <CalendarRange className="h-3.5 w-3.5" aria-hidden /> One day
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("month");
                setMonth((activeKey.length === 10 ? activeKey : today).slice(0, 7));
              }}
              aria-pressed={mode === "month"}
              className={cn(mode === "month" && "is-on")}
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Month
            </button>
          </div>

          {asMonth ? (
            <TaskMonth
              month={month}
              onMonth={setMonth}
              today={today}
              counts={byDay.counts}
              late={byDay.late}
              selected={activeKey.length === 10 ? activeKey : null}
              onPick={(day) => {
                setPicked(day);
                leaveReview();
              }}
            />
          ) : mode === "days" ? (
            /*
              A strip you can push, with something to push it by.

              Twenty-eight days do not fit across any window, so the row scrolls. That was
              exactly the arrangement this screen started with and it was wrong then for
              one reason: the scrollbar was hidden, so four bands were off the edge with
              nothing on screen saying they existed. Arrows say it. A control that can be
              pressed is the overflow admitting to itself, which a cut-off tile never did.

              They scroll by four fifths of the strip rather than a whole one, so the tab
              you were reading stays on screen to tell you where you landed.
            */
            <div className="task-tabbar">
              <button
                type="button"
                className="task-tabnav"
                aria-label="Earlier days"
                onClick={() => nudge(-1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>

              <nav ref={strip} className="task-tabs" aria-label="Pick a day">
                {bands.map((b) => (
                  <Chip
                    key={b.key}
                    band={b}
                    on={b.key === activeKey}
                    onPick={() => {
                      setPicked(b.key);
                      leaveReview();
                    }}
                  />
                ))}
              </nav>

              <button
                type="button"
                className="task-tabnav"
                aria-label="Later days"
                onClick={() => nudge(1)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}

          {/*
            Everything, in order, in one scroll — the reading this screen was missing.

            Empty days are left out rather than printed as seven identical "nothing due"
            lines; today stays whatever it holds, because a day that is empty is worth
            knowing about when it is this one.
          */}
          {mode === "list" && (
            <div className="task-list">
              {bands
                .filter((b) => b.tasks.length > 0 || b.key === today)
                .map((b) => (
                  <TaskSection
                    key={b.key}
                    band={b}
                    today={today}
                    basePath={basePath}
                    workspace={workspace}
                    open={!shut[b.key]}
                    onToggle={() => setShut((was) => ({ ...was, [b.key]: !was[b.key] }))}
                  />
                ))}
            </div>
          )}

          {mode === "days" && band && (
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
                <span className="task-panel-meta">
                  <span className="mono task-panel-count">
                    {band.tasks.length === 0 ? "clear" : plural(band.tasks.length, "task", "tasks")}
                  </span>
                </span>
              </header>

              {!reviewing && (
                <QuickAdd
                  workspace={workspace}
                  dueOn={band.dueOn}
                  placeholder={band.placeholder}
                  hint={band.hint}
                />
              )}

              {reviewing ? (
                <div className="task-review">
                  <div className="task-review-head">
                    <button type="button" onClick={leaveReview}>
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                      Back to list
                    </button>
                    <span className="mono">
                      {reviewComplete ? reviewTotal : Math.min(reviewed + 1, reviewTotal)} of{" "}
                      {reviewTotal}
                    </span>
                  </div>

                  {reviewComplete ? (
                    <div className="task-review-complete">
                      <span className="task-review-complete-icon">
                        <Check className="h-5 w-5" aria-hidden />
                      </span>
                      <strong>Review complete</strong>
                      <p>
                        {reviewPool.length > 0
                          ? `${reviewPool.length} skipped ${
                              reviewPool.length === 1 ? "task is" : "tasks are"
                            } still here.`
                          : "Every remaining task now has a clear place."}
                      </p>
                      <button type="button" onClick={leaveReview}>Back to your tasks</button>
                    </div>
                  ) : reviewTask ? (
                    <div key={reviewTask.id} className="task-review-card">
                      <div className="task-review-task">
                        <PriorityDot priority={reviewTask.priority} />
                        <strong>{reviewTask.title}</strong>
                        {reviewTask.project?.title && (
                          <span>
                            {reviewTask.project.client?.name
                              ? `${reviewTask.project.client.name} · `
                              : ""}
                            {reviewTask.project.title}
                          </span>
                        )}
                        {reviewTask.due_at && (
                          <small className="mono">Due {formatDateTime(reviewTask.due_at)}</small>
                        )}
                      </div>

                      <div className="task-review-actions">
                        {reviewDates.map((choice) => (
                          <button
                            key={choice.label}
                            type="button"
                            disabled={reviewPending}
                            onClick={() => reviewMove(choice.on)}
                          >
                            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                            {choice.label}
                          </button>
                        ))}
                        <Link href={`${basePath}?edit=${reviewTask.id}`} onClick={leaveReview}>
                          <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                          Pick date
                        </Link>
                        <button
                          type="button"
                          className="is-complete"
                          disabled={reviewPending}
                          onClick={reviewDone}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          Complete
                        </button>
                        <button
                          type="button"
                          className="is-skip"
                          disabled={reviewPending}
                          onClick={reviewSkip}
                        >
                          <SkipForward className="h-3.5 w-3.5" aria-hidden />
                          Skip
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : band.tasks.length === 0 ? (
                <p className="task-panel-empty">{band.empty}</p>
              ) : (
                <div className="task-panel-body">
                  {focusTasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      basePath={basePath}
                      workspace={workspace}
                      hideDate={band.tone === "day" || band.tone === "today"}
                      note={
                        band.tone === "late" && dayOf(t)
                          ? lateBy(dayOf(t) as string, today)
                          : undefined
                      }
                    />
                  ))}
                  {/*
                    Ten more, or decide the rest. Two doors on the same pile, because
                    reading on and triaging are different moods and the panel used to
                    offer only the second.
                  */}
                  {remainingTasks.length > 0 && (
                    <button
                      type="button"
                      className="task-sec-more"
                      onClick={() =>
                        setDayExtra((was) => ({
                          key: activeKey,
                          n: (was.key === activeKey ? was.n : 0) + STEP,
                        }))
                      }
                    >
                      Show {Math.min(STEP, remainingTasks.length)} more
                      <span className="task-sec-more-rest">{remainingTasks.length} left</span>
                    </button>
                  )}

                  {remainingTasks.length > 0 && (
                    <div className="task-review-cta">
                      <div>
                        <strong>Review remaining {remainingTasks.length}</strong>
                        <span>Make one decision at a time</span>
                      </div>
                      <button
                        type="button"
                        onClick={beginReview}
                      >
                        Start review
                      </button>
                    </div>
                  )}
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


