"use client";

import { useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Trophy } from "lucide-react";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { deleteGoal, moveGoal } from "@/app/(app)/private/actions";
import { Badge } from "@/components/ui/Badge";
import { formatAmount } from "@/lib/money";
import { useMoney } from "@/lib/money/currency";
import { GoalIcon } from "@/components/icons/GoalIcon";
import { cn } from "@/lib/utils";
import type { AccountBalance } from "@/lib/data/money";
import type { GoalLine } from "@/lib/types";
import { GOALS_HREF } from "./shared";
import { GOAL_ACCENT, firstStepFor, read } from "./reading";
import { GoalHistory } from "./GoalHistory";
import { MoveMoney } from "./MoveMoney";
import { PayOff } from "./PayOff";

/** Move a goal up or down the list — priority the owner chose, not creation order. */
function Reorder({ goal, first, last }: { goal: GoalLine; first: boolean; last: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const move = (direction: "up" | "down") => {
    startTransition(async () => {
      await moveGoal(goal.id, direction);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => move("up")}
        disabled={pending || first}
        aria-label={`Move ${goal.name} up`}
        title="Higher priority"
        className="zv-rowctrl zv-rowctrl-sm"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => move("down")}
        disabled={pending || last}
        aria-label={`Move ${goal.name} down`}
        title="Lower priority"
        className="zv-rowctrl zv-rowctrl-sm"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

export function GoalCard({
  goal,
  accounts,
  siblings,
  today,
  first,
  last,
  reorderable,
  expanded,
  closing,
  onToggle,
}: {
  goal: GoalLine;
  accounts: AccountBalance[];
  /** The other open goals — where an overshoot can go instead. */
  siblings: GoalLine[];
  today: string;
  first: boolean;
  last: boolean;
  reorderable: boolean;
  /*
    Only one card is open at a time, and the open one is chosen by the list rather
    than by each card holding its own flag.

    Every card used to render its deposit form permanently — an amount field, an
    account `select` carrying every account, and three tab buttons, multiplied by
    however many goals exist. At thirty-eight goals that is thirty-eight open forms
    on one screen, and a lot of DOM built for controls nobody asked for. The form is
    a deliberate act; it opens when the act is being performed. Nothing else on the
    card hides — the numbers are why the card exists.
  */
  expanded: boolean;
  /** Still mounted only so the closing animation can finish. */
  closing: boolean;
  onToggle: () => void;
}) {
  const { fmt, fmtExact, code } = useMoney();
  const r = read(goal, today, fmt, fmtExact);
  const accent = GOAL_ACCENT;
  const target = Math.max(Number(goal.target_rsd) || 0, 0);
  /*
    A target says the currency it was set in, and converts underneath only when that is
    not the currency being read.

    A goal aimed at €700 is a fact about euros and stays one; the second line is what
    that means in the money this screen is counting. When the two are the same there is
    nothing to convert, and "€700 ≈ €700" is a line that only makes a card longer.
  */
  const aimedAt = Number(goal.target_amount) || 0;
  const foreign = aimedAt > 0 && goal.currency !== code;
  const remaining = Math.max(target - goal.progress, 0);
  // Rounded down, and capped at 99 until the target is actually met — a goal one
  // dinar short should never claim to be finished.
  const shown = r.pct === null ? null : r.done ? 100 : Math.min(Math.floor(r.pct * 100), 99);
  // Only a goal that collects has an opening deposit to suggest; the first payment
  // against a debt is whatever the instalment is, and this card does not know it.
  const firstStep = goal.paying ? 0 : firstStepFor(target, goal.progress);

  return (
    <article
      className={cn(
        "money-card-premium goal-card-premium relative flex flex-col overflow-hidden rounded-card border",
        r.done ? "goal-card-reached border-gold/45" : "border-line bg-surface",
      )}
      style={{ "--goal-accent": accent } as CSSProperties}
    >
      {/*
        The accent, down the whole edge — its identity in the grid.

        The paint is not set here. A flat inline `background` beats any rule in the
        stylesheet, so the rail could only ever be one colour laid on flat, and flat is
        exactly what made it read as khaki rather than gold. The card declares
        `--goal-accent` above and `.goal-accent-rail` reads it — same arrangement the
        hover sheen uses, and the rule is then free to give the edge a top and a bottom.
      */}
      <span aria-hidden="true" className="goal-accent-rail absolute inset-y-0 left-0 w-1" />

      {/* Small, high, out of the way — the only register a watermark works in. */}
      <GoalIcon className="goal-card-mark" aria-hidden="true" strokeWidth={1.1} />

      <div className="flex flex-1 flex-col py-3.5 pr-4 pl-5">
        <div className="flex items-start gap-2">
          {/*
            The trophy sits with the name.

            It was inside the `Reached` badge, which put it directly over the goal
            watermark in the same corner — two glyphs stacked, and the badge had to give
            up its status dot to make room. The name row is the opposite kind of place:
            it already exists, it is the first thing read, and the top-left is the one
            part of the card nothing else claims.

            So the badge goes back to being a badge, the watermark keeps its corner, and
            the reward marks the goal where you read its name.
          */}
          <h3 className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] font-bold text-ink">
            {r.done && <Trophy className="h-3.5 w-3.5 shrink-0 text-gold-hi" aria-hidden />}
            <span className="truncate">{goal.name}</span>
          </h3>
          <div className="goal-card-controls -mt-1 -mr-1 flex shrink-0 items-center gap-1">
            {reorderable && <Reorder goal={goal} first={first} last={last} />}
            <Link
              href={`${GOALS_HREF}?edit=${goal.id}`}
              aria-label={`Edit ${goal.name}`}
              title={`Edit ${goal.name}`}
              className="zv-rowctrl"
            >
              <Pencil className="h-3.75 w-3.75" />
            </Link>
            {/*
              The bin belongs beside the pencil, not three clicks away inside the edit
              panel. Everything it can destroy is explained in the confirmation.
            */}
            <DeleteButton
              compact
              label={`Delete ${goal.name}`}
              confirmText={`Delete "${goal.name}"? The target goes, the money does not: every deposit stays in the ledger and counts as free to spend again. To keep the record, close the goal instead.`}
              action={deleteGoal.bind(null, goal.id)}
            />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
          <span>
            <small className="goal-saved-label">{goal.paying ? "Paid" : "Saved"}</small>
            {/*
              A goal nothing has gone into has no amount to report, and `0 RSD` in
              24px bold claims one. The dash says the same truth in the register the
              fact deserves, and it stops a screen of untouched goals reading as a
              screen of failures.
            */}
            <b className="mono goal-saved-value block text-[24px] font-semibold tracking-[-0.7px] text-ink">
              {goal.progress === 0 ? (
                <span className="text-faint">—</span>
              ) : (
                fmt(goal.progress)
              )}
            </b>
          </span>
          {r.badge && <Badge status={r.badge.status}>{r.badge.label}</Badge>}
        </div>

        {target > 0 && (
          <dl className="goal-card-metrics">
            <div>
              <dt>Target</dt>
              {/*
                The conversion rides on the same line rather than taking its own.

                A goal aimed at €700 is a fact about euros and stays one; the dinar
                figure is what that means in the money this screen counts. On its own
                line it made a euro goal exactly one row taller than every other card,
                which is the kind of small difference that stops a grid being a grid.
              */}
              <dd className="mono">
                {foreign ? (
                  <>
                    {formatAmount(aimedAt, goal.currency)}
                    <span className="goal-card-metric-note"> ≈ {fmt(target)}</span>
                  </>
                ) : (
                  fmt(target)
                )}
              </dd>
            </div>
            <div>
              <dt>
                {r.done
                  ? goal.paying
                    ? "Overpaid"
                    : "Above target"
                  : goal.paying
                    ? "Left to pay"
                    : "Remaining"}
              </dt>
              {/*
                `ABOVE TARGET 0 RSD` is the same zero removed everywhere else: a goal that
                landed exactly on its target has overshot by nothing, and printing the
                nothing claims a measurement. The dash says it without the claim.
              */}
              <dd className={cn("mono", r.done && goal.progress > target && "text-gold-hi")}>
                {r.done ? (
                  goal.progress > target ? (
                    fmt(goal.progress - target)
                  ) : (
                    <span className="text-faint">—</span>
                  )
                ) : (
                  fmt(remaining)
                )}
              </dd>
            </div>
          </dl>
        )}

        {r.pct !== null && shown !== null && (
          <div className="mt-2.5 flex items-center gap-2.5">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={shown}
              aria-label={`${goal.name} progress`}
              className="goal-progress-track h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-white/6"
            >
              {/*
                Quarter marks.

                Progress that only ever says a percentage gives you nothing to cross;
                a bar with thresholds on it does, and crossing one is what carries
                people through the long middle of a goal where deposits usually stop.
                They are hairlines, not decorations — the bar still reads as one thing.
              */}
              {[25, 50, 75].map((mark) => (
                <span
                  key={mark}
                  aria-hidden="true"
                  className={cn("goal-milestone", shown >= mark && "is-passed")}
                  style={{ left: `${mark}%` }}
                />
              ))}
              {/* A first deposit that rounds to nothing still deserves to be visible. */}
              <div
                className="money-progress-fill h-full rounded-pill transition-[width] duration-700 motion-reduce:transition-none"
                style={{
                  width: `${goal.progress > 0 ? Math.max(r.pct * 100, 2) : 0}%`,
                  background: accent,
                }}
              />
            </div>
            <span className="mono w-9 shrink-0 text-right text-[11.5px] font-semibold text-muted">
              {shown}%
            </span>
          </div>
        )}

        {/*
          One line of context, and always exactly one.

          This slot used to be four separate blocks that each appeared in their own
          circumstance — the opening-deposit prompt, the "You made it" note, the pace
          line, the running total — so no two cards were the same height and the grid
          could never be a grid. They are one slot now, filled by whichever fact
          matters most in the state the goal is actually in.

          The order is the order of usefulness: a goal with nothing in it needs a first
          step, a finished one needs to know the money is still only reserved, and
          everything in between needs the pace. `&nbsp;` holds the line open when a goal
          has none of those, so the card keeps its height rather than collapsing a row.

          What was cut is not lost — the long version of the reached note, the deposit
          history and the consequence line all sit behind the disclosure, where the
          form is.
        */}
        <p className="goal-card-line">
          {!expanded && firstStep > 0 ? (
            <>
              Nothing in yet.{" "}
              <button type="button" onClick={onToggle} className="goal-first-step">
                Start with {fmt(firstStep)}
              </button>{" "}
              — that is {Math.round((firstStep / target) * 100)}% of the way.
            </>
          ) : r.done ? (
            goal.paying ? (
              /*
                A debt that is clear has nothing left to do, so the line says so and
                stops. The "I bought it" door belongs to the other direction: it exists
                because a funded goal is still holding money that has to be spent and
                released in one act, and a paid-off one is holding nothing.
              */
              <span>Nothing left to pay.</span>
            ) : (
              <>
                <span>Fully funded.</span>
                <Link href={`${GOALS_HREF}?edit=${goal.id}`} className="goal-reached-link">
                  I bought it →
                </Link>
              </>
            )
          ) : goal.target_date && r.pace ? (
            <span className="min-w-0 truncate">
              <span className="mono">{goal.target_date}</span> · {r.pace}
            </span>
          ) : target === 0 ? (
            <span className="min-w-0 truncate">{r.note}</span>
          ) : (
            <>&nbsp;</>
          )}
        </p>

        {/*
          The finished goal is the one card allowed to break the grid.

          Every other card on this screen was flattened to one height on purpose, and
          this note was flattened with them — reduced to a badge and a single line, and
          filed behind the disclosure. That was the equalisation applied one card too
          far. A goal you have actually funded is the only outcome this whole screen
          exists to produce, and a screen that treats reaching a target as one more row
          in a lattice has quietly said it does not matter.

          So the note comes back onto the closed card, and the extra height it costs is
          the point rather than the price: a finished goal is visibly a different object
          from the thirty-seven still in progress. The uniform grid holds for everything
          that is still on its way, and breaks exactly where something has arrived.

          The rest of the detail — deposits, consequence, movement history — stays
          behind the disclosure, since none of it is a reward.

          The note itself is one line now, not five. It was a bordered box with a
          trophy, a bold headline, four sentences and a link — a full-page announcement
          inside a card the size of a postcard. Most of that text was procedure: where
          the money is, what happens when you buy the thing, that saying so once closes
          the goal. Procedure is documentation, and it goes behind the disclosure with
          the rest of the detail. What stays is the news, and the door.

          The goal's own mark replaces the trophy. A trophy is a generic reward glyph
          that could sit on any screen in any app; this shape has been standing for this
          goal since the sidebar, and lit in gold it says *this hit* rather than *a prize
          was awarded*.
        */}
        {/*
          The long version, and only when the card is open.

          Everything the reached state used to say on the closed card — where the money
          is, what happens when you buy the thing, that saying so once closes the goal —
          is procedure, and it read as a manual page stapled to a postcard. The closed
          card says it in two words on the context line above with the door beside them;
          this is here for whoever wants the rest.
        */}
        {expanded && r.done && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
            {r.note}
            {goal.paying
              ? " — nothing is owed on it any more. Close it and it stops taking up room here."
              : " — the money has not moved. When you buy the thing, say so once and Zevern logs the purchase and closes the goal together."}
          </p>
        )}

        {expanded && !r.done && goal.deposited > 0 && (
          <p className="mt-1.5 text-[11.5px] text-muted">
            <span className="mono text-ink">{fmt(goal.deposited)}</span>{" "}
            {goal.paying ? "paid across" : "in across"} {goal.movements}{" "}
            {goal.movements === 1 ? "move" : "moves"}
            {goal.withdrawn > 0 && (
              <span className="text-faint">
                {" "}
                · <span className="mono">{fmt(goal.withdrawn)}</span>{" "}
                {goal.paying ? "refunded" : "taken back"}
              </span>
            )}
          </p>
        )}

        {expanded && r.consequence && <p className="goal-consequence">{r.consequence}</p>}

      </div>

      {expanded && <GoalHistory goal={goal} />}

      {/*
        The disclosure covers the deposit form and nothing else.

        Everything above it is a reading — what is held, what is aimed at, how the pace
        looks — and a reading is what you came to the card for. Hiding those behind a
        click made the card cheap to render and useless to scan. The form is the only
        part that is an *act*, and an act is the thing worth asking for.
      */}
      {(expanded || closing) && (
        <div className={cn("goal-money-reveal", closing && "is-closing")}>
          {goal.paying ? (
            <PayOff goal={goal} accounts={accounts} done={r.done} />
          ) : (
            <MoveMoney goal={goal} accounts={accounts} siblings={siblings} done={r.done} />
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="goal-card-toggle"
      >
        <span>
          {expanded ? "Done" : r.done ? "Details" : goal.paying ? "Log a payment" : "Put money aside"}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5", expanded && "is-open")} aria-hidden />
      </button>
    </article>
  );
}

