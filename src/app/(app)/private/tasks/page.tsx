import { getTasks, getTask } from "@/lib/data/tasks";
import { TasksView, type TasksPanel } from "@/components/tasks/TasksView";
import { todayISO } from "@/lib/format";

export default async function PrivateTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string }>;
}) {
  const params = await searchParams;
  const tasks = await getTasks("personal");

  let panel: TasksPanel = null;
  if (params.new) {
    panel = { mode: "new" };
  } else if (params.edit) {
    const task = await getTask(params.edit);
    if (task) panel = { mode: "edit", task };
  }

  return (
    <TasksView
      tasks={tasks}
      projects={[]}
      panel={panel}
      workspace="personal"
      today={todayISO()}
    />
  );
}
