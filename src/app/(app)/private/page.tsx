import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  ListChecks,
  Wallet,
} from "lucide-react";
import {
  getBudgetLines,
  getBudgetPlanLines,
  getDueRecurring,
  getDueSoon,
  getExpenseTrend,
  hasIncomeOnFile,
  getGoalLines,
  getMonthSummary,
  getOnHand,
  getTransactions,
  getAccountBalances,
  getUnpricedTransactions,
  getLoans,
  loanTotals,
  isGoalOpen,
} from "@/lib/data/money";
import { getMoney } from "@/lib/data/money";
import { getTasksForToday } from "@/lib/data/tasks";
import { todayISO } from "@/lib/format";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { NetKpi } from "@/components/private/NetKpi";
import { EmptyState } from "@/components/ui/EmptyState";
import { TaskCheckbox } from "@/components/tasks/TaskCheckbox";
import { MoreRow } from "@/components/ui/MoreRow";
import { CAT_REST, catTone } from "@/lib/money/tone";
import { remedyFor } from "@/components/private/budgets/status";
import { NeedsList } from "@/components/private/overview/NeedsList";
import { BudgetsStrip } from "@/components/private/overview/BudgetsStrip";
import { daysUntil, readNeeds, whenPhrase } from "@/components/private/overview/needs-you";
import { readPlan } from "@/components/private/budgets/plan-reading";
import {
  monthKey,
  monthLabel,
  daysLeftInMonth,
  monthProgress,
  monthRange,
  shiftMonth,
  shortMonthLabel,
  UNCATEGORIZED_CATEGORY_ID,
} from "@/lib/money";

/*
  How much of each list this screen is allowed to show.

  An overview is a set of windows onto other screens, and a window has to have a frame.
  Without one every panel here grows with the data behind it: forty tasks due today,
  forty categories with limits, forty goals — and the page stops being a page you scan
  and becomes four screens stacked end to end, none of them the screen that was built
  for the job.

  So each list is cut, and each cut says so. The number below every capped list is not
  decoration — a panel showing five of forty budgets and a panel showing all five look
  identical without it, which makes the silent version a screen quietly understating
  the size of your life.

  Four and five rather than ten: the point of the cut is that the panel stays a glance.
  Goals and the due list take four because their rows are two lines tall.
*/
/*
  A card should end level with the card beside it.

  This was `items-start` for a while, on the argument that a card should end where its
  content ends and that stretching leaves a dead band inside the border. That argument
  was right about the band and wrong about the fix. Both panels show five rows, so the
  row is not lopsided because one holds more — it is lopsided because a goal's row is
  two lines and a task's is one, and no amount of counting evens that out. Two cards
  ending forty-odd pixels apart, for no reason a reader can see, is the version that
  looks unfinished.

  So they stretch, and the slack goes above the `N more` footer rather than below it.
  The footer lands on the bottom edge of both cards, which is where a footer belongs,
  and there is no orphaned band under a last row — the thing `items-start` was avoiding.

  Five rather than four while we are here: the two panels beside each other show the
  same number of things, which is the other half of why that row looked lopsided.
*/
const TODAY_SHOWN = 5;
const CATS_SHOWN = 5;
const GOALS_SHOWN = 5;

/** Long enough to read as a date rather than a code, in the one place a date is the point. */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Which of three sizes the headline figure is set at.
 *
 * By the printed string rather than by the number, because the currency code and the
 * grouping dots take width too — `4.493.463.750 RSD` is seventeen characters whether the
 * amount is dinars or euros, and it is the character count the band has to hold.
 */
function heroLength(figure: string): "m" | "l" | "xl" {
  if (figure.length >= 19) return "xl";
  if (figure.length >= 15) return "l";
  return "m";
}

export default async function PrivateOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // The month was fixed to today, which left the page showing a month it gave you no
  // way to leave — while Money and Budgets both let you walk back through them.
  const params = await searchParams;
  const { fmt, fmtExact, fmtShort } = await getMoney();

  const current = monthKey();
  const today = todayISO();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? (params.month as string) : current;

  /*
    Whether this page is describing now, or reading back a month.

    The month arrows have been here a while and the page never noticed them. Walk back
    to July and the heading said July while six blocks under it went on reporting today:
    what is on the accounts this minute, what falls due in the next fortnight, what is
    waiting to be booked, today's tasks, the goals. A page whose heading names one month
    and whose body describes another is not showing you two things — it is inviting one
    wrong reading of both.

    Forward has the same fault and is worse, because nothing there has happened yet. A
    September that has not started cannot have a balance, and printing today's under a
    September heading is the same mistake pointing the other way.

    So the test is "is this the current month", not "is this the past" — and the blocks
    that answer "right now" simply are not on the page for any other month. What is left
    is the month's own record, which is what you came back for.
  */
  const live = month === current;

  /*
    Nothing that only the live page shows is even fetched otherwise. Eight of these
    twelve reads exist for blocks that a past month does not render, and a landing
    screen should not pay for what it is not going to draw. The placeholders are never
    read — every one of them sits behind `live` in the markup below.
  */
  const [summary, lines, trend, incomeOnFile, allGoals, due, tasks, onHand, accounts, unpriced, soon, loans, plans, past] =
    await Promise.all([
      getMonthSummary(month),
      getBudgetLines(month),
      // The six months up to the one being read, so the strip is always about this page.
      getExpenseTrend(6, month),
      // Not "did anything arrive this month" — whether the profile has ever said what
      // comes in at all. The net note needs the difference; see `monthNetNote`. Asked
      // for every month, because the note it feeds is on the card for every month.
      hasIncomeOnFile(),
      live ? getGoalLines() : Promise.resolve([]),
      live ? getDueRecurring() : Promise.resolve([]),
      live ? getTasksForToday("personal") : Promise.resolve([]),
      live ? getOnHand() : Promise.resolve({ total: 0, reserved: 0, free: 0 }),
      live ? getAccountBalances() : Promise.resolve([]),
      live ? getUnpricedTransactions() : Promise.resolve([]),
      /*
        What is already committed, so the headline above stops overstating itself.

        A fortnight rather than a week. Seven days was chosen when this was one clause
        on the headline and had to earn its space; as a card of its own the window is
        chosen for what it tells you instead, and a week is short enough that most
        months it is empty — which is the one thing a permanent card must not be. Two
        weeks catches roughly half the monthly charges and is still near enough that
        "what it leaves free" is an answer rather than a forecast.
      */
      live ? getDueSoon(14) : Promise.resolve({ days: 14, from: "", total: 0, count: 0, overdue: 0, items: [] }),
      /*
        What is owed, in both directions.

        The headline says what can be spent and has no way to mention that 240.000 of
        it is a bank's. Money borrowed sits on the account like any other money — that
        is the whole difficulty with it — so nothing else on this page can tell you it
        is there. It reads as a clause on the same line rather than a block of its own,
        because it is the same sentence: this is what you have, and this is what has a
        claim on it.
      */
      live ? getLoans() : Promise.resolve([]),
      /*
        The named budgets. They were on this page only as per-category caps, which is
        the narrowest shape a budget can take — one month, one category — so a
        fortnightly one, a savings one, or a holiday you file purchases into by hand
        was invisible here however much of it you had spent.
      */
      live ? getBudgetPlanLines() : Promise.resolve([]),
      /*
        The month itself, and only for a month that is over.

        A closed month dropped eight of the blocks above — the hero, what needs you,
        today's tasks, the goals, the budgets — because every one of them is about now
        and a record has no now. What was left was three figures and a bar chart, on a
        page with a screen and a half of nothing under it, and the page read as broken
        rather than as finished.

        The fix is not to put the live blocks back with stale numbers in them. It is that
        a finished month has facts of its own that the live page has no room for: what the
        largest things actually were, and where the money came from. One read for both,
        and it is the read the live page spends thirteen on not needing.
      */
      live ? Promise.resolve([]) : getTransactions({ month }),
    ]);

  const { owedToYou, youOwe } = loanTotals(loans);

  /*
    The eight largest things that happened, biggest first.

    Not a top-of-mind list — a record. Nothing anywhere in this app names a single entry
    of a month that is over; "Where it went" ranks categories, which answers what kind of
    thing the money was and never which one. Eight, because a month usually has three or
    four that decided it and the rest is noise, and a list long enough to scroll stops
    being a summary.

    Entries with no price yet are left out rather than sorted as zero: an unpriced row is
    a thing whose size is unknown, and ranking it last states the opposite.
  */
  const biggest = past
    .filter((t) => t.kind === "expense" && t.amount_rsd !== null)
    .sort((a, b) => (Number(b.amount_rsd) || 0) - (Number(a.amount_rsd) || 0))
    .slice(0, 8);

  /*
    Where it came from, which is the half `Where it went` has never had.

    The income side of a month exists on this page as one figure, and one figure cannot
    tell a salary from a sale from money a client finally paid. On a live month that is
    fine — the question people bring to a live month is what is left. On a closed one it
    is half the record.
  */
  const cameFrom = (() => {
    const by = new Map<string, number>();
    for (const t of past) {
      if (t.kind !== "income") continue;
      const key = t.category?.name ?? "Uncategorised";
      by.set(key, (by.get(key) ?? 0) + (Number(t.amount_rsd) || 0));
    }
    return [...by.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  })();
  /*
    The two accounts this page repeats, in the order they were chosen.

    There used to be a fallback here — first two accounts — for a database that did not
    have `overview_rank` yet, because migration 0044 sat in the repository unapplied while
    the app was already reading and writing the column. It is applied now, so the column is
    on every row and the fallback could never be reached: its guard asked whether any
    account had the property at all, which is true of every row the moment the column
    exists. A rank means shown, in that place; null means not shown, including when that
    leaves none — which is a choice `Show on overview` is allowed to make.
  */
  const overviewAccounts = accounts
    .filter((account) => typeof account.overview_rank === "number")
    .sort((a, b) => (a.overview_rank ?? 0) - (b.overview_rank ?? 0));

  const pace = monthProgress(month);

  /*
    The one line on this page that is not a measurement.

    Everything else here reports: spent, left, coming, split this way. None of it says
    what any of it means, and a screen you open every morning that only ever reports is
    a screen you stop opening — the bank app already does that, faster.

    `remedyFor` is already written and already used on Budgets. It picks the category
    furthest past where it should be *by now* — not the biggest one, because a category
    three times the size of another can be perfectly on plan — and works out what a week
    of it has to cost for the month to still fit.

    Under five percent of the limit it says nothing. Two hundred dinars past pace on the
    3rd is arithmetic, and a warning that fires every morning is one nobody reads on the
    morning it matters.
  */
  const daysLeft = daysLeftInMonth(month);
  const drift = live ? remedyFor(lines, pace, daysLeft) : null;
  const remedy = drift && drift.gap / drift.limit > 0.05 ? drift : null;
  /*
    Live goals, the ones you have actually started leading.

    Closed goals are history and hold nothing back, so they are out. What is left came
    back in whatever order the query gave it — which on a capped list of four meant a
    goal with money in it could sit fifth and never appear, while four untouched ones
    took the panel and printed four dashes. A panel of dashes is a panel reporting that
    nothing is happening, on a screen where something is.

    Started first, then by how close to done. Nearest the target leads because that is
    the one worth another deposit; a goal at 90% is a decision, a goal at 4% is a plan.
    Where there is no target to be near, the larger balance goes first — it is the only
    ordering the numbers support.
  */
  const savedOn = (g: (typeof allGoals)[number]) => g.progress;
  const progressOf = (g: (typeof allGoals)[number]) => {
    const target = Number(g.target_rsd) || 0;
    return target > 0 ? g.progress / target : 0;
  };
  const goals = allGoals.filter(isGoalOpen).sort((a, b) => {
    const started = Number(savedOn(b) > 0) - Number(savedOn(a) > 0);
    return started || progressOf(b) - progressOf(a) || savedOn(b) - savedOn(a);
  });
  const peak = Math.max(1, ...trend.map((t) => t.expense));

  // What this page knows that no card below it repeats: how this month compares with
  // the last one.
  const prevKey = shiftMonth(month, -1);
  const prevName = monthLabel(prevKey).split(" ")[0];
  const prevExpense = trend.find((t) => t.month === prevKey)?.expense ?? 0;
  /*
    Bills whose date is already inside this month and which have not been booked yet.

    `getDueSoon` looks fourteen days ahead, which runs past the end of the month — and a
    figure headed "by the 31st" that quietly includes a bill dated the 4th of September
    is the sort of small lie that makes somebody stop reading the whole block.
  */
  const monthEnd = monthRange(month).to;
  const dueBeforeMonthEnd = soon.items
    .filter((item) => item.on <= monthEnd)
    .reduce((sum, item) => sum + item.amount, 0);
  const delta = prevExpense > 0 ? (summary.expense - prevExpense) / prevExpense : null;

  /*
    Everything still waiting on a decision, ranked once, in `needs-you`.

    The page already knew all of it — as four panels stacked in the order they were
    written, each certain its own contents came first. So on 28 August a 30.776,48
    instalment falling due in three days sat in the third panel down, under two smaller
    things, and the screen's answer to "is anything about to go wrong" was "read all of
    it and decide". One ranking gives the top of the page a sentence and gives the band
    below it a count.

    The panels keep rendering themselves. Repeating their rows here would be the same
    payment reported twice a hand's width apart, so `needs.budgets` is only the part
    that no panel owns.
  */
  const needs = live
    ? readNeeds({
        today,
        // Only the ones waiting for a tap. The fixed rules entered ahead of time book
        // themselves when the screen opens, and listing them as things that need you
        // would be asking about work already done by the time you read it.
        dueNow: due.filter(
          (r) => r.variable || !(Number(r.amount) > 0) || String(r.created_at).slice(0, 10) >= r.next_on,
        ),
        // Already-due items are the `dueNow` list above; counting them from both
        // sources would report one late bill as two.
        coming: soon.items
          .filter((i) => i.on >= soon.from)
          .map((i) => ({ id: i.id, name: i.name, amount: i.amount, on: i.on })),
        unpriced,
        budgets: plans.map((line) => ({ line, reading: readPlan(line, today, fmt) })),
        fmt,
      })
    : { all: [], shown: [], hidden: 0, count: 0, headline: null };

  /*
    What is next, for the mornings when nothing is wrong.

    The sentence under `Today` had two states and one of them was "Nothing needs you" —
    word for word the calm line four blocks further down, printed in the one place on the
    screen that is read first and read every day. A masthead that empties itself on a good
    morning teaches you to skip it, and by the bad morning you are skipping it.

    So the good-day sentence reports instead of reassuring: the next thing that has a date
    on it. It is already fetched, it is rarely the same two days running, and it is the
    only forward-looking line above the month rule.
  */
  const nextUp = live ? (soon.items.find((item) => item.on >= today) ?? null) : null;

  /*
    Money already promised to something that is happening now.

    `Free to spend` is accounts less what goals hold, and a goal holds money because the
    dinars actually moved. A budget moves nothing — the money is still on the account and
    still spendable — so subtracting it would claim a movement that never happened. But
    20.474 of that headline is the rest of a holiday you are four days into, and a figure
    that calls it free is a figure that will be wrong by the time you get home.

    So it reads as a clause, exactly like borrowed money does two lines up: this is what
    you have, and this is what already has a claim on it. Only the budgets you file into
    by hand count: a budget that watches a category is already being spent out of the
    balance as it happens, so counting it here would claim the same dinar twice.
  */
  const promisedTo = plans
    .filter(
      (line) =>
        line.plan.membership === "added" &&
        line.plan.kind === "expense" &&
        /*
          Its own dates, not a monthly ceiling.

          Without this the clause counted `odeca obuca` — 80.000 a month, added only — and
          announced `110.474 RSD` as a claim on a balance of 101.641. A monthly cap is not
          a promise: nothing is owed to it, nobody is waiting for it, and the money is only
          spoken for if you happen to spend it. A budget with a start and an end is the
          opposite — you are four days into the thing it is for, and the rest of it will be
          gone by the time it closes.
        */
        line.plan.period === "custom" &&
        today >= line.window.from &&
        today <= line.window.to &&
        line.limitRsd - line.used > 0,
    )
    .map((line) => ({ name: line.plan.name, left: line.limitRsd - line.used }))
    .sort((a, b) => b.left - a.left);

  const promised = promisedTo.reduce((sum, item) => sum + item.left, 0);

  /*
    Named, not described.

    This read "30.474 RSD planned for trips running", and every word of that had to be
    decoded: which trips, running where, and why this figure and not the one on the
    Budgets card. Half of them are not trips — one is a plain spending cap — so the
    sentence was also wrong about its own contents.

    A category with no natural name gets named by its members instead. "left on na moru
    and 1 more" cannot be misread, needs nothing decoded, and is the same length.
  */
  const promisedLabel =
    promisedTo.length === 1
      ? `${fmt(promised)} left on ${promisedTo[0].name}`
      : `${fmt(promised)} left on ${promisedTo[0]?.name} and ${promisedTo.length - 1} more`;

  const weekday = WEEKDAYS[new Date(`${today}T00:00:00Z`).getUTCDay()];

  /*
    Where the month went, as parts of a whole.

    No new query for any of this. `getBudgetLines` already returns every expense
    category with what it cost this month, and `summary.expense` is the total — so the
    split was sitting in data the page had already fetched and was only using to draw
    limit bars for the handful of categories that happen to have a limit set. A
    category you overspend on without ever having budgeted it appeared nowhere on this
    screen.

    The tail and the uncategorised remainder are folded into one `Other` segment
    rather than dropped, because segments that do not add up to the total are a chart
    that lies quietly.
  */
  const spentCats = lines
    .filter((l) => l.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  const uncategorizedSpend =
    summary.byCategory.find((category) => category.id === UNCATEGORIZED_CATEGORY_ID)?.spent ?? 0;

  /*
    Every slice of the month, ranked by size — uncategorised included.

    It used to be appended after the cut, below whatever five named categories won, and
    drawn without a bar or a share. In August that put 4.000 — nine percent of the
    month, more than Subscriptions, Learning and Transport put together — under all
    three of them, as a footnote. A panel whose whole subject is proportion cannot rank
    one of its slices by what kind of thing it is instead of how big it is.

    So it competes for its place like the rest. It is not a category and never will be,
    which is the point: money you have not filed is a real part of where the month went,
    and seeing it sit third is what makes anyone go and file it.

    The cut is a plain slice by size. It used to drag in any category that had broken
    its cap however small — an overspend reported only when the category happens to be
    large is an overspend that is not reported — but the Budgets card above reports
    every one of them now, in the panel that owns limits.
  */
  type Slice = { id: string; name: string; spent: number };
  const slices: Slice[] = [
    ...spentCats.map((l) => ({ id: l.category.id, name: l.category.name, spent: l.spent })),
    ...(uncategorizedSpend > 0
      ? [{ id: UNCATEGORIZED_CATEGORY_ID, name: "Uncategorized", spent: uncategorizedSpend }]
      : []),
  ].sort((a, b) => b.spent - a.spent);

  const topCats = slices.slice(0, CATS_SHOWN);
  const shownIds = new Set(topCats.map((slice) => slice.id));
  const otherSpend = Math.max(
    summary.expense - topCats.reduce((a, slice) => a + slice.spent, 0),
    0,
  );
  const share = (v: number) => (summary.expense > 0 ? v / summary.expense : 0);

  /*
    The next category worth a cap — chosen from the ones actually on screen.

    This used to fire only when *nothing at all* was budgeted, which made it a
    first-run message and nothing else. Nine limits in, a category spending real money
    with no cap on it got no mention anywhere: the row said "no limit" and the panel
    said nothing about it, so the one place you would notice the gap was the one place
    that would not help you close it.

    Picked from `topCats` rather than every category, because a suggestion about a row
    you cannot see is a suggestion about nothing. Largest spend first — among the
    uncapped, that is the one a limit would actually bite on.

    And only once it is worth a tenth of the month. Without that it named whatever
    happened to be uncapped, however small — "Subscriptions has no limit, 17 so far this
    month" is a true sentence and a useless one, and a panel that makes it every day
    teaches you to skip the line where it eventually matters. Plenty of categories are
    never going to be capped; the screen should ask about at most one, and only when the
    money is real.
  */
  const SUGGEST_SHARE = 0.1;
  // From the rows on screen, and only the real categories among them — `Uncategorized`
  // is not a thing you can put a limit on.
  const suggestion = spentCats
    .filter(
      (l) =>
        shownIds.has(l.category.id) &&
        l.limit === 0 &&
        summary.expense > 0 &&
        l.spent / summary.expense >= SUGGEST_SHARE,
    )
    .sort((a, b) => b.spent - a.spent)[0];

  // Where the month itself stands. The cards below say what was spent and what is
  // left; nothing on the page says how much of the month those numbers cover — and a
  // figure without its share of the month is half a sentence.
  const monthDays = Number(monthRange(month).to.slice(8));
  /** "August" — the month named rather than numbered, wherever it closes a sentence. */
  const monthName = monthLabel(month).split(" ")[0];
  /*
    The day of the month, read locally.

    This was `new Date().toISOString().slice(8, 10)`, which is UTC. Belgrade runs two
    hours ahead in summer, so between midnight and 02:00 the kicker showed yesterday —
    and on the 1st it showed the last day of the month that had just ended, beside a
    heading naming the new one. `monthKey` above uses `getFullYear`/`getMonth`, so the
    two halves of the same sentence were being read off two different clocks.
  */
  const dayNow = month === current ? new Date().getDate() : 0;
  /*
    State and position, in one line.

    These were two lines saying the same thing from two directions: "In progress" is
    the qualitative answer to "is this month still running", "Day 26 of 31" is the
    quantitative one. Together they cost one line instead of two and repeat nothing.
  */
  const phase =
    month === current
      ? `In progress · Day ${dayNow}/${monthDays}`
      : month < current
        ? `Closed · ${monthDays} days`
        : "Not started";

  return (
    <div className="money-premium mx-auto max-w-300 space-y-4">
      {/*
        The top of the screen is about now, and nothing up here can disagree with a month
        picker — because the picker is not up here any more. It sits on the rule further
        down, over the blocks it actually governs.

        That was the quarrel between the two halves of this page. One masthead was trying
        to head both a live screen and a month's record, and a heading naming August over
        a block reporting this afternoon is one wrong reading of both.
      */}
      {live ? (
        <header className="masthead">
          <div className="masthead-say">
            <span className="masthead-kicker is-live">
              <i aria-hidden />
              {weekday}
            </span>

            <h1 className="masthead-title">
              <span className="rv">
                <span className="rv-i">Today</span>
              </span>
            </h1>

            {/*
              The one sentence the screen could not say before.

              `readNeeds` has already decided which of the bills, overspends and unpriced
              entries is the most pressing; this prints it with its figure and its date,
              and is a door to where it gets dealt with.

              Exact rather than rounded. An instalment is a figure somebody else will take
              to the dinar, and `30.776` here against 30.776,48 on the statement is the
              kind of small lie that makes a person stop believing the rest of the page.
            */}
            <p className="masthead-blurb">
              {needs.headline ? (
                <Link
                  href={
                    needs.headline.action.kind === "link"
                      ? needs.headline.action.href
                      : "/private/upcoming"
                  }
                  className="is-up is-door"
                >
                  {needs.headline.title} · {needs.headline.detail}
                  {needs.headline.amount !== null && ` · ${fmtExact(needs.headline.amount)}`}
                </Link>
              ) : nextUp ? (
                <>
                  <span className="is-quiet">Nothing needs you</span>
                  <Link href="/private/upcoming" className="is-door">
                    Next: {nextUp.name} {whenPhrase(daysUntil(today, nextUp.on))} ·{" "}
                    {fmtExact(nextUp.amount)}
                  </Link>
                </>
              ) : (
                <span className="is-quiet">Nothing needs you</span>
              )}
            </p>
          </div>

          {/*
            The day, not the month. This numeral read `08/12` beside a month name, which
            was true and belonged to the half of the page that reports a month. Up here
            the unit is the day: how far into August you are is what makes "3 days left"
            mean anything.
          */}
          <span className="masthead-num" aria-label={`Day ${dayNow} of ${monthDays}`}>
            {String(dayNow).padStart(2, "0")}
            <i aria-hidden>/{monthDays}</i>
          </span>
        </header>
      ) : (
        /*
          A month you have walked back to. There is no "now" block under this, so the
          masthead is the month's own heading and carries the picker itself rather than
          handing it to a rule two centimetres below.
        */
        <header className="masthead">
          <div className="masthead-say">
            <span className="masthead-kicker">
              <i aria-hidden />
              {phase}
            </span>

            <h1 className="masthead-title">
              <span className="rv">
                <span className="rv-i">{monthLabel(month)}</span>
              </span>
            </h1>

            <p className="masthead-blurb">
              {month > current ? (
                <Link href="/private/upcoming" className="is-up is-door">
                  Not started — see what is scheduled
                </Link>
              ) : (
                <span className="is-quiet">A closed month — this is the record</span>
              )}
            </p>

            <div className="money-month-nav">
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
              <Link href="/private" className="money-month-back">
                <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />
                This month
              </Link>
            </div>
          </div>

          <span className="masthead-num" aria-label={`Month ${month.slice(5, 7)} of 12`}>
            {month.slice(5, 7)}
            <i aria-hidden>/12</i>
          </span>
        </header>
      )}

      {/*
        The figure the page exists to give you.

        Everything else here is a measurement; this is an answer. `On accounts` says
        what the bank holds, which is not the same question — goals have a claim on
        part of it, and a number you cannot actually spend is worse than no number.

        `onHand.free` is `total − reserved` and it was already being computed. It was
        reaching the screen only as a hint on the `On accounts` card, and only when
        `reserved > 0` — so on an account with no funded goals, the one number that
        answers "how much can I spend" was hidden by the very condition that made it
        equal to the total. It is unconditional now, because the question is.
      */}
      {live && (
      <section className="money-hero">
        <div className="money-hero-main">
        {/*
          "Free to spend", not "Available to spend".

          The equation on the Goals screen is labelled `ON ACCOUNTS − SET ASIDE = FREE
          TO SPEND`, the deposit form says money "stops counting as free to spend", and
          the comment over `getOnHand` uses the same phrase. This was the one place
          calling it something else, and two names for one figure is how a user starts
          wondering whether they are two figures.
        */}
        <span className="money-hero-label">Free to spend</span>
        {/*
          The whole figure, at a size that depends on how long it is.

          Shortening it was the other option — `4,5M RSD` where `4.493.463.750 RSD` is
          now — and it is right in the six little month bars, where the point is the
          comparison and a thousandth of it changes nothing. It is wrong here. This is the
          one number on the app somebody reads to decide whether they can spend something,
          and `4,5M` cannot tell 4.45 million from 4.54 — ninety thousand, hidden inside a
          rounding, on the figure that exists to be exact.

          What was actually wrong is that a thirteen-digit figure was set at the size
          chosen for a six-digit one. So the size follows the length: the same headline for
          an ordinary amount, stepped down for the ones that would otherwise take the whole
          band. The number stays whole either way.
        */}
        <div
          className={`money-hero-figure${onHand.free < 0 ? " is-short" : ""}`}
          data-len={heroLength(fmt(onHand.free))}
        >
          {fmt(onHand.free)}
        </div>
        {/*
          The composition, and only when there is one.

          With nothing reserved, `free` and `total` are the same number, and printing
          "147.983 on accounts" directly under a 147.983 headline is the page saying
          one thing twice in two sizes. The breakdown earns its line only when the two
          figures differ.
        */}
        <p className="money-hero-note">
          {onHand.reserved > 0 ? (
            <>
              <span>{fmt(onHand.total)} on accounts</span>
              <Link href="/private/goals">{fmt(onHand.reserved)} set aside</Link>
            </>
          ) : (
            <span className="is-quiet">Nothing set aside for goals</span>
          )}
          {/*
            Borrowed money is on the account like every other dinar — that is exactly
            what makes it dangerous, and why no other figure on this page can warn you
            about it. It joins the line that already says where the money sits, because
            it is the same sentence: this is what is here, and this is what has a claim
            on it.

            Lent money is the mirror and is kept separate rather than netted off. The
            two are not the same money, and cancelling them would hide both.
          */}
          {/*
            Both go to the debts screen rather than to the ledger. They were pointing at
            Money, which is where the *entries* are — so a figure that raises the question
            "which debts" answered it with a list of transactions. The question these two
            lines ask has its own page now.
          */}
          {youOwe > 0 && (
            <Link href="/private/debts" className="is-owed">
              {fmt(youOwe)} still to repay
            </Link>
          )}
          {owedToYou > 0 && (
            <Link href="/private/debts">{fmt(owedToYou)} owed to you</Link>
          )}
          {promised > 0 && <Link href="/private/budgets">{promisedLabel}</Link>}
        </p>
        </div>

          <div
            className={`onhand-accounts money-hero-accounts${overviewAccounts.length === 0 ? " is-empty" : ""}`}
          >
            {overviewAccounts.map((account) => (
              <div key={account.id} className="onhand-account">
                <span className="onhand-account-name">
                  {account.name.trim().endsWith(`(${account.currency})`)
                    ? account.name
                    : `${account.name} (${account.currency})`}
                </span>
                <span className="mono onhand-account-value">{fmt(account.balance)}</span>
              </div>
            ))}
            <Link href="/private/setup#setup-accounts" className="onhand-manage">
              Manage accounts <ChevronRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
      </section>
      )}


      {/*
        One heading over everything that wants a decision, and a count on it.

        These panels used to sit here in the order they were written, each a card with
        its own title, so the screen's answer to "is there anything" was four answers
        and a scroll. The count is the answer; the panels under it are the work.

        Order is by how much it presses, not by kind: a bill whose date has gone by
        first, then entries that cannot be counted until you price them, then a budget
        already past its ceiling, and last what is merely coming.
      */}
      {/*
        The heading appears when there is something under it to head.

        It used to be unconditional, so on a clear morning the screen printed "Needs you"
        with no count over a card whose only contents were the fortnight's total — a
        heading contradicted by the thing it was heading. A count that can read zero is
        the one number on this page that must never be decoration.
      */}
      {live && needs.count > 0 && (
        <div className="ov-eyebrow">
          <span>Needs you</span>
          <b>{needs.count}</b>
        </div>
      )}

      {/*
        On a quiet day this renders nothing at all.

        It used to render a green card saying "Nothing needs you", under a heading saying
        "Needs you", under a masthead line saying "Nothing needs you" — three ways of
        reporting an absence, and a whole block of screen spent on the fact that there is
        no news. The masthead says it once, in the place the eye starts, and the fortnight
        total that was in the card's footer belongs to Upcoming, which is a tap away and
        exists for exactly that.
      */}
      {live && (
        <NeedsList
          needs={needs.shown}
          hidden={needs.hidden}
          due={due}
          soon={soon}
          free={onHand.free}
        />
      )}

      {/*
        Today and Goals are both facts about right now, not about the month in the
        heading — so on any other month they simply are not here, and the two panels
        that survive still make an even row.
      */}
      {live && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            className="flex h-full flex-col"
            bodyClassName="flex flex-1 flex-col"
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
              <>
              <div>
                {tasks.slice(0, TODAY_SHOWN).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0"
                  >
                    <TaskCheckbox id={t.id} done={t.status === "done"} />
                    <span className="flex-1 truncate text-[13.5px] text-ink">{t.title}</span>
                    {/*
                      The date, only when it is not today's.

                      Every row in a panel headed "Today" printed a full `2026-08-27`, which
                      is eleven characters saying either "today" — which the heading already
                      said — or "this is late", which is the only case worth a word. Five of
                      them down the card were five long numerals carrying, between them, one
                      fact. Now the late ones say how late, and the rest say nothing.
                    */}
                    {t.due_at?.slice(0, 10) &&
                      t.due_at.slice(0, 10) < today && (
                        <span className="text-[11.5px] font-semibold text-spend">
                          {whenPhrase(daysUntil(today, t.due_at.slice(0, 10)))}
                        </span>
                      )}
                  </div>
                ))}
              </div>
              <MoreRow
                className="mt-auto"
                count={tasks.length - TODAY_SHOWN}
                href="/private/tasks"
                noun="task"
              />
              </>
            )}
          </Panel>
          <Panel
            className="flex h-full flex-col"
            bodyClassName="flex flex-1 flex-col"
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
              <>
              <div className="space-y-3 px-4 py-3.5">
                {goals.slice(0, GOALS_SHOWN).map((g) => {
                  const target = Number(g.target_rsd);
                  const pct = target > 0 ? Math.min(g.progress / target, 1) : 0;
                  /*
                    A goal at zero is not a measurement, it is an untouched goal.

                    Four rows reading `0 / 150k` with four empty bars is the case the
                    "never show the user a zero" rule is actually about: nothing was ever
                    moved, so there is no quantity to report, and an empty progress bar
                    under it reads as a component that failed to load. The em dash says
                    the same truth without pretending to have measured it, and the bar
                    simply is not drawn until there is something to draw.
                  */
                  const untouched = g.progress === 0;
                  return (
                    <div key={g.id}>
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className={`truncate font-semibold ${untouched ? "text-muted" : "text-ink"}`}>
                          {g.name}
                        </span>
                        <span className="mono text-muted">
                          {untouched ? (
                            /*
                              The dash carries its own explanation now. It used to be a sentence under
                              the list, on screen every visit whether or not any goal was untouched — a
                              permanent line spent on a mark that is understood in a second.
                            */
                            <span
                              className="zv-tip text-faint"
                              data-tip={
                                g.paying
                                  ? "Nothing has been paid against this goal yet"
                                  : "Nothing has been moved into this goal yet"
                              }
                              tabIndex={0}
                              role="img"
                              aria-label={
                                g.paying
                                  ? "Nothing has been paid against this goal yet"
                                  : "Nothing has been moved into this goal yet"
                              }
                            >
                              —
                            </span>
                          ) : (
                            fmtShort(g.progress)
                          )}
                          {target > 0 ? ` / ${fmtShort(target)}` : ""}
                        </span>
                      </div>
                      {/*
                        One colour for every bar, and it is the colour the app already uses
                        for money a goal is holding.

                        These were painted with each goal's own saved colour — a decoration
                        chosen once on the goal form, drawn nowhere else that matters. On a
                        list of five bars that is the loudest signal on the panel spent on
                        the one thing here that means nothing: orange beside green beside
                        grey reads as behind, on track, done, and it is none of those. It is
                        which swatch was open when the goal was made.

                        A bar's colour has to say something or say nothing. This one says
                        what the bar is made of, which is the same thing on every row.
                      */}
                      {!untouched && (
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-white/6">
                          <div
                            className="h-full rounded-pill"
                            style={{ width: `${pct * 100}%`, background: "var(--color-held)" }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <MoreRow className="mt-auto" count={goals.length - GOALS_SHOWN} href="/private/goals" noun="goal" />
              </>
            )}
          </Panel>
        </div>
      )}

      {/*
        Where now ends and the month begins.

        Everything above this line is true this afternoon and has no month in it.
        Everything below is a report on whichever month the picker names, and the picker
        lives here, on the rule, rather than at the top of a screen it only governs half
        of. Walk back to July and the blocks under this rule become July; the balance and
        the things that need you simply are not on the page, because "what needs you in
        July" is not a question.
      */}
      {live && (
        <div className="month-rule">
          <h2 className="month-rule-title">{monthLabel(month)}</h2>
          {/*
            No `Day 29/31` here. The numeral in the masthead already says which day of the
            month it is, in letters four times the size, and a screen that counts the same
            day twice in two places is a screen asking you to check whether they agree.
            The rule is a boundary and a heading; the arrows beside it say the rest.
          */}
          <div className="money-month-nav">
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
          </div>
        </div>
      )}

      {/*
        One column, then two, then three.

        It began at two and stayed there until 1024px, which does two things badly on a
        phone: `145.983 RSD` at 24px has about 170px to live in and does not fit, and
        the third card sits alone beside a gap because three does not divide by two.

        The last card spanning the row in the two-column band fixes the orphan without a
        fourth figure invented to fill it. Net is the right one to widen — it is the
        conclusion the other two are the working for.
      */}
      <div className="money-card-grid grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 [&>*:last-child]:min-[520px]:col-span-2 [&>*:last-child]:lg:col-span-1">
        {/*
          A zero that is a fact, told as one.

          Income really is nothing this month, so it prints `0` — hiding a measured
          zero in an app about money is the one thing this screen must never do. What
          it was missing is the half-sentence that separates "you earned nothing" from
          "this is broken", which is the only reason a zero ever looks like a bug.
        */}
        <Kpi
          className="money-card-premium"
          label="Income"
          value={fmt(summary.income)}
          hint={
            summary.income === 0
              ? month === current
                ? "Nothing logged yet this month"
                : "None logged that month"
              : undefined
          }
        />
        {/*
          `On accounts` used to be the third card and it is gone, because the hero now
          owns the balance question completely — available, total and reserved are all
          said up there, in the one place that answers "how much do I have".

          What took its seat is the figure the screen was actually missing. Spend was
          nowhere on the page as a number: it had been pulled from the cards as
          redundant with the masthead, and then pulled from the masthead too when that
          became the month numeral. You could only infer it from a negative net.

          So the three cards are now one thing — the month's flow. In, out, and what
          those two leave. The hero is position, these are movement.
        */}
        <Kpi
          className="money-card-premium"
          label="Spent"
          value={fmt(summary.expense)}
          delta={{
            pct: delta === null ? null : delta * 100,
            label: delta === null ? `No ${prevName} to compare` : `vs ${prevName}`,
            riseIsGood: false,
          }}
        />
        <NetKpi
          className="money-card-premium"
          net={summary.net}
          income={summary.income}
          saved={summary.saved}
          incomeOnFile={incomeOnFile}
        />
      </div>

      {/* What a finished month has to say for itself. See `biggest` and `cameFrom`. */}
      {!live && (biggest.length > 0 || cameFrom.length > 0) && (
        <div className="past-month">
          {biggest.length > 0 && (
            <Panel title="The biggest of them">
              <div className="past-list">
                {biggest.map((tx) => (
                  <Link
                    key={tx.id}
                    href={`/private/money?month=${month}&edit=${tx.id}`}
                    className="past-row"
                  >
                    <span className="mono past-row-on">{String(tx.occurred_on).slice(5)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="past-row-name">
                        {tx.title ?? tx.category?.name ?? "—"}
                      </span>
                      {tx.category?.name && tx.title && (
                        <span className="past-row-cat">{tx.category.name}</span>
                      )}
                    </span>
                    <span className="mono past-row-amount">{fmt(Number(tx.amount_rsd) || 0)}</span>
                  </Link>
                ))}
              </div>
              <Link href={`/private/money?month=${month}`} className="zv-more">
                <span>Every entry that month</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Panel>
          )}

          {cameFrom.length > 0 && (
            <Panel title="Where it came from">
              <div className="past-list">
                {cameFrom.map((row) => (
                  <div key={row.name} className="past-row is-static">
                    <span className="min-w-0 flex-1">
                      <span className="past-row-name">{row.name}</span>
                    </span>
                    <span className="mono past-row-amount text-ok">{fmt(row.total)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/*
        The claim on the figures above.

        This began as a clause on the hero note — "66.200 due in 7 days" — on the
        principle that a figure needing a caveat should not keep the caveat somewhere
        else. The clause was the weakest way of honouring it: it could say how much and
        never what, so it read as a warning you could not act on.

        Its first home as a card was directly under the hero, which honoured the letter
        of that principle and broke something better. The hero and the three cards under
        it are one statement read top to bottom — where you stand, then how the month
        moved — and a list wedged into the middle of it split a pair that was composed.
        Distance from the headline costs less than that.

        So it sits at the head of the band of things that want dealing with, above "Due
        now", which is what it is: the same kind of list, one step earlier in time.
      */}
      {/*
        The verdict, directly under the three figures it is drawn from.

        It only appears once there is a limit to judge against — with nothing budgeted
        there is no plan to be off, and the "Where it went" panel below already offers
        to set the first one. Silence is the honest state there, not encouragement.
      */}
      {/*
        Only when there is drift to report.

        This line used to fall back to "Every limit is on pace." on a clear day, which is
        the same news the masthead already gives in the first sentence on the screen —
        "Nothing needs you" is precisely "no limit is over and none is drifting". Two
        reassurances a screen apart do not reassure twice; they make the reader check
        whether they are talking about the same thing.

        Silence is the honest calm state here. A line that only ever appears when
        something is drifting is a line that is read the day it appears.
      */}
      {live && remedy && !needs.all.some((n) => n.tone === "over") && (
        <p className="money-verdict is-warn">
          {remedy.room > 0 ? (
            <>
              <b>{remedy.category}</b> is {fmtShort(remedy.gap)} past its pace —{" "}
              <Link href="/private/budgets">{fmtShort(remedy.perWeek)} a week</Link> for
              the rest of the month keeps it inside.
            </>
          ) : (
            <>
              <b>{remedy.category}</b> has spent its whole limit, and there{" "}
              {daysLeft === 1 ? "is 1 day" : `are ${daysLeft} days`} of the month left.
            </>
          )}
        </p>
      )}

      {/*
        The budgets themselves, under the three figures they are the plan for.

        Above "Where it went" on purpose: the breakdown says where the money went, and a
        budget says where it was allowed to go. The second question is the one you set
        yourself, so it is read first, and the breakdown below explains whatever answer
        it gives.
      */}
      {live && <BudgetsStrip lines={plans} today={today} />}

      {/*
        Where the month went, and where it was capped — one panel.

        These were two. A "Budgets" panel drew limit bars for the handful of categories
        that have one; this one split the whole month by category. Different instruments
        and defensible on paper — but they were built from the same query, and because
        people cap what they spend most on, the two printed the same five category names
        at two places on one screen. Two panels naming the same things is a screen that
        has to be read twice to learn one thing.

        So the split is the panel, and the limit is a property of a row in it. A capped
        category carries a bar; an uncapped one carries none, and that absence is the
        honest way to say no limit was ever set — it is also where the eye goes when you
        decide to set one.

        Full width, because it is now the only category readout on the page and the
        stacked band is the one element here that is better for being wide.
      */}
      <Panel title="Where it went">
        {summary.expense === 0 ? (
          <EmptyState
            icon={Wallet}
            title={live ? "Nothing spent this month" : "Nothing spent that month"}
            description="The split appears here as soon as there is something to split."
          />
        ) : (
          <div className="px-4 py-4">
            {/*
              The whole month as one band, before any of it is named. Composition is a
              different question from progress, and it gets a different shape — three
              panels of near-identical bars is how a screen starts looking generated.
            */}
            {/*
              The one place on the page where colour still has to vary.

              These segments carry no names, so their colour is their only identity —
              and unlike every row below, there is nowhere to write the word. So the
              same gold varies by rank instead of eight hues varying by category:
              biggest at full strength, weaker down the line, neutral for the tail. The
              legend under it repeats the same strengths, which is what ties the two
              together without needing a second colour system to remember.
            */}
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-pill bg-white/6">
              {topCats.map((slice, i) => (
                <span
                  key={slice.id}
                  style={{ width: `${share(slice.spent) * 100}%`, background: catTone(i) }}
                />
              ))}
              {otherSpend > 0 && (
                <span style={{ width: `${share(otherSpend) * 100}%`, background: CAT_REST }} />
              )}
            </div>

            {/*
              One line a category, and one thing said on it: how much of the month it
              was.

              This row carried a limit until now, and that made two budget systems on
              one screen. The Budgets card above draws a red bar for Groceries being
              1.237 over; this list drew a second red bar, full width, for the same
              1.237 — and neither of them could tell 6 percent over from 600 percent,
              because both fill to the end and stop. Two voices, one fact, and the
              louder of them in the panel whose name promises something else.

              So limits leave. "Where it went" answers where it went: the bar is this
              category's share of the month, in the same tone as its segment in the band
              above, so the row and the band are visibly the same measurement. Nothing
              in this panel is red, because nothing in it is a verdict.

              It also settles what a category counts as, which the cap made impossible.
              Eating out cost 14.737 in August and all of it is filed into the `na moru`
              trip: real spending on Eating out, and not one dinar of the monthly Eating
              out budget. As a share of the month that is one number and it is true; as
              a fraction of a cap it was two numbers that disagreed.

              The historical note below is kept because it is why the percentage column
              went, and the percentage has not come back — the bar draws it.
            */}
            {/*
              One line a category, and one denominator on it.

              The row used to print `4,7k / 20,0k` and then `55%` beside it — and those
              two are measured against different things. 4,7k of a 20,0k limit is 23%;
              the 55% was that category's share of the month. Side by side, with the
              limit ratio immediately to its left, it reads as the fill of the limit and
              is nearly always a different number. The bar underneath filled to 23% and
              quietly disagreed with the figure above it.

              So the share goes. The band at the top of this panel *is* the composition,
              drawn rather than numbered, and it was already saying it — the column was
              the same fact a second time, in a unit the rest of the row does not use.

              What is left is one statement: what this cost, against what it was allowed
              to cost. The bar moves into the row rather than under it, which halves the
              panel's height and fills the empty middle a full-width row otherwise leaves
              between a name and a number.
            */}
            <ul className="overview-cats mt-4">
              {topCats.map((slice, i) => {
                const part = share(slice.spent);
                return (
                  <li key={slice.id}>
                    {/*
                      A door, like its twin on Money — each row there filters the ledger
                      under it, and here it goes to the same entries.
                    */}
                    <Link
                      href={`/private/money?month=${month}&cat=${slice.id}`}
                      className="overview-cat"
                    >
                      <span
                        className="overview-cat-dot"
                        style={{ background: catTone(i) }}
                        aria-hidden
                      />
                      <span className="overview-cat-name">{slice.name}</span>

                      {/*
                        The amount and its share, and no third drawing of the same thing.

                        Every row used to carry a bar as well, which made this panel state
                        one month's composition three times over: once in the stacked band
                        at the top, once as six bars down the middle, once as six
                        percentages on the right. The band is the picture and it is free —
                        ten pixels, no column — so the middle one is the one that goes.
                        What is left is a legend: the dot ties the row to its segment, the
                        name says which, and the two figures say how much and how much of.
                      */}
                      <span className="mono overview-cat-amt">
                        {fmtShort(slice.spent)}
                        <i>{Math.round(part * 100)}%</i>
                      </span>
                    </Link>
                  </li>
                );
              })}
              {otherSpend > 0 && (
                <li>
                  <div className="overview-cat is-rest">
                    <span
                      className="overview-cat-dot"
                      style={{ background: CAT_REST }}
                      aria-hidden
                    />
                    <span className="overview-cat-name">Other</span>
                    <span className="mono overview-cat-amt">
                      {fmtShort(otherSpend)}
                      <i>{Math.round(share(otherSpend) * 100)}%</i>
                    </span>
                  </div>
                </li>
              )}
            </ul>

            {/*
              The Goals screen's best sentence, kept from the panel that used to own it.

              "Put a monthly cap on the categories that tend to run away" is advice —
              true, and impossible to act on without first working out which categories
              those are and what they cost. `getBudgetLines` already returns `typical`
              for every category, so the line can name one and its figure, which turns a
              suggestion into a decision you can make from here.
            */}
            {suggestion && (
              <p className="mt-4 border-t border-line-soft pt-3 text-[11.5px] text-muted">
                <b className="font-semibold text-ink">{suggestion.category.name}</b> has no
                limit —{" "}
                {/*
                  The median of the six completed months where there is one, and this
                  month's own figure where there is not. A brand-new category has no
                  normal month to quote, and inventing one would put a number in front
                  of somebody that no month ever cost.
                */}
                {suggestion.typical > 0
                  ? `about ${fmtShort(suggestion.typical)} in a normal month`
                  : `${fmtShort(suggestion.spent)} so far this month`}
                .{" "}
                <Link href="/private/budgets" className="font-semibold text-gold-hi">
                  Set one
                </Link>
              </p>
            )}
          </div>
        )}
      </Panel>

      {/*
        Where the month is heading, which is the one thing about it nothing else says.

        This row used to be the last six transactions beside a six-month bar chart. The
        ledger is one click away and has had search, filters and sorting since today, so
        six of its rows here were six rows of a list that exists in full elsewhere; and a
        chart of six monthly totals was the weakest of the three histories the app now
        keeps — budgets carry their own strip, categories carry a year with the entries
        under it.

        What replaces both is arithmetic rather than a forecast: what has gone, what is
        already dated before the month ends, and what those two come to. No extrapolation
        of everyday spending — that would be a guess wearing the same typeface as the
        facts beside it. The six bars stay as the context they always were, small.
      */}
      <Panel title={`How ${monthName} is going`}>
        <div className="px-4 py-4">
          {/*
            Three figures, and only while three of them exist.

            Gone plus coming makes the total, which is a sum worth drawing — but with
            nothing else dated the middle column was an em dash and the third was the
            first one printed again. `44.023 RSD · spent so far` beside `— · nothing else
            dated` beside `44.023 RSD · by the 31` is a panel doing arithmetic on zero in
            front of you, and the eye reads two identical figures as a duplicate before it
            reads them as an answer.

            So the working appears when there is working to show, and otherwise the one
            fact is said once. Same in both: the closing date is named rather than left as
            a bare numeral — `by the 31` is a fragment, `by August 31` is a date.
          */}
          {dueBeforeMonthEnd > 0 ? (
            <div className="month-ahead">
              <span>
                <b className="mono">{fmt(summary.expense)}</b>
                <i>spent so far</i>
              </span>
              <span>
                <b className="mono">{fmt(dueBeforeMonthEnd)}</b>
                <i>already dated before the end</i>
              </span>
              <span className="is-sum">
                <b className="mono">{fmt(summary.expense + dueBeforeMonthEnd)}</b>
                <i>
                  by {monthName} {monthDays}
                  {prevExpense > 0 && ` · ${prevName} finished at ${fmtShort(prevExpense)}`}
                </i>
              </span>
            </div>
          ) : (
            /*
              With nothing else dated there is no sum to show, and the figure that would
              head it — what has been spent — is the `Spent` card two blocks up, at twice
              the size. Printing it again here made this panel look like a fourth KPI and
              made the reader check whether the two agreed. What is actually new is the
              absence, so the absence is what it says, in a caption rather than a figure.
            */
            <p className="month-ahead-quiet">
              Nothing else is dated before {monthName} {monthDays}
              {prevExpense > 0 && ` · ${prevName} finished at ${fmtShort(prevExpense)}`}
            </p>
          )}

          {/*
            Six months at one scale, in six slots of one size.

            The bar used to be its whole column wide — a sixth of a full-width panel, so on
            a 1440px screen August was a gold rectangle 165 across and 63 tall, which is a
            block and not a bar, and the five months before it were a hairline each with a
            dash floating over them. That picture did not say "six comparable months". It
            said one thing had loaded and five had failed.

            The slot is the fix. Every month gets the same track drawn at full height, so a
            month with nothing in it reads as an empty month rather than a missing one, and
            the bar is capped narrow enough to be a measurement again. Only the month you
            are standing in is gold; the finished ones are all one weight, because ranking
            them would be a second story in a panel that has one.

            And the axis says Mar Apr May Jun Jul Aug rather than 03 04 05 06 07 08. The
            numerals were the cheapest thing to print and the slowest thing to read, on the
            one row of this panel whose whole job is to be read at a glance.
          */}
          {/*
            Each bar is the way into its month.

            Six months were drawn as a comparison and then left inert, which is the one
            thing a comparison must not be: you see that April was six times March, and the
            obvious next move — look at April — had to be made with the arrows in the
            masthead, one month at a time, past every month in between. It is the same
            `?month=` the arrows use, so nothing new is being invented, only reached.

            The month you are standing in is not a link. A control that reloads the page
            you are on is a control that answers "nothing happened", and the gold bar
            already says which month this is.
          */}
          <div className="month-bars">
            {trend.map((t, i) => {
              const here = t.month === month;
              const bar = (
                <>
                  <span className="mono month-bar-val">
                    {t.expense > 0 ? fmtShort(t.expense) : "—"}
                  </span>
                  <span className="month-bar-track">
                    <i
                      className="money-bar-in"
                      style={{
                        height: `${t.expense > 0 ? Math.max(6, (t.expense / peak) * 100) : 0}%`,
                        animationDelay: `${240 + i * 45}ms`,
                      }}
                    />
                  </span>
                  <span className="month-bar-key">{shortMonthLabel(t.month, month)}</span>
                </>
              );
              const className = `month-bar${here ? " is-now" : ""}${
                t.expense === 0 ? " is-empty" : ""
              }`;

              return here ? (
                <div key={t.month} className={className}>
                  {bar}
                </div>
              ) : (
                <Link
                  key={t.month}
                  href={`/private?month=${t.month}`}
                  className={`${className} is-link`}
                  aria-label={`Go to ${monthLabel(t.month)}`}
                >
                  {bar}
                </Link>
              );
            })}
          </div>
        </div>
      </Panel>
    </div>
  );
}




