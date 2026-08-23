"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PiggyBank, Plus, Pencil } from "lucide-react";
import { saveTransaction, type MoneyState } from "@/app/(app)/private/actions";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { formatRsd } from "@/lib/money";
import type { GoalLine, MoneyAccount, MoneyGoal } from "@/lib/types";
import { GoalForm } from "./GoalForm";

export type GoalsPanel = { mode: "new" } | { mode: "edit"; goal: MoneyGoal } | null;

function AddToGoal({ goal, accounts }: { goal: GoalLine; accounts: MoneyAccount[] }) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(
    saveTransaction,
    undefined,
  );
  const [amount, setAmount] = useState("");

  return (
    <form action={formAction} className="mt-3 flex items-center gap-2">
      <input type="hidden" name="kind" value="saving" />
      <input type="hidden" name="goal_id" value={goal.id} />
      <input type="hidden" name="currency" value="RSD" />
      <input type="hidden" name="return_to" value="stay" />
      <input type="hidden" name="account_id" value={accounts[0]?.id ?? ""} />
      <input
        name="amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        placeholder="Add amount"
        aria-label={`Add money to ${goal.name}`}
        className="w-full rounded-ctrl border border-line bg-white/[0.035] px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-gold focus:outline-none"
      />
      <button type="submit" disabled={pending} className={buttonClasses("secondary", "border shrink-0")}>
        {pending ? "…" : "Put aside"}
      </button>
      {state?.error && <span className="text-[11px] text-danger">{state.error}</span>}
    </form>
  );
}

export function GoalsView({
  goals,
  accounts,
  panel,
}: {
  goals: GoalLine[];
  accounts: MoneyAccount[];
  panel: GoalsPanel;
}) {
  const router = useRouter();
  const close = () => router.push("/private/goals");

  return (
    <div className="mx-auto max-w-220">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
            Goals
          </h1>
          <p className="text-[12.5px] text-muted">What the money is being kept for.</p>
        </div>
        <Link href="/private/goals?new=1" className={buttonClasses("primary")}>
          <Plus className="h-4 w-4" />
          New goal
        </Link>
      </div>

      {goals.length === 0 ? (
        <Panel>
          <EmptyState
            icon={PiggyBank}
            title="No goals yet"
            description="A goal turns saving from a leftover into a plan."
            action={
              <Link href="/private/goals?new=1" className={buttonClasses("primary")}>
                New goal
              </Link>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((goal) => {
            const pct = goal.target_rsd > 0 ? Math.min(goal.saved / Number(goal.target_rsd), 1) : 0;
            const left = Number(goal.target_rsd) - goal.saved;
            return (
              <div key={goal.id} className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold text-ink">{goal.name}</div>
                    {goal.target_date && (
                      <div className="mono text-[11.5px] text-muted">by {goal.target_date}</div>
                    )}
                  </div>
                  <Link
                    href={`/private/goals?edit=${goal.id}`}
                    aria-label={`Edit ${goal.name}`}
                    className="rounded-ctrl p-1.5 text-faint hover:bg-white/5 hover:text-ink"
                  >
                    <Pencil className="h-3.75 w-3.75" />
                  </Link>
                </div>

                <div className="mono mt-3 text-[20px] font-semibold text-ink">
                  {formatRsd(goal.saved)}
                </div>
                <div className="text-[11.5px] text-muted">
                  {Number(goal.target_rsd) > 0
                    ? left > 0
                      ? `${formatRsd(left)} to go of ${formatRsd(Number(goal.target_rsd))}`
                      : "Target reached"
                    : "No target set"}
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-white/6">
                  <div
                    className="h-full rounded-pill"
                    style={{ width: `${pct * 100}%`, background: goal.color ?? "#5fb88a" }}
                  />
                </div>

                <AddToGoal goal={goal} accounts={accounts} />
              </div>
            );
          })}
        </div>
      )}

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.mode === "edit" ? "Edit goal" : "New goal"}
      >
        <GoalForm goal={panel?.mode === "edit" ? panel.goal : undefined} />
      </SlideOver>
    </div>
  );
}
