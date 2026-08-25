"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, ShoppingBag } from "lucide-react";
import {
  saveGoal,
  closeGoal,
  deleteGoal,
  spendGoal,
  type MoneyState,
} from "@/app/(app)/private/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { CURRENCY_OPTIONS } from "@/lib/money";
import { MoneyField } from "@/components/ui/MoneyField";
import { cn } from "@/lib/utils";
import type { GoalLine, MoneyAccount, MoneyCategory } from "@/lib/types";
import { todayISO } from "@/lib/format";
import { useDefaultCurrency, useMoney } from "@/lib/money/currency";
import { fromRsd } from "@/lib/money/display";

/**
 * Every goal fills in the same gold.
 *
 * A colour picker on this form was a decision with nothing riding on it: goals are
 * read one card at a time, not scanned as a set the way categories are, so the colour
 * never told anyone anything — it just stood between naming a goal and creating it.
 */
const GOAL_COLOUR = "#d9a441";

/**
 * The end every goal is actually saving towards: you buy the thing.
 *
 * This was the one question the screen had no answer to. Closing the goal frees the
 * money but records no purchase; logging the purchase in Money leaves the goal still
 * holding what you just spent. Doing them in the wrong order, or forgetting one, is
 * how a ledger starts disagreeing with a bank account.
 *
 * One act, three entries' worth of bookkeeping: the reservation goes back to the
 * account, the purchase lands in Money under the goal's own name, and the goal closes.
 * Anything left over stays free rather than vanishing with it.
 */
function SpendGoal({
  goal,
  accounts,
  categories,
  onDone,
}: {
  goal: GoalLine;
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  onDone?: () => void;
}) {
  const { fmt, code, display } = useMoney();
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(spendGoal, undefined);
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
        className="flex w-full items-center gap-2 rounded-ctrl border border-gold/40 bg-gold/10 px-3 py-2.5 text-left text-[13px] font-semibold text-gold-hi transition-colors hover:bg-gold/15"
      >
        <ShoppingBag className="h-4 w-4 shrink-0" />
        I bought it
      </button>
    );
  }

  return (
    <form action={formAction} className="rounded-ctrl border border-gold/35 bg-gold/[0.06] p-3">
      <input type="hidden" name="goal_id" value={goal.id} />
      {/* Typed in the currency this screen is read in, stored the way every entry is. */}
      <input type="hidden" name="currency" value={code} />

      <div className="text-[13px] font-semibold text-ink">I bought it</div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
        The {fmt(held)} this goal holds goes back to the account, the purchase is
        logged in Money under <span className="text-ink">{goal.name}</span>, and the goal
        closes. Anything it cost less than stays free to spend.
      </p>

      <div className="mt-2.5 grid gap-2.5">
        <MoneyField
          className="mb-0"
          label={`What it cost (${code})`}
          name="amount"
          defaultValue={held > 0 ? Math.round(fromRsd(held, display)) : ""}
          placeholder="0"
          required
        />

        <Select
          className="mb-0"
          label="Category"
          name="category_id"
          defaultValue={categories[0]?.id ?? ""}
          placeholder={categories.length ? "No category" : "No categories yet"}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />

        <Select
          className="mb-0"
          label="Paid from"
          name="account_id"
          defaultValue={preferred}
          placeholder={accounts.length ? "No account" : "No accounts yet"}
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        />

        <Field
          className="mb-0 scheme-dark"
          label="Bought on"
          name="occurred_on"
          type="date"
          defaultValue={todayISO()}
        />
      </div>

      {state?.error && <p className="mt-2 text-[11.5px] text-danger">{state.error}</p>}

      <div className="mt-3 flex gap-2">
        <Button
          type="submit"
          variant="primary"
          className="flex-1 py-2 text-[12.5px]"
          disabled={pending}
        >
          {pending ? "Logging…" : "Log it and close the goal"}
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
  const { fmt } = useMoney();
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
            The <span className="mono text-ink">{fmt(held)}</span> it still holds goes back
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
          {pending ? "Closing…" : held > 0 ? `Close and free ${fmt(held)}` : "Close it"}
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
  categories,
  onDone,
}: {
  goal?: GoalLine;
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  onDone?: () => void;
}) {
  const fallback = useDefaultCurrency();
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

        {/*
          The target is said in whatever currency the thing is priced in — a laptop at
          €1.200 is a fact about euros. Progress is still counted in dinars, because
          that is what actually goes in, so the card converts and says so.
        */}
        <div className="grid grid-cols-[1fr_110px] gap-x-2">
          <MoneyField
            label="Target"
            name="target_amount"
            defaultValue={goal?.target_amount ?? goal?.target_rsd ?? ""}
            placeholder="0"
            help="Leave empty to just count what goes in."
          />
          <Select
            label="Currency"
            name="currency"
            defaultValue={goal?.currency ?? fallback}
            options={CURRENCY_OPTIONS}
          />
        </div>

        {/* color-scheme is inherited, so this reaches the native date picker. */}
        <Field
          className="scheme-dark"
          label="Target date"
          name="target_date"
          type="date"
          defaultValue={goal?.target_date ?? ""}
          help="Optional. With one, the goal says what a month has to look like."
        />

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
          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
            Finishing this goal
          </div>

          {/* Two endings, and they are not the same act. */}
          <div className="grid gap-2">
            <SpendGoal
              goal={goal}
              accounts={accounts}
              categories={categories}
              onDone={onDone}
            />
            <CloseGoal goal={goal} accounts={accounts} onDone={onDone} />
          </div>

          <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
            Bought the thing? The first one records the purchase and closes the goal in one go.
            Changed your mind? The second just hands the money back. Either way the goal keeps
            every deposit it ever took and moves to the closed list, where it can be reopened or
            archived.
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
