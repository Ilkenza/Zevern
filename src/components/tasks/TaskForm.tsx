"use client";

import { useActionState } from "react";
import {
  saveTask,
  deleteTask,
  type TaskFormState,
} from "@/app/(app)/tasks/actions";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { PRIORITY_OPTIONS } from "@/lib/status";
import type { Task } from "@/lib/types";

export type ProjectOption = {
  id: string;
  title: string;
  client: string | null;
};

export function TaskForm({
  task,
  projects,
  workspace = "work",
}: {
  task?: Task;
  projects: ProjectOption[];
  workspace?: "work" | "personal";
}) {
  const [state, formAction, pending] = useActionState<TaskFormState, FormData>(
    saveTask,
    undefined,
  );

  const personal = workspace === "personal";
  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: p.client ? `${p.client} · ${p.title}` : p.title,
  }));

  // datetime-local wants `YYYY-MM-DDTHH:MM`; legacy date-only values get midnight.
  const dueValue = task?.due_at
    ? task.due_at.length >= 16 && task.due_at.includes("T")
      ? task.due_at.slice(0, 16)
      : `${task.due_at.slice(0, 10)}T00:00`
    : "";

  return (
    <div className="flex h-full flex-col">
      <form action={formAction} className="flex-1">
        {task && <input type="hidden" name="id" value={task.id} />}
        <input type="hidden" name="workspace" value={workspace} />

        <Field
          label="Title"
          name="title"
          defaultValue={task?.title ?? ""}
          placeholder={personal ? "Pay the electricity bill" : "Follow up with client"}
          autoFocus
          required
        />

        {!personal && (
          <Select
            label="Project"
            name="project_id"
            defaultValue={task?.project_id ?? ""}
            placeholder={projectOptions.length ? "No project" : "No projects yet"}
            options={projectOptions}
          />
        )}

        <Select
          label="Priority"
          name="priority"
          defaultValue={task?.priority ?? "med"}
          options={PRIORITY_OPTIONS}
        />

        <Field
          label="Due (date + optional time)"
          name="due_at"
          type="datetime-local"
          defaultValue={dueValue}
        />

        {state?.error && (
          <p className="mb-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {state.error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={pending}
        >
          {pending ? "Saving…" : task ? "Save changes" : "Create task"}
        </Button>
      </form>

      {task && (
        <div className="mt-4 border-t border-line pt-4">
          <DeleteButton
            action={deleteTask.bind(null, task.id, workspace)}
            label="Delete task"
            confirmText={`Delete "${task.title}"?`}
          />
        </div>
      )}
    </div>
  );
}
