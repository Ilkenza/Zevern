"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, PiggyBank, Plus, ArrowDownWideNarrow, ListOrdered } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";

import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import type { OnHand } from "@/lib/data/money";
import type { AccountBalance } from "@/lib/data/money";
import type { GoalLine, MoneyCategory } from "@/lib/types";
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
    "Name what the money is for, and set the amount you are aiming at — in dinars, euros or dollars.",
    "Put money aside against it — the money stays on the account, it just stops counting as free to spend.",
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
  categories,
  onHand,
  panel,
  showArchived,
}: {
  goals: GoalLine[];
  accounts: AccountBalance[];
  categories: MoneyCategory[];
  onHand: OnHand;
  panel: GoalsPanel;
  showArchived: boolean;
}) {
  const { fmt } = useMoney();
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

  /*
    Two orders, because they answer two different questions.

    "Mine" is the order you arranged: what matters most, first. "Closest" is the one
    that finishes goals — motivation climbs the nearer a target gets, and a list that
    buries the goal sitting at 92% behind three at 4% spends that climb on nothing. A
    goal with no target has nothing to be close to, so it sorts last either way.
  */
  const [order, setOrder] = useState<"mine" | "closest">("mine");
  // No useMemo: the compiler handles this, and hand-written memoization here only
  // stopped it from optimising the component at all.
  const share = (g: GoalLine) => {
    const target = Math.max(Number(g.target_rsd) || 0, 0);
    return target > 0 ? Math.min(g.saved / target, 1) : -1;
  };
  const ordered = order === "mine" ? open : [...open].sort((a, b) => share(b) - share(a));

  /*
    One card open at a time once the grid gets long.

    A goal card is 280px tall because it carries a history, a deposit box and a
    progress reading. Four of them is a screen and a half of scrolling to answer "how
    am I doing", which is a question about all four at once. So the one being worked on
    stays whole and the rest collapse to a line each — name, progress, figure — and
    open when clicked.
  */
  const [focus, setFocus] = useState<string | null>(null);
  const compactable = ordered.length > 2;
  const focused = focus && ordered.some((g) => g.id === focus) ? focus : (ordered[0]?.id ?? null);

  return (
    <div className="money-premium money-goals mx-auto max-w-220 space-y-5">
      <div className="money-page-head goals-page-head flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="money-page-kicker">Private wealth</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            Goals
          </h1>
          <p className="mt-1 max-w-md text-[13px] leading-5 text-muted">
            Turn something you want into a plan you can reach. Create a goal and make every contribution count.
          </p>
        </div>
        <div className="goals-head-side">
          {goals.length > 0 && (
            <div className="goals-head-stats" aria-label="Goals summary">
              <span><small>Active</small><b>{open.length}</b></span>
              <span><small>Saved</small><b className="mono">{fmt(openSaved)}</b></span>
              <span><small>Target</small><b className="mono">{fmt(openTarget)}</b></span>
              <span className={cn("goals-reached", reached === 0 && "is-none")}><small>Reached</small><b>{reached}</b></span>
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

          {open.length > 1 && (
            <div className="goals-order" role="group" aria-label="Order the goals">
              {(
                [
                  { key: "mine", label: "My order", icon: ListOrdered },
                  { key: "closest", label: "Closest to done", icon: ArrowDownWideNarrow },
                ] as const
              ).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setOrder(o.key)}
                  aria-pressed={order === o.key}
                  className={cn("goals-order-tab", order === o.key && "is-on")}
                >
                  <o.icon className="h-3.5 w-3.5" aria-hidden />
                  {o.label}
                </button>
              ))}
            </div>
          )}

          <div className={cn("money-card-grid grid gap-3", !compactable && "sm:grid-cols-2")}>
            {ordered.map((goal, i) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                accounts={accounts}
                siblings={ordered.filter((g) => g.id !== goal.id)}
                today={today}
                first={i === 0}
                last={i === ordered.length - 1}
                reorderable={order === "mine" && ordered.length > 1}
                compact={compactable && goal.id !== focused}
                onOpen={() => setFocus(goal.id)}
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
          categories={categories}
          onDone={close}
        />
      </SlideOver>
    </div>
  );
}
