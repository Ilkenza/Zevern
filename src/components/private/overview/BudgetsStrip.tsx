import Link from "next/link";
import { Wallet } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { MoreRow } from "@/components/ui/MoreRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { getMoney } from "@/lib/data/money";
import { monthRange } from "@/lib/money";
import { readPlan, windowLabel, PLAN_STATUS_TONE } from "@/components/private/budgets/plan-reading";
import { boostNote, filedNote } from "@/lib/money/budget-boosts";
import type { BudgetPlanLine } from "@/lib/types";

/**
 * The named budgets, on the screen that is supposed to summarise the month.
 *
 * They were on no other panel here. "Where it went" reads per-category caps, which is a
 * narrow slice of what a budget can be — one monthly expense budget watching exactly one
 * category — so a fortnightly one, a savings one, or a holiday you file things into by
 * hand simply did not exist as far as this page was concerned. You could be 20.000 into
 * a 35.000 trip and read the whole overview without learning it.
 *
 * Five, then a count. The Budgets screen is one tap away and is where they are managed;
 * this is the window onto it.
 */
const SHOWN = 5;

export async function BudgetsStrip({ lines, today }: { lines: BudgetPlanLine[]; today: string }) {
  const { fmt, fmtShort } = await getMoney();

  /*
    The dates on a budget that runs the current calendar month, which is most of them.

    Every monthly row printed `Aug 1 – Aug 31`, five rows deep, directly under a rule that
    says August in twenty-point type. Five identical date ranges are five lines of screen
    spent on a fact stated once already, and they sat in the same slot as the one range
    that matters — `Aug 28 – Sep 6` on the trip, which is the row where the reader
    genuinely does not know the dates. Repeating the known one is what hid the unknown one.
  */
  const thisMonth = monthRange(today.slice(0, 7));

  const readings = lines.map((line) => ({ line, reading: readPlan(line, today, fmt) }));

  /*
    Worst first, and "worst" is how far past its own pace it is rather than how big it
    is. A 35.000 holiday at 40% and a 3.000 limit at 900% are not comparable by amount,
    and ordering by amount buries the one that is actually going wrong.
  */
  const ordered = [...readings].sort((a, b) => b.reading.raw - a.reading.raw);
  const shown = ordered.slice(0, SHOWN);

  return (
    <Panel
      title="Budgets"
      action={
        <Link href="/private/budgets" className="text-[12px] font-semibold text-gold-hi">
          Manage
        </Link>
      }
    >
      {lines.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No budgets yet"
          description="A budget is a name, an amount and a stretch of time — a month, a fortnight, a holiday."
          action={
            <Link href="/private/budgets" className={buttonClasses("primary")}>
              Make the first one
            </Link>
          }
        />
      ) : (
        <>
          <ul className="ov-budgets">
            {shown.map(({ line, reading }) => {
              const limit = line.limitRsd;
              const over = reading.status === "over";
              const note = boostNote({ extra: line.extra, sources: line.boostedBy }, fmt);
              const filed = filedNote(line.filed, line.filedIn, fmtShort);
              /*
                How far along the track the limit sits.

                A bar that fills to the end and stops cannot tell 1.237 over from
                100.000 over — both paint the same solid red line, so a Groceries budget
                six percent past its ceiling looked exactly as bad as one blown six times
                over, and red stopped meaning anything.

                So once a budget is past its limit the track stops being the limit and
                becomes the spend. The gold reaches as far as the budget allowed, the red
                behind it is everything past that, and the mark sits on the boundary. Six
                percent over is a sliver of red; six times over is almost all of it.
              */
              const capAt = over && line.used > 0 ? limit / line.used : 1;
              return (
                <li key={line.plan.id}>
                  <Link href="/private/budgets" className="ov-budget">
                    <span className="ov-budget-head">
                      <span className="ov-budget-name">
                        {line.plan.name}
                        {/*
                          The one property of a budget you cannot infer from its figures.
                          An 'added only' budget at 0 is not a budget being kept — it is a
                          budget nothing has been filed into yet, and those read identically
                          without the word.
                        */}
                        {line.plan.membership === "added" && <em>added only</em>}
                      </span>
                      <span className="mono ov-budget-amt">
                        {fmtShort(line.used)}
                        <i>/ {fmtShort(limit)}</i>
                      </span>
                    </span>

                    <span className={`ov-budget-track${over ? " is-over" : ""}`} aria-hidden>
                      <span
                        style={{ width: `${(over ? capAt : Math.max(reading.pct, 0)) * 100}%` }}
                      />
                      {/*
                        The mark is whatever you are being measured against right now.

                        Inside the limit that is the window: without it the bar answers
                        "how much is gone" and leaves you to work out whether that is a lot
                        for the 28th, which is the only thing that makes the first figure
                        mean anything. Past the limit the window has nothing left to say,
                        and the mark moves to the ceiling — the point the red starts.
                      */}
                      <b
                        style={{
                          left: `${(over ? capAt : Math.min(Math.max(reading.pace, 0), 1)) * 100}%`,
                        }}
                      />
                    </span>

                    <span className="ov-budget-note">
                      <span className={PLAN_STATUS_TONE[reading.status]}>{reading.note}</span>
                      {!(
                        line.window.from === thisMonth.from && line.window.to === thisMonth.to
                      ) && <em>{windowLabel(line.window)}</em>}
                    </span>

                    {/*
                      Where the extra room came from.

                      A limit that changed and does not say why is worse than a limit that
                      was broken. In three months nobody remembers granting it, and reading
                      25.000 on a budget you know you set to 20.000 costs you your trust in
                      both figures — so the trip that granted it is named on the card, not
                      buried on the trip's own screen.
                    */}
                    {note && <span className="ov-budget-why">{note}</span>}
                    {/* Same sentence as the Budgets card, and quieter — it is context, not a warning. */}
                    {filed && <span className="ov-budget-also">{filed}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <MoreRow count={lines.length - SHOWN} href="/private/budgets" noun="budget" />
        </>
      )}
    </Panel>
  );
}


