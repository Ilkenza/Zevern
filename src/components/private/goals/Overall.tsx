import { Panel } from "@/components/ui/Panel";
import { formatRsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OnHand } from "@/lib/data/money";
import type { GoalLine } from "@/lib/types";
import { NO_COLOUR, PanelMeta, caps } from "./shared";

/** One figure of the reconciliation strip. The operator lives in the label. */
function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "info" | "danger";
}) {
  return (
    <div className="goal-figure bg-surface px-3 py-2.5">
      <div className={caps}>{label}</div>
      <div
        className={cn(
          "mono mt-1 text-[15px] font-semibold",
          tone === "info" ? "text-info" : tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {formatRsd(value)}
      </div>
    </div>
  );
}

/**
 * The whole picture, first: everything put aside against everything being aimed at,
 * with every goal's colour taking its own share of the bar — and then the three
 * figures that have to agree with every other screen. What is on the accounts, what
 * these goals have a claim on, and what is left to spend. They add up because the
 * middle one is read straight off the goals above it.
 */
export function Overall({ goals, onHand }: { goals: GoalLine[]; onHand: OnHand }) {
  const targeted = goals.filter((g) => Number(g.target_rsd) > 0);
  const totalTarget = targeted.reduce((s, g) => s + Number(g.target_rsd), 0);
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  // Overshooting one goal must not pay for falling short on another, so each goal
  // contributes at most its own target to the bar.
  const towards = targeted.reduce((s, g) => s + Math.min(g.saved, Number(g.target_rsd)), 0);
  const reached = targeted.filter((g) => g.saved >= Number(g.target_rsd)).length;
  const untargeted = goals.length - targeted.length;
  const left = Math.max(totalTarget - towards, 0);
  const pct = totalTarget > 0 ? towards / totalTarget : null;
  const many = goals.length > 1;

  return (
    <Panel
      // With one goal the card below is already the whole picture, so the panel drops
      // back to the only thing the card cannot say: how this sits against the accounts.
      title={many ? "Put aside so far" : "Where this money is"}
      className="money-summary-panel goal-overall-panel"
      action={
        <PanelMeta>
          {goals.length} {goals.length === 1 ? "goal" : "goals"}
          {reached > 0 && ` · ${reached} reached`}
        </PanelMeta>
      }
    >
      <div className="px-4 py-4">
        {many && (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="mono text-[28px] font-semibold tracking-[-0.5px] text-ink">
                {formatRsd(totalSaved)}
              </span>
              {totalTarget > 0 && (
                <span className="text-[12.5px] text-muted">
                  of <span className="mono">{formatRsd(totalTarget)}</span> aimed at
                </span>
              )}
            </div>

            {pct === null ? (
              <p className="mt-2.5 text-[12px] text-muted">
                No targets set yet — put one on a goal and this turns into progress.
              </p>
            ) : (
              <>
                <div
                  aria-hidden="true"
                  className="mt-3 flex h-2.5 gap-px overflow-hidden rounded-pill bg-white/6"
                >
                  {targeted.map((g) => {
                    const share = (Math.min(g.saved, Number(g.target_rsd)) / totalTarget) * 100;
                    if (share <= 0) return null;
                    return (
                      <span
                        key={g.id}
                        className="money-progress-segment h-full shrink-0"
                        style={{
                          width: `${share}%`,
                          minWidth: "3px",
                          background: g.color ?? NO_COLOUR,
                        }}
                      />
                    );
                  })}
                </div>
                <p className="mt-2 text-[12px] text-muted">
                  {left === 0 ? (
                    "Every target reached."
                  ) : (
                    <>
                      {Math.min(Math.floor(pct * 100), 99)}% of the way there ·{" "}
                      <span className="mono">{formatRsd(left)}</span> still to find
                    </>
                  )}
                  {untargeted > 0 &&
                    ` · ${untargeted} ${untargeted === 1 ? "goal has" : "goals have"} no target`}
                </p>
              </>
            )}
          </>
        )}

        <div
          className={cn(
            "grid grid-cols-1 gap-px overflow-hidden rounded-ctrl border border-line-soft bg-line-soft min-[440px]:grid-cols-3",
            many && "mt-3.5",
          )}
        >
          <Figure label="On accounts" value={onHand.total} />
          <Figure label="− Set aside" value={onHand.reserved} tone="info" />
          <Figure
            label="= Free to spend"
            value={onHand.free}
            tone={onHand.free < 0 ? "danger" : undefined}
          />
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          Setting money aside moves nothing. The dinars stay on the account and only
          stop counting as free to spend — and free to spend is the figure every other
          screen plans against, so the same dinar can never be promised twice.
        </p>
      </div>
    </Panel>
  );
}

