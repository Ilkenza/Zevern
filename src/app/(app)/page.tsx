import Link from "next/link";
import { FolderKanban, ReceiptText, ListChecks, Activity, Plus, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Landing } from "@/components/marketing/Landing";
import { GettingStarted } from "@/components/onboarding/GettingStarted";
import { getOnboarding } from "@/lib/data/onboarding";
import { Kpi } from "@/components/ui/Kpi";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { getActiveProjectCount, getRecentProjects } from "@/lib/data/projects";
import { getTodayOpenCount, getTasksForToday } from "@/lib/data/tasks";
import { getInvoiceStats, getRecentInvoices } from "@/lib/data/invoices";
import { getRevenueGoal } from "@/lib/data/profile";
import { getRecentActivity } from "@/lib/data/activity";
import { getLeadsForFollowup } from "@/lib/data/leads";
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
  ]);

  return (
    <div className="overview-premium mx-auto max-w-300 space-y-6">
      <header className="overview-hero">
        <div className="min-w-0">
          <span className="overview-eyebrow"><i /> Command center</span>
          <h1 className="mt-3 font-display text-[34px] font-extrabold tracking-[-1.4px] text-ink sm:text-[44px]">
            Your business, at a glance.
          </h1>
          <p className="mt-2 max-w-xl text-[13px] leading-5 text-muted">
            The work moving forward, the money coming in, and what needs your attention next.
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
          hint="Paid this month"
        />
        <Kpi
          label="Outstanding"
          value={formatCurrency(stats.outstanding)}
          hint={
            stats.overdueCount > 0
              ? `${stats.overdueCount} overdue`
              : "Nothing overdue"
          }
        />
        <Kpi
          label="Tasks today"
          value={String(tasksToday)}
          hint={tasksToday === 0 ? "You're all clear" : "Due today or overdue"}
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
                    className={buttonClasses("primary")}
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
                            {p.client?.name ?? "—"}
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
                    className={buttonClasses("secondary")}
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
                            {inv.client?.name ?? "—"}
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
