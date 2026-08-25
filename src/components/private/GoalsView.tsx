"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, PiggyBank, Plus } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { formatRsd } from "@/lib/money";
import type { OnHand } from "@/lib/data/money";
import type { AccountBalance } from "@/lib/data/money";
import type { GoalLine } from "@/lib/types";
import { GoalForm } from "./GoalForm";
import { ARCHIVE_HREF, GOALS_HREF, PanelMeta, caps } from "./goals/shared";
import { isOpen } from "./goals/reading";
import { GoalCard } from "./goals/GoalCard";
import { ClosedRow } from "./goals/ClosedRow";
import { Overall } from "./goals/Overall";
import { todayISO } from "@/lib/format";

export type GoalsPanel = { mode: "new" } | { mode: "edit"; goal: GoalLine } | null;

/** Nothing saved for yet — so the screen has to explain what a goal is for on its own. */
function NoGoals() {
  const steps = [
    "Name what the money is for, and set the amount you are aiming at.",
    "Put money aside against it — the dinars stay on the account, they just stop counting as free to spend.",
    "Give it a date and the goal tells you what each month has to look like to make it.",
    "Buy the thing, or change your mind: take the money back out, or close the goal and it lets go of what is left.",
  ];

  return (
    <Panel className="money-empty-panel">
      <EmptyState
        icon={PiggyBank}
        title="Nothing being saved for yet"
        description="A goal is a name, an amount and — if you know it — a date. A laptop, a deposit, three months of rent in reserve."
        action={
          <Link href={`${GOALS_HREF}?new=1`} className={buttonClasses("primary", "money-premium-button")}>
            New goal
          </Link>
        }
      />
      <div className="border-t border-line-soft px-5 py-4">
        <div className={caps}>How a goal works</div>
        <ol className="mt-2.5 space-y-2 text-[12.5px] text-muted">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-2.5">
              <span className="mono shrink-0 text-[11.5px] text-faint">{i + 1}</span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

export function GoalsView({
  goals,
  accounts,
  onHand,
  panel,
  showArchived,
}: {
  goals: GoalLine[];
  accounts: AccountBalance[];
  onHand: OnHand;
  panel: GoalsPanel;
  showArchived: boolean;
}) {
  const router = useRouter();
  const close = () => router.push(GOALS_HREF);

  // Read the same way Setup reads today — UTC on both sides, so nothing disagrees.
  const today = todayISO();

  // Open is measured by completed_at alone, never by the archive flag: a goal still
  // holding money back has to stay visible, whatever else has been done to it.
  const open = goals.filter(isOpen);
  const closed = goals.filter((g) => !isOpen(g) && !g.archived);
  const archived = goals.filter((g) => !isOpen(g) && g.archived);
  const openSaved = open.reduce((sum, goal) => sum + goal.saved, 0);
  const openTarget = open.reduce((sum, goal) => sum + Math.max(Number(goal.target_rsd) || 0, 0), 0);
  const reached = open.filter((goal) => Number(goal.target_rsd) > 0 && goal.saved >= Number(goal.target_rsd)).length;

  return (
    <div className="money-premium money-goals mx-auto max-w-220 space-y-5">
      <div className="money-page-head goals-page-head flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="money-page-kicker">Private wealth</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            Goals
          </h1>
          <p className="mt-1 max-w-md text-[13px] leading-5 text-muted">
            Name what the money is for, and it stops being available for something else.
          </p>
        </div>
        <div className="goals-head-side">
          {goals.length > 0 && (
            <div className="goals-head-stats" aria-label="Goals summary">
              <span><small>Active</small><b>{open.length}</b></span>
              <span><small>Saved</small><b className="mono">{formatRsd(openSaved)}</b></span>
              <span><small>Target</small><b className="mono">{formatRsd(openTarget)}</b></span>
              <span className="goals-reached"><small>Reached</small><b>{reached}</b></span>
            </div>
          )}
          <Link href={`${GOALS_HREF}?new=1`} className={buttonClasses("primary", "money-premium-button shrink-0")}>
            <Plus className="h-4 w-4" />
            New goal
          </Link>
        </div>
      </div>

      {goals.length === 0 ? (
        <NoGoals />
      ) : (
        <>
          {open.length > 0 && <Overall goals={open} onHand={onHand} />}

          <div className="money-card-grid grid gap-3 sm:grid-cols-2">
            {open.map((goal, i) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                accounts={accounts}
                today={today}
                first={i === 0}
                last={i === open.length - 1}
                reorderable={open.length > 1}
              />
            ))}
          </div>

          {open.length === 0 && (
            <Panel className="goal-secondary-panel">
              <EmptyState
                icon={PiggyBank}
                title="Nothing being saved for right now"
                description="Every goal has been closed. Start another one, or reopen one below."
                action={
                  <Link href={`${GOALS_HREF}?new=1`} className={buttonClasses("primary", "money-premium-button")}>
                    New goal
                  </Link>
                }
              />
            </Panel>
          )}

          {closed.length > 0 && (
            <Panel
              className="goal-secondary-panel"
              title="Closed"
              action={
                <PanelMeta>
                  {closed.length} {closed.length === 1 ? "goal" : "goals"} · holding nothing back
                </PanelMeta>
              }
            >
              {closed.map((goal) => (
                <ClosedRow key={goal.id} goal={goal} />
              ))}
            </Panel>
          )}

          {archived.length > 0 &&
            (showArchived ? (
              <Panel
                className="goal-secondary-panel"
                title="Archived"
                action={
                  <Link href={GOALS_HREF} className="text-[12px] font-semibold text-gold-hi">
                    Hide
                  </Link>
                }
              >
                {archived.map((goal) => (
                  <ClosedRow key={goal.id} goal={goal} />
                ))}
              </Panel>
            ) : (
              <Link
                href={ARCHIVE_HREF}
                className="goal-archive-link flex items-center justify-center gap-1.5 rounded-card border border-line bg-surface px-4 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
              >
                <Archive className="h-3.5 w-3.5" />
                Show {archived.length} archived {archived.length === 1 ? "goal" : "goals"}
              </Link>
            ))}
        </>
      )}

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.mode === "edit" ? "Edit goal" : "New goal"}
      >
        <GoalForm
          goal={panel?.mode === "edit" ? panel.goal : undefined}
          accounts={accounts}
          onDone={close}
        />
      </SlideOver>
    </div>
  );
}
