import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { MoreRow } from "@/components/ui/MoreRow";
import { getMoney, type DueSoon } from "@/lib/data/money";
import { nextDay } from "@/lib/money/occurrences";

/**
 * What is about to leave, by name and by date.
 *
 * The overview headlined "free to spend" and said nothing about the rent landing on
 * Friday, so the one number the page exists to give you was the one number on it that
 * needed a caveat. That caveat spent a while as a clause on the headline itself, which
 * was honest but thin: it could say how much and not what, and "66.200 due" with no
 * names attached is a figure you either already knew or cannot act on.
 *
 * Outflow only, and deliberately: money arriving on the 5th cannot be spent on the
 * 3rd, so a salary netted off would put the headline straight back where it was. What
 * goes into a goal is out too — it moves money already yours between two labels on one
 * account, and `free` has taken it off once already. Both rules live in `getDueSoon`;
 * this only draws what comes back.
 *
 * Kept small on purpose. It is a fence around the headline, not a screen — Upcoming is
 * the screen, and it is one tap away. So the summary is one line rather than a column
 * of its own, each item is one line rather than two, and three of them is the whole
 * card. Everything this panel could grow into already exists somewhere better.
 */

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A date said the way it would be said out loud.
 *
 * "29/08" is a fact about the calendar; "tomorrow" is a fact about you, and this panel
 * is read to decide whether to spend money today. Past the first two days the weekday
 * carries most of that — "Fri 29/08" tells you whether it lands before or after payday
 * without counting. Read in UTC, which is the clock these dates were written on.
 */
function whenLabel(on: string, from: string): { text: string; late: boolean } {
  if (on < from) return { text: "overdue", late: true };
  if (on === from) return { text: "today", late: false };
  if (on === nextDay(from)) return { text: "tomorrow", late: false };
  const day = new Date(`${on}T00:00:00Z`).getUTCDay();
  return { text: `${WEEK[day]} ${on.slice(8)}/${on.slice(5, 7)}`, late: false };
}

/** Three rows. Past that it stops being a glance and starts being the Upcoming screen. */
const SHOWN = 3;

export async function DueSoonPanel({ soon, free }: { soon: DueSoon; free: number }) {
  const { fmt } = await getMoney();
  /*
    Rows skip what has already fallen due.

    Those are listed above in "Due now", with an amount field and a Book button beside
    them, and printing the same rent again two panels down reads as two rents. They are
    still in the total — an unbooked bill has not left the account — so the band names
    the figure instead, which points at the panel above without repeating its contents.
  */
  const coming = soon.items.filter((i) => i.on >= soon.from);
  const shown = coming.slice(0, SHOWN);
  const after = free - soon.total;

  return (
    <Panel
      title="Due soon"
      action={
        <Link href="/private/upcoming" className="text-[12px] font-semibold text-gold-hi">
          Upcoming
        </Link>
      }
    >
      {soon.count === 0 ? (
        /*
          Not the full empty state with its icon and its button. "Nothing is due" is
          good news that takes one line to deliver, and a panel that answers its own
          question in a sentence should not take a screenful to say so.
        */
        <p className="flex items-center gap-2 px-4 py-3.5 text-[12.5px] text-muted">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
          Nothing due in the next {soon.days} days.
        </p>
      ) : (
        <>
          {/*
            The sum and what it leaves, on one line.

            This was a column down the left-hand side, which gave a two-figure
            conclusion the same footprint as the list it summarised and made the card
            twice as tall as the fact it carries. One line says the same thing: how much
            goes, and what survives it.

            "Leaves free" is the half the headline above cannot say, so it takes the
            right-hand end where the eye stops. When there is not enough, the label
            changes rather than the figure growing a minus sign — a shortfall read at a
            glance as a negative is a shortfall read as a typo.
          */}
          <div className="due-soon-band">
            <span className="due-soon-total">{fmt(soon.total)}</span>
            <span className="due-soon-when">
              out over {soon.days} days · {soon.count} {soon.count === 1 ? "item" : "items"}
              {soon.overdue > 0 && (
                <em>· {fmt(soon.overdue)} of it needs your review above</em>
              )}
            </span>
            <span className={`due-soon-left${after < 0 ? " is-short" : ""}`}>
              {after < 0 ? `Short by ${fmt(-after)}` : `Leaves ${fmt(after)} free`}
            </span>
          </div>

          <div>
            {shown.map((item) => {
              const when = whenLabel(item.on, soon.from);
              return (
                <div
                  key={`${item.id}-${item.on}`}
                  className="flex items-center gap-2.5 border-b border-line-soft px-4 py-2 last:border-b-0"
                >
                  <span
                    className="h-4 w-1 shrink-0 rounded-pill"
                    style={{ background: "var(--color-faint)" }}
                  />
                  {/*
                    Name and date as one group on the left, amount alone on the right.
                    Pinning the date to the right edge as well left a hand's width of
                    nothing across the middle of every row.
                  */}
                  <div className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="truncate text-[13px] text-ink">{item.name}</span>
                    {/*
                      Late is the only state here that asks anything of you, so it is
                      the only one that gets a colour. Everything else is a date.
                    */}
                    <span
                      className={`mono shrink-0 text-[11.5px] ${when.late ? "font-semibold text-danger" : "text-faint"}`}
                    >
                      {when.text}
                    </span>
                  </div>
                  <span className="mono shrink-0 text-[12.5px] text-muted">
                    {fmt(item.amount)}
                  </span>
                </div>
              );
            })}
            {/*
              Nothing left to draw happens when every item in the window is already
              late. The panel still has a total worth showing, so it says where the
              rows went rather than sitting there with a heading and a gap.
            */}
            {coming.length === 0 && (
              <p className="due-soon-none">
                All of it is in the list above, waiting to be booked.
              </p>
            )}
            <MoreRow count={coming.length - shown.length} href="/private/upcoming" noun="item" />
          </div>
        </>
      )}
    </Panel>
  );
}
