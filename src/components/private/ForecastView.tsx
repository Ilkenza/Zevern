import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { formatRsd, monthLabel } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Forecast } from "@/lib/data/money";

export function ForecastView({ forecast }: { forecast: Forecast }) {
  const { lines, windows, startingBalance, estimated, unknown } = forecast;

  // The first day the running balance goes under — the thing worth knowing early.
  const shortfall = lines.find((l) => l.balance < 0);
  const months = [...new Set(lines.map((l) => l.on.slice(0, 7)))];

  return (
    <div className="mx-auto max-w-220 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
            What is coming
          </h1>
          <p className="text-[12.5px] text-muted">
            Every recurring item due in the next 90 days, and what it leaves on the accounts.
          </p>
        </div>
        <Link href="/private/recurring" className={buttonClasses("secondary")}>
          Recurring
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {windows.map((w) => (
          <Kpi
            key={w.days}
            label={`Next ${w.days} days`}
            value={formatRsd(w.expense)}
            hint={
              w.income > 0
                ? `${w.count} due · income ${formatRsd(w.income)}`
                : `${w.count} ${w.count === 1 ? "payment" : "payments"}`
            }
          />
        ))}
      </div>

      {shortfall && (
        <div className="rounded-card border border-danger/40 bg-danger-bg px-4 py-3 text-[13px] text-danger">
          On <span className="mono">{shortfall.on}</span>, after {shortfall.name}, the accounts go
          to <span className="mono">{formatRsd(shortfall.balance)}</span>. Something has to come in
          before then.
        </div>
      )}

      <Panel
        title="Timeline"
        action={
          <span className="mono text-[11.5px] text-muted">
            starting from {formatRsd(startingBalance)}
          </span>
        }
      >
        {lines.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing due in the next 90 days"
            description="Add what repeats and this becomes a plan instead of a surprise."
            action={
              <Link href="/private/recurring?new=1" className={buttonClasses("primary")}>
                Add recurring
              </Link>
            }
          />
        ) : (
          <div>
            {months.map((month) => {
              const rows = lines.filter((l) => l.on.startsWith(month));
              const out = rows
                .filter((r) => r.kind !== "income")
                .reduce((sum, r) => sum + r.amount, 0);
              return (
                <div key={month}>
                  <div className="flex items-center justify-between border-b border-line-soft bg-white/[0.02] px-4 py-2">
                    <span className="text-[11.5px] font-semibold text-muted">
                      {monthLabel(month)}
                    </span>
                    <span className="mono text-[11px] text-faint">−{formatRsd(out)}</span>
                  </div>
                  {rows.map((line, i) => (
                    <div
                      key={`${line.id}-${line.on}-${i}`}
                      className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0"
                    >
                      <span
                        className="h-7 w-1 shrink-0 rounded-pill"
                        style={{ background: line.color ?? "#565c6b" }}
                      />
                      <span className="mono w-22 shrink-0 text-[11.5px] text-muted">{line.on}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-medium text-ink">
                          {line.name}
                          {line.estimated && (
                            <span className="ml-2 text-[11px] font-normal text-faint">
                              estimated
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11.5px] text-muted">
                          {line.category ?? "No category"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={cn(
                            "mono text-[13.5px] font-semibold",
                            line.kind === "income" ? "text-ok" : "text-ink",
                          )}
                        >
                          {line.kind === "income" ? "+" : "−"} {formatRsd(line.amount)}
                        </div>
                        <div
                          className={cn(
                            "mono text-[11px]",
                            line.balance < 0 ? "text-danger" : "text-faint",
                          )}
                        >
                          {formatRsd(line.balance)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {(estimated > 0 || unknown > 0) && (
        <p className="text-[11.5px] text-muted">
          {estimated > 0 &&
            `${estimated} variable ${estimated === 1 ? "item is" : "items are"} shown at the average of past bills. `}
          {unknown > 0 &&
            `${unknown} variable ${unknown === 1 ? "item has" : "items have"} no history yet and cannot be forecast — the real number will be higher.`}
        </p>
      )}
    </div>
  );
}
