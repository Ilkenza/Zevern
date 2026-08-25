import Link from "next/link";
import { FolderKanban, ReceiptText, ListChecks, Activity, Plus, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Landing } from "@/components/marketing/Landing";
import { GettingStarted } from "@/components/onboarding/GettingStarted";
import { getOnboarding } from "@/lib/data/onboarding";
import { Kpi } from "@/components/ui/Kpi";
import { AttentionBand } from "@/components/overview/AttentionBand";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { getActiveProjectCount, getRecentProjects } from "@/lib/data/projects";
import {
  getTodayOpenCount,
  getTasksForToday,
  getOverdueTaskCount,
} from "@/lib/data/tasks";
import { getInvoiceStats, getRecentInvoices } from "@/lib/data/invoices";
import { getRevenueGoal } from "@/lib/data/profile";
import { getRecentActivity } from "@/lib/data/activity";
import { getLeadsForFollowup, getFollowupCount } from "@/lib/data/leads";
import { Send } from "lucide-react";
import {
  projectStatusBadge,
  effectiveInvoiceStatus,
  invoiceStatusBadge,
} from "@/lib/status";
import { formatCurrency, formatDate } from "@/lib/format";
import { TaskCheckbox } from "@/components/tasks/TaskCheckbox";
import { RevenueGoalCard } from "@/components/overview/RevenueGoalCard";
import { ActivityFeed } from "@/components/overview/ActivityFeed";

/**
 * Percent change from `before` to `now`, or `null` when there is nothing to compare
 * against. Coming up from zero is a real event but not a percentage — "+∞%" is
 * noise, so those months say their piece in the hint line instead.
 */
function changePct(now: number, before: number): number | null {
  if (before <= 0) return null;
  return ((now - before) / before) * 100;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The state of the day in one sentence. Everything in it is already on the screen
 * somewhere as a figure; the point is that a sentence is read in a glance and a grid
 * of numbers is not.
 */
function dayLine(outstanding: number, outstandingCount: number, tasksToday: number) {
  const money =
    outstandingCount > 0
      ? `${formatCurrency(outstanding)} is out across ${plural(outstandingCount, "invoice", "invoices")}`
      : "Nothing is out on invoices";
  const work =
    tasksToday > 0
      ? `${plural(tasksToday, "task needs", "tasks need")} you today`
      : "nothing is due today";
  return `${money}, and ${work}.`;
}

/**
 * A client's name with its initials in front. Two rows of identical grey text are
 * hard to scan; a coloured-in monogram gives the eye somewhere to land, and the
 * name still carries the meaning for anyone who cannot see the chip.
 */
function ClientCell({ name }: { name?: string | null }) {
  if (!name) return <span className="text-faint">—</span>;
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className="client-cell">
      <span className="client-chip" aria-hidden>
        {initials}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

/** "Monday, 25 August" — the small anchor that makes a dashboard feel live. */
function todayLabel() {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
  } catch {
    return "";
  }
}

export default async function OverviewPage() {
  // "/" is the only route a visitor can reach without signing in, and there it is
  // the marketing page rather than the dashboard.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <Landing />;

  const [
    activeProjects,
    recentProjects,
    tasksToday,
    todayTasks,
    stats,
    recentInvoices,
    revenueGoal,
    activity,
    followups,
    onboarding,
    overdueTasks,
    followupCount,
  ] = await Promise.all([
    getActiveProjectCount(),
    getRecentProjects(5),
    getTodayOpenCount(),
    getTasksForToday(),
    getInvoiceStats(),
    getRecentInvoices(5),
    getRevenueGoal(),
    getRecentActivity(6),
    getLeadsForFollowup(5),
    getOnboarding(),
    getOverdueTaskCount(),
    getFollowupCount(),
  ]);

  const attention = {
    overdueInvoices: stats.overdueCount,
    overdueAmount: stats.overdueAmount,
    overdueTasks,
    followups: followupCount,
  };
  const trend = stats.revenueTrend.map((m) => m.value);

  return (
    <div className="overview-premium mx-auto max-w-300 space-y-6">
      <header className="overview-hero">
        <div className="min-w-0">
          <span className="overview-eyebrow"><i /> Command center</span>
          <h1 className="mt-3 font-display text-[34px] font-extrabold tracking-[-1.4px] text-ink sm:text-[44px]">
            Your business, at a glance.
          </h1>
          <p className="overview-dayline">
            <span className="overview-date mono">{todayLabel()}</span>
            <span className="overview-dayline-text">
              {dayLine(stats.outstanding, stats.outstandingCount, tasksToday)}
            </span>
          </p>
        </div>
        <div className="overview-actions">
          <Link href="/projects?new=1" className={buttonClasses("primary", "money-premium-button")}>
            <Plus className="h-4 w-4" /> New project
          </Link>
          <Link href="/invoices?new=1" className={buttonClasses("secondary", "money-premium-button border")}>
            New invoice <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {!onboarding.hidden && <div className="overview-onboarding"><GettingStarted onboarding={onboarding} /></div>}

      <AttentionBand attention={attention} />

      {/* KPI row */}
      <div className="overview-kpi-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Active projects"
          value={String(activeProjects)}
          hint={activeProjects === 0 ? "None in progress" : "In progress"}
        />
        <Kpi
          label="Revenue"
          value={formatCurrency(stats.revenueThisMonth)}
          delta={{
            pct: changePct(stats.revenueThisMonth, stats.revenueLastMonth),
            label:
              stats.revenueLastMonth > 0
                ? "vs last month"
                : stats.revenueThisMonth > 0
                  ? "first paid month in a while"
                  : "nothing paid yet",
            riseIsGood: true,
          }}
          spark={trend}
          sparkLabel="Paid revenue over the last six months"
          hint="Paid this month"
        />
        <Kpi
          label="Outstanding"
          value={formatCurrency(stats.outstanding)}
          hint={
            stats.outstandingCount === 0
              ? "Nothing waiting"
              : stats.overdueCount > 0
                ? `${stats.overdueCount} overdue of ${stats.outstandingCount}`
                : `${plural(stats.outstandingCount, "invoice", "invoices")} waiting`
          }
        />
        <Kpi
          label="Tasks today"
          value={String(tasksToday)}
          hint={
            tasksToday === 0
              ? "You're all clear"
              : overdueTasks > 0
                ? `${overdueTasks} already late`
                : "Due today"
          }
        />
      </div>

      {/* Main + right column */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overview-main-column space-y-6">
          <Panel
            className="overview-panel"
            title="Projects"
            action={
              <Link
                href="/projects"
                className="text-[12px] font-semibold text-gold-hi hover:underline"
              >
                View all
              </Link>
            }
          >
            {recentProjects.length === 0 ? (
              <EmptyState
                icon={FolderKanban}
                title="No projects yet"
                description="Create your first project to track its status and value here."
                action={
                  <Link
                    href="/projects?new=1"
                    className={buttonClasses("primary", "money-premium-button")}
                  >
                    New project
                  </Link>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                        Project
                      </th>
                      <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                        Client
                      </th>
                      <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                        Status
                      </th>
                      <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentProjects.map((p) => {
                      const badge = projectStatusBadge(p.status);
                      return (
                        <tr
                          key={p.id}
                          className="overview-table-row transition-colors hover:bg-white/2"
                        >
                          <td className="border-b border-line-soft px-4 py-3 font-semibold text-ink">
                            <Link
                              href={`/projects/${p.id}`}
                              className="hover:text-gold-hi"
                            >
                              {p.title}
                            </Link>
                          </td>
                          <td className="border-b border-line-soft px-4 py-3 text-muted">
                            <ClientCell name={p.client?.name} />
                          </td>
                          <td className="border-b border-line-soft px-4 py-3">
                            <Badge status={badge.variant}>{badge.label}</Badge>
                          </td>
                          <td className="mono border-b border-line-soft px-4 py-3 text-right text-ink">
                            {formatCurrency(p.value)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            className="overview-panel"
            title="Invoices"
            action={
              <Link
                href="/invoices"
                className="text-[12px] font-semibold text-gold-hi hover:underline"
              >
                View all
              </Link>
            }
          >
            {recentInvoices.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                title="No invoices yet"
                description="Issue an invoice to track paid, pending and overdue amounts."
                action={
                  <Link
                    href="/invoices?new=1"
                    className={buttonClasses("secondary", "money-premium-button")}
                  >
                    New invoice
                  </Link>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                        Number
                      </th>
                      <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                        Client
                      </th>
                      <th className="border-b border-line-soft px-4 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                        Status
                      </th>
                      <th className="border-b border-line-soft px-4 py-2.75 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInvoices.map((inv) => {
                      const badge = invoiceStatusBadge(
                        effectiveInvoiceStatus(inv),
                      );
                      return (
                        <tr
                          key={inv.id}
                          className="overview-table-row transition-colors hover:bg-white/2"
                        >
                          <td className="mono border-b border-line-soft px-4 py-3 font-semibold text-ink">
                            <Link
                              href={`/invoices/${inv.id}`}
                              className="hover:text-gold-hi"
                            >
                              {inv.number ?? "—"}
                            </Link>
                          </td>
                          <td className="border-b border-line-soft px-4 py-3 text-muted">
                            <ClientCell name={inv.client?.name} />
                          </td>
                          <td className="border-b border-line-soft px-4 py-3">
                            <Badge status={badge.variant}>{badge.label}</Badge>
                          </td>
                          <td className="mono border-b border-line-soft px-4 py-3 text-right text-ink">
                            {formatCurrency(inv.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="overview-side-column space-y-6">
          <Panel title="Today" className="overview-panel">
            {todayTasks.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="Nothing due today"
                description="Tasks due today will appear here."
              />
            ) : (
              <div>
                {todayTasks.map((t) => (
                  <div
                    key={t.id}
                    className="overview-list-row flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0"
                  >
                    <TaskCheckbox id={t.id} done={false} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                      {t.title}
                    </span>
                    <span className="mono shrink-0 text-[11.5px] text-muted">
                      {formatDate(t.due_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Follow-ups" className="overview-panel">
            {followups.length === 0 ? (
              <EmptyState
                icon={Send}
                title="No follow-ups due"
                description="Leads to follow up on will appear here."
              />
            ) : (
              <div>
                {followups.map((l) => (
                  <Link
                    key={l.id}
                    href={`/leads/${l.id}`}
                    className="overview-list-row flex items-center gap-3 border-b border-line-soft px-4 py-2.5 transition-colors last:border-b-0 hover:bg-white/2"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                      {l.name}
                    </span>
                    <span className="mono shrink-0 text-[11.5px] text-muted">
                      {formatDate(l.next_followup)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <RevenueGoalCard
            goal={revenueGoal}
            revenue={stats.revenueThisMonth}
          />

          <Panel title="Recent activity" className="overview-panel">
            {activity.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No activity yet"
                description="Your recent actions will show up here."
              />
            ) : (
              <ActivityFeed items={activity} />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
