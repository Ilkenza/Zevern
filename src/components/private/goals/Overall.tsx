"use client";

import { Panel } from "@/components/ui/Panel";

import { cn } from "@/lib/utils";
import type { OnHand } from "@/lib/data/money";
import type { GoalLine } from "@/lib/types";
import { PanelMeta, caps } from "./shared";
import { useMoney } from "@/lib/money/currency";
import { GOAL_ACCENT } from "./reading";

/** One figure of the reconciliation strip. The operator lives in the label. */
function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "held" | "danger";
}) {
  const { fmt } = useMoney();
  return (
    <div className="goal-figure bg-surface px-3 py-2.5">
      <div className={caps}>{label}</div>
      <div
        className={cn(
          "mono mt-1 text-[15px] font-semibold",
          // Money held by a goal has its own colour now — the accent, held back — so
          // this figure agrees with every other place a goal's money is named.
          tone === "held" ? "text-held" : tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {fmt(value)}
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
  const { fmt } = useMoney();
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
  // Seams only when every drawn segment is wide enough to read as its own band.
  const seams = targeted
    .filter((g) => g.saved > 0)
    .every((g) => Math.min(g.saved, Number(g.target_rsd)) / totalTarget >= 0.02);

  return (
    <Panel
      /*
        Not "Put aside so far", which is the page subtitle said a second time twenty
        pixels lower — and a heading that repeats the line above it teaches the reader
        that headings here are decoration.

        What the panel actually is, is the sum: every goal at once, against the
        accounts they draw on. With one goal there is no sum to take, so it drops back
        to the only thing the card below cannot say — where this money sits.
      */
      title={many ? "All goals together" : "Where this money is"}
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
                {fmt(totalSaved)}
              </span>
              {totalTarget > 0 && (
                <span className="text-[12.5px] text-muted">
                  of <span className="mono">{fmt(totalTarget)}</span> aimed at
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
                  /*
                    The 1px seams between goals are dropped once any segment is too small
                    to survive them.

                    Each segment carries a 3px floor so a first deposit is visible at all.
                    With 2.000 spread over two goals against a 2.598.012 target, both
                    segments sit on that floor — and a 1px gap cut through six pixels of
                    gold reads as a broken pill, not as two goals. Seams are for telling
                    wide bands apart; below about two percent of the bar there are no
                    bands to tell apart, only a mark showing something is in.
                  */
                  className={cn(
                    "goal-progress-track relative mt-3 flex h-2.5 overflow-hidden rounded-pill bg-white/6",
                    seams && "gap-px",
                  )}
                >
                  {/*
                    The same quarter marks the goal cards carry, for the same reason:
                    progress that only ever reports a percentage gives you nothing to
                    cross, and crossing something is what carries people through the
                    long middle where deposits stop. This bar had none, so the one
                    place that measures *all* the goals at once was the one place with
                    no thresholds on it.
                  */}
                  {[25, 50, 75].map((mark) => (
                    <span
                      key={mark}
                      className={cn(
                        "goal-milestone",
                        pct * 100 >= mark && "is-passed",
                      )}
                      style={{ left: `${mark}%` }}
                    />
                  ))}
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
                          background: GOAL_ACCENT,
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
                      {/*
                        `<1%` rather than `0%` once anything is in.

                        500 against a 2.598.012 target is 0.019%, and flooring that gives
                        `0%` — which is the screen telling you nothing is there while the
                        figure above it says 500. A percentage that rounds to nothing is
                        not the same fact as nothing, and the reader can tell.
                      */}
                      {pct > 0 && pct < 0.01
                        ? "Less than 1%"
                        : `${Math.min(Math.floor(pct * 100), 99)}%`}{" "}
                      of the way there ·{" "}
                      <span className="mono">{fmt(left)}</span> still to find
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
          <Figure label="− Set aside" value={onHand.reserved} tone="held" />
          <Figure
            label="= Free to spend"
            value={onHand.free}
            tone={onHand.free < 0 ? "danger" : undefined}
          />
        </div>
        {/*
          Five lines cut to one.

          The paragraph explained the mechanism twice over and then covered currency
          conversion as well — a manual page sitting permanently under a panel people
          read in two seconds. The equation directly above it already shows what the
          words were describing: on accounts, less set aside, equals free to spend. One
          line is enough to say the money has not gone anywhere; anyone who needs the
          currency rule will meet it on the card that applies it.
        */}
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          Money set aside never leaves the account — it only stops counting as free to
          spend.
        </p>
      </div>
    </Panel>
  );
}

