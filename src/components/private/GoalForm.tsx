"use client";

import { useActionState } from "react";
import { saveGoal, deleteGoal, type MoneyState } from "@/app/(app)/private/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { SWATCHES } from "@/lib/money";
import type { MoneyGoal } from "@/lib/types";

export function GoalForm({ goal }: { goal?: MoneyGoal }) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveGoal, undefined);

  return (
    <div className="flex h-full flex-col">
      <form action={formAction} className="flex-1">
        {goal && <input type="hidden" name="id" value={goal.id} />}

        <Field
          label="Name"
          name="name"
          defaultValue={goal?.name ?? ""}
          placeholder="MacBook instalments"
          autoFocus
          required
        />
        <Field
          label="Target (RSD)"
          name="target_rsd"
          inputMode="numeric"
          defaultValue={goal?.target_rsd ? String(goal.target_rsd) : ""}
          placeholder="0"
        />
        <Field
          label="Target date"
          name="target_date"
          type="date"
          defaultValue={goal?.target_date ?? ""}
        />

        <div className="mb-3.25">
          <span className="mb-1.5 block text-xs font-semibold text-[#C6CAD6]">Colour</span>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((color) => (
              <label key={color} className="cursor-pointer">
                <input
                  type="radio"
                  name="color"
                  value={color}
                  defaultChecked={(goal?.color ?? SWATCHES[1]) === color}
                  className="peer sr-only"
                />
                <span
                  className="block h-6 w-6 rounded-full border-2 border-transparent peer-checked:border-ink"
                  style={{ background: color }}
                />
              </label>
            ))}
          </div>
        </div>

        {state?.error && (
          <p className="mb-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {state.error}
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Saving…" : goal ? "Save changes" : "Create goal"}
        </Button>
      </form>

      {goal && (
        <div className="mt-4 border-t border-line pt-4">
          <DeleteButton
            action={deleteGoal.bind(null, goal.id)}
            label="Delete goal"
            confirmText={`Delete "${goal.name}"? Saved entries stay in the ledger.`}
          />
        </div>
      )}
    </div>
  );
}
