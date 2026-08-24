"use client";

import { useActionState } from "react";
import { saveGoal, deleteGoal, type MoneyState } from "@/app/(app)/private/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { SWATCHES } from "@/lib/money";
import { ColorPicker } from "@/components/ui/ColorPicker";
import type { MoneyGoal } from "@/lib/types";

/** Same label treatment the Field component uses, so the colour row lines up with it. */
const label = "mb-1.5 block text-xs font-semibold text-[#C6CAD6]";

export function GoalForm({ goal, customColors }: { goal?: MoneyGoal; customColors: string[] }) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveGoal, undefined);

  return (
    <div className="flex h-full flex-col">
      <form action={formAction} className="flex-1">
        {goal && <input type="hidden" name="id" value={goal.id} />}

        <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
          A name is all it takes. An amount turns it into progress, and a date turns that into a
          pace.
        </p>

        <Field
          label="Name"
          name="name"
          defaultValue={goal?.name ?? ""}
          placeholder="MacBook instalments"
          help="What the money is for, in the words you would use yourself."
          autoFocus
          required
        />

        {/* The amount and the date are one thought — how much, by when — so they sit
            together as soon as the panel is wide enough to hold both. */}
        <div className="grid sm:grid-cols-2 sm:gap-x-3">
          <Field
            label="Target (RSD)"
            name="target_rsd"
            inputMode="numeric"
            defaultValue={goal?.target_rsd ? String(goal.target_rsd) : ""}
            placeholder="0"
            help="Leave empty to just count what goes in."
          />
          {/* color-scheme is inherited, so this reaches the native date picker. */}
          <Field
            className="scheme-dark"
            label="Target date"
            name="target_date"
            type="date"
            defaultValue={goal?.target_date ?? ""}
            help="Optional. With one, the goal says what a month has to look like."
          />
        </div>

        <div className="mb-3.25">
          <span className={label}>Colour</span>
          <div className="flex">
            <ColorPicker name="color" value={goal?.color ?? SWATCHES[1]} custom={customColors} />
          </div>
          <p className="mt-1.25 text-[11.5px] text-muted">
            This is the colour the progress bar fills in.
          </p>
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
          <p className="mt-2.5 text-[11.5px] text-muted">
            Deleting removes the target, not the money. Everything you put aside stays in the
            ledger — those entries just stop pointing at anything.
          </p>
        </div>
      )}
    </div>
  );
}
