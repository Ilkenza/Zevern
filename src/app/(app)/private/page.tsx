import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  ListChecks,
  Wallet,
} from "lucide-react";
import {
  getBudgetLines,
  getDueRecurring,
  getExpenseTrend,
  getGoalLines,
  getMonthSummary,
  getOnHand,
  getTransactions,
  isGoalOpen,
} from "@/lib/data/money";
import { getMoney } from "@/lib/data/money";
import { getTasksForToday } from "@/lib/data/tasks";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { NetKpi } from "@/components/private/NetKpi";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { TaskCheckbox } from "@/components/tasks/TaskCheckbox";
import { DueRecurringPanel } from "@/components/private/DueRecurringPanel";
import { monthKey, monthLabel, monthProgress, shiftMonth, shortMonthLabel } from "@/lib/money";

export default async function PrivateOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // The month was fixed to today, which left the page showing a month it gave you no
  // way to leave — while Money and Budgets both let you walk back through them.
  const params = await searchParams;
  const { fmt, fmtShort } = await getMoney();
  const current = monthKey();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? (params.month as string) : current;
  const [summary, lines, allGoals, due, recent, tasks, onHand, trend] = await Promise.all([
    getMonthSummary(month),
    getBudgetLines(month),
    getGoalLines(),
    getDueRecurring(),
    getTransactions({ month, limit: 6 }),
    getTasksForToday("personal"),
    getOnHand(),
    getExpenseTrend(6),
  ]);

  const pace = monthProgress(month);
  const budgeted = lines.filter((l) => l.limit > 0);
  const watch = [...budgeted].sort((a, b) => b.spent / b.limit - a.spent / a.limit).slice(0, 5);
  // Closed goals are history and hold nothing back — the panel is about what is live.
  const goals = allGoals.filter(isGoalOpen);
  const peak = Math.max(1, ...trend.map((t) => t.expense));

  return (
    <div className="money-premium mx-auto max-w-300 space-y-4">
      <div className="money-page-head mb-1 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="money-page-kicker">Private · Overview</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            {monthLabel(month)}
          </h1>
          <p className="upcoming-blurb">
            What the month has cost so far, what is left on the accounts, and what is
            about to book itself.
          </p>
          <div className="money-month-nav mt-3">
            <Link
              href={`/private?month=${shiftMonth(month, -1)}`}
              aria-label={`Go to ${monthLabel(shiftMonth(month, -1))}`}
              className="money-month-arrow"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{shortMonthLabel(shiftMonth(month, -1), month)}</span>
            </Link>
            <Link
              href={`/private?month=${shiftMonth(month, 1)}`}
              aria-label={`Go to ${monthLabel(shiftMonth(month, 1))}`}
              className="money-month-arrow"
            >
              <span>{shortMonthLabel(shiftMonth(month, 1), month)}</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
            {month !== current && (
              <Link href="/private" className="money-month-back">
                <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />
                This month
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/private/quick"
            className={buttonClasses("primary", "money-premium-button")}
          >
            Quick add
          </Link>
        </div>
      </div>

      <div className="money-card-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi className="money-card-premium" label="Spent this month" value={fmt(summary.expense)} />
        <Kpi className="money-card-premium" label="Income" value={fmt(summary.income)} />
        <NetKpi className="money-card-premium" net={summary.net} income={summary.income} saved={summary.saved} />
        {/* The total is what the bank says. What can actually be spent is the total
            less whatever the open goals have a claim on — said here rather than left
            for the goals screen to contradict later. */}
        <Kpi
          className="money-card-premium"
          label="On accounts"
          value={fmt(onHand.total)}
          hint={
            onHand.reserved > 0 ? (
              <>
                <span className={onHand.free < 0 ? "text-danger" : undefined}>
                  {fmt(onHand.free)} free
                </span>{" "}
                · {fmt(onHand.reserved)} set aside
              </>
            ) : undefined
          }
        />
      </div>

      <DueRecurringPanel due={due} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Today"
          action={
            <Link href="/private/tasks" className="text-[12px] font-semibold text-gold-hi">
              All tasks
            </Link>
          }
        >
          {tasks.length === 0 ? (
            <EmptyState icon={ListChecks} title="Nothing due today" />
          ) : (
            <div>
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0"
                >
                  <TaskCheckbox id={t.id} done={t.status === "done"} />
                  <span className="flex-1 truncate text-[13.5px] text-ink">{t.title}</span>
                  <span className="mono text-[11.5px] text-muted">{t.due_at?.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Budgets"
          action={
            <Link href="/private/budgets" className="text-[12px] font-semibold text-gold-hi">
              Set limits
            </Link>
          }
        >
          {watch.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No limits set"
              description="Put a monthly cap on the categories that tend to run away."
            />
          ) : (
            <div className="space-y-3 px-4 py-3.5">
              {watch.map((l) => {
                const used = Math.min(l.spent / l.limit, 1);
                const over = l.spent > l.limit;
                return (
                  <div key={l.category.id}>
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="truncate font-semibold text-ink">{l.category.name}</span>
                      <span className={`mono ${over ? "text-danger" : "text-muted"}`}>
                        {fmtShort(l.spent)} / {fmtShort(l.limit)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-white/6">
                      <div
                        className={`h-full rounded-pill ${
                          over ? "bg-danger" : used > pace + 0.15 ? "bg-gold" : "bg-ok"
                        }`}
                        style={{ width: `${used * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Last entries"
          action={
            <Link href="/private/money" className="text-[12px] font-semibold text-gold-hi">
              See all
            </Link>
          }
        >
          {recent.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Nothing logged yet"
              description="Log it the moment you spend it — that is the whole habit."
              action={
                <Link href="/private/quick" className={buttonClasses("primary")}>
                  Add the first one
                </Link>
              }
            />
          ) : (
            <div>
              {recent.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0"
                >
                  <span
                    className="h-6 w-1 shrink-0 rounded-pill"
                    style={{ background: t.category?.color ?? "var(--color-faint)" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {t.title ?? t.category?.name ?? t.goal?.name ?? t.note ?? "—"}
                  </span>
                  {/*
                    A deposit into a goal was getting the same minus sign as a purchase,
                    so five rows of saving read as five rows of spending. Money into a
                    goal goes in, money out of one comes back, and neither is a minus.
                  */}
                  <span className="mono text-[12.5px] text-muted">
                    {t.kind === "income"
                      ? "+"
                      : t.kind === "saving"
                        ? "→"
                        : t.kind === "withdraw"
                          ? "←"
                          : t.kind === "transfer"
                            ? "⇄"
                            : "−"}{" "}
                    {fmt(Number(t.amount_rsd))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Goals"
          action={
            <Link href="/private/goals" className="text-[12px] font-semibold text-gold-hi">
              Manage
            </Link>
          }
        >
          {goals.length === 0 ? (
            <EmptyState icon={Wallet} title="No goals yet" />
          ) : (
            <div className="space-y-3 px-4 py-3.5">
              {goals.slice(0, 4).map((g) => {
                const pct = Number(g.target_rsd) > 0 ? Math.min(g.saved / Number(g.target_rsd), 1) : 0;
                return (
                  <div key={g.id}>
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="truncate font-semibold text-ink">{g.name}</span>
                      <span className="mono text-muted">
                        {fmtShort(g.saved)}
                        {Number(g.target_rsd) > 0 ? ` / ${fmtShort(Number(g.target_rsd))}` : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-white/6">
                      <div
                        className="h-full rounded-pill"
                        style={{ width: `${pct * 100}%`, background: g.color ?? "var(--color-muted)" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Last 6 months">
        <div className="flex items-end gap-3 px-4 py-4">
          {trend.map((t) => (
            <div key={t.month} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="mono text-[10.5px] text-faint">{fmtShort(t.expense)}</span>
              <div
                className={`w-full rounded-t-[4px] ${t.month === month ? "bg-gold" : "bg-white/12"}`}
                style={{ height: `${Math.max(4, (t.expense / peak) * 90)}px` }}
              />
              <span className="text-[10.5px] text-muted">{t.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
