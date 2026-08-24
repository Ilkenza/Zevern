"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { SlideOver } from "@/components/ui/SlideOver";
import { Field } from "@/components/ui/Field";
import { Button, buttonClasses } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveRevenueGoal } from "@/app/(app)/actions";

export function RevenueGoalCard({
  goal,
  revenue,
}: {
  goal: number;
  revenue: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await saveRevenueGoal(undefined, formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const pct = goal > 0 ? Math.min(100, Math.round((revenue / goal) * 100)) : 0;
  const remaining = Math.max(0, goal - revenue);

  return (
    <Panel
      className="overview-panel overview-goal-card"
      title="Revenue goal"
      action={
        goal > 0 ? (
          <button
            onClick={() => setOpen(true)}
            aria-label="Edit revenue goal"
            className="rounded-ctrl p-1 text-faint transition-colors hover:bg-white/5 hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : undefined
      }
    >
      <div className="px-4 py-4">
        {goal > 0 ? (
          <>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="mono text-[14px] font-semibold text-ink">
                {formatCurrency(revenue)}
              </span>
              <span className="mono text-[12px] text-muted">
                / {formatCurrency(goal)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-pill bg-white/5">
              <div
                className="overview-progress-fill h-full rounded-pill bg-gold transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-[12px] text-muted">
              {remaining > 0
                ? `${pct}% · ${formatCurrency(remaining)} to go`
                : "Goal reached"}
            </p>
          </>
        ) : (
          <div className="text-center">
            <p className="text-[12.5px] text-muted">
              Set a monthly goal to track progress.
            </p>
            <button
              onClick={() => setOpen(true)}
              className={cn(buttonClasses("secondary"), "money-premium-button mt-3")}
            >
              Set goal
            </button>
          </div>
        )}
      </div>

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="Revenue goal"
      >
        <form onSubmit={onSubmit}>
          <Field
            label="Monthly goal (€)"
            name="goal"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={goal > 0 ? String(goal) : ""}
            placeholder="2000"
            autoFocus
          />
          {error && (
            <p className="mb-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={pending}
          >
            {pending ? "Saving…" : "Save goal"}
          </Button>
        </form>
      </SlideOver>
    </Panel>
  );
}
