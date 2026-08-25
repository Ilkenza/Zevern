"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { saveGoal, closeGoal, deleteGoal, type MoneyState } from "@/app/(app)/private/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { formatRsd } from "@/lib/money";
import { MoneyField } from "@/components/ui/MoneyField";
import { cn } from "@/lib/utils";
import type { GoalLine, MoneyAccount } from "@/lib/types";
import { todayISO } from "@/lib/format";

/**
 * Every goal fills in the same gold.
 *
 * A colour picker on this form was a decision with nothing riding on it: goals are
 * read one card at a time, not scanned as a set the way categories are, so the colour
 * never told anyone anything — it just stood between naming a goal and creating it.
 */
const GOAL_COLOUR = "#d9a441";

/**
 * Closing a goal, said once and honestly.
 *
 * Whatever the goal still holds goes back to a real account as a withdrawal, so the
 * ledger records where it went and the money is free to spend again from that moment.
 * Bought the thing or gave up on it, the accounting is the same act — the purchase
 * itself is an ordinary expense, logged in Money like everything else.
 */
function CloseGoal({
  goal,
  accounts,
  onDone,
}: {
  goal: GoalLine;
  accounts: MoneyAccount[];
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(closeGoal, undefined);
  const [open, setOpen] = useState(false);

  const held = goal.saved;
  const preferred = goal.lastAccountId ?? accounts[0]?.id ?? "";

  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-ctrl border border-line bg-white/[0.03] px-3 py-2.5 text-left text-[13px] font-semibold text-ink transition-colors hover:bg-white/[0.06]"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />
        Close this goal
      </button>
    );
  }

  return (
    <form action={formAction} className="rounded-ctrl border border-line bg-white/[0.03] p-3">
      <input type="hidden" name="goal_id" value={goal.id} />

      <div className="text-[13px] font-semibold text-ink">Close this goal</div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
        {held > 0 ? (
          <>
            The <span className="mono text-ink">{formatRsd(held)}</span> it still holds goes back
            to an account and is free to spend again. If you spent it on the thing itself, log
            that purchase in Money — this only stops the goal claiming it.
          </>
        ) : (
          <>
            It holds nothing, so there is nothing to hand back. It moves to the closed list and
            stops taking up room here.
          </>
        )}
      </p>

      {held > 0 && (
        <select
          name="account_id"
          defaultValue={preferred}
          aria-label="Account the money goes back to"
          className={cn(
            "mt-2.5 w-full rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-2 text-[13px] text-ink scheme-dark",
            "focus:border-gold focus:shadow-ring",
          )}
        >
          {accounts.length === 0 && <option value="">No accounts yet</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.id} className="bg-surface">
              Back to {a.name}
            </option>
          ))}
        </select>
      )}

      <Field
        className="mt-2.5 mb-0 scheme-dark"
        label="Closed on"
        name="completed_at"
        type="date"
        defaultValue={todayISO()}
      />

      {state?.error && <p className="mt-2 text-[11.5px] text-danger">{state.error}</p>}

      <div className="mt-3 flex gap-2">
        <Button type="submit" variant="primary" className="flex-1 py-2 text-[12.5px]" disabled={pending}>
          {pending ? "Closing…" : held > 0 ? `Close and free ${formatRsd(held)}` : "Close it"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-2 text-[12.5px]"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function GoalForm({
  goal,
  accounts,
  onDone,
}: {
  goal?: GoalLine;
  accounts: MoneyAccount[];
  onDone?: () => void;
}) {
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
          <MoneyField
            label="Target (RSD)"
            name="target_rsd"
            defaultValue={goal?.target_rsd ?? ""}
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

        <input type="hidden" name="color" value={GOAL_COLOUR} />

        {state?.error && (
          <p className="mb-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {state.error}
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Saving…" : goal ? "Save changes" : "Create goal"}
        </Button>
      </form>

      {goal && goal.completed_at === null && (
        <div className="mt-4 border-t border-line pt-4">
          <CloseGoal goal={goal} accounts={accounts} onDone={onDone} />
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
            Closing is the end of the goal, not the end of its record. It keeps every deposit it
            ever took and moves to the closed list, where it can be reopened or archived.
          </p>
        </div>
      )}

      {goal && (
        <div className="mt-4 border-t border-line pt-4">
          <DeleteButton
            action={deleteGoal.bind(null, goal.id)}
            label="Delete goal"
            confirmText={`Delete "${goal.name}"? Saved entries stay in the ledger.`}
          />
          <p className="mt-2.5 text-[11.5px] text-muted">
            Deleting removes the target, not the money. Everything you put aside stays in the
            ledger — those entries just stop pointing at anything, and the money counts as free
            again. To keep the record, close it instead.
          </p>
        </div>
      )}
    </div>
  );
}
