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
  getDueSoon,
  getExpenseTrend,
  hasIncomeOnFile,
  getGoalLines,
  getMonthSummary,
  getOnHand,
  getAccountBalances,
  getTransactions,
  getUnpricedTransactions,
  getLoans,
  loanTotals,
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
import { DueSoonPanel } from "@/components/private/DueSoonPanel";
import { MoreRow } from "@/components/ui/MoreRow";
import { CAT_REST, catTone } from "@/lib/money/tone";
import { remedyFor } from "@/components/private/budgets/status";
import { UnpricedPanel } from "@/components/private/UnpricedPanel";
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
  A card should end where its content ends.

  These sit in two-column rows, and a grid stretches its items to the tallest in the
  row — so a Goals card with four goals beside a Today card with a dozen tasks grew a
  band of nothing under its last row, inside its own border. Dead space inside a card
  reads as something that failed to load; the same space outside it reads as two cards
  of different lengths, which is what they are. Hence `items-start` on both rows.

  Five rather than four while we are here. The two panels beside each other now show
  the same number of things, which is the other half of why that row looked lopsided.
*/
const TODAY_SHOWN = 5;
const CATS_SHOWN = 5;
const GOALS_SHOWN = 5;

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
  const [summary, lines, recent, trend, incomeOnFile, allGoals, due, tasks, onHand, accounts, unpriced, soon, loans] =
    await Promise.all([
      getMonthSummary(month),
      getBudgetLines(month),
      getTransactions({ month, limit: 6 }),
      getExpenseTrend(6),
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
    ]);

  const { owedToYou, youOwe } = loanTotals(loans);
  // `select('*')` lets an older remote schema keep serving the page while migration
  // 0044 is waiting to be applied. Until the column arrives, preserve the old compact
  // behaviour with the first two accounts; once it exists, null explicitly means hide.
  const hasOverviewPreference = accounts.some(
    (account) => typeof account.overview_rank === "number" || account.overview_rank === null,
  );
  const overviewAccounts = hasOverviewPreference
    ? accounts
        .filter((account) => typeof account.overview_rank === "number")
        .sort((a, b) => (a.overview_rank ?? 0) - (b.overview_rank ?? 0))
    : accounts.slice(0, 2);

  const pace = monthProgress(month);
  const budgeted = lines.filter((l) => l.limit > 0);

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
  const savedOn = (g: (typeof allGoals)[number]) => g.saved;
  const progressOf = (g: (typeof allGoals)[number]) => {
    const target = Number(g.target_rsd) || 0;
    return target > 0 ? g.saved / target : 0;
  };
  const goals = allGoals.filter(isGoalOpen).sort((a, b) => {
    const started = Number(savedOn(b) > 0) - Number(savedOn(a) > 0);
    return started || progressOf(b) - progressOf(a) || savedOn(b) - savedOn(a);
  });
  const peak = Math.max(1, ...trend.map((t) => t.expense));

  // What this page knows that no card below it repeats: how this month compares with
  // the last one, and what is still sitting unbooked.
  const prevKey = shiftMonth(month, -1);
  const prevName = monthLabel(prevKey).split(" ")[0];
  const prevExpense = trend.find((t) => t.month === prevKey)?.expense ?? 0;
  const delta = prevExpense > 0 ? (summary.expense - prevExpense) / prevExpense : null;
  const waiting = due.length;

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

  /*
    The five biggest, plus anything that has broken its limit.

    Ordered by spend, because the question this panel answers first is "where did it
    go". But a small category blown to three times its cap is the one line on the page
    somebody needs to see, and by size it sits ninth — so it is pulled in rather than
    cut. That is the whole reason the cut is not a plain `slice`: a limit that is only
    reported when the category happens to be large is a limit that is not reported.
  */
  const over = spentCats.filter((l) => l.limit > 0 && l.spent > l.limit);
  const topCats = [
    ...spentCats.slice(0, CATS_SHOWN),
    ...over.filter((l) => !spentCats.slice(0, CATS_SHOWN).includes(l)),
  ].slice(0, CATS_SHOWN + 2);
  const uncategorizedSpend =
    summary.byCategory.find((category) => category.id === UNCATEGORIZED_CATEGORY_ID)?.spent ?? 0;
  const otherSpend = Math.max(
    summary.expense - uncategorizedSpend - topCats.reduce((a, l) => a + l.spent, 0),
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
  const suggestion = [...topCats]
    .filter((l) => l.limit === 0 && summary.expense > 0 && l.spent / summary.expense >= SUGGEST_SHARE)
    .sort((a, b) => b.spent - a.spent)[0];

  // Where the month itself stands. The cards below say what was spent and what is
  // left; nothing on the page says how much of the month those numbers cover — and a
  // figure without its share of the month is half a sentence.
  const monthDays = Number(monthRange(month).to.slice(8));
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
      <header className="masthead">
        <div className="masthead-say">
          <span className={`masthead-kicker${month === current ? " is-live" : ""}`}>
            <i aria-hidden />
            {phase}
          </span>

          <h1 className="masthead-title">
            <span className="rv">
              <span className="rv-i">{monthLabel(month)}</span>
            </span>
          </h1>

          {/*
            Only what this page knows, and one of it is a door.

            A screen that tells you something is waiting and then makes you find it in
            the sidebar has done half a job. When there is something to book, that
            fact is the link to the place you book it; when there is nothing, it is
            plain text, because a link to an empty screen is a trap.
          */}
          <p className="masthead-blurb">
            {/*
              The month-on-month comparison used to live here as a sentence. It sits on
              the `Spent` card now, as an arrow and a percentage against the figure it
              actually describes — which is where a delta belongs. Saying it in prose up
              here as well would be the same fact in two voices.
            */}
            {/*
              This said "3 items waiting to book" under a July heading too, which is
              the same fault as the blocks below: nothing is waiting to book *in July*,
              it is waiting now. A month that has not started gets the one sentence that
              is true of it, and a door to the screen where its contents actually live.
            */}
            {live ? (
              waiting > 0 ? (
                <Link href="/private/upcoming" className="is-up is-door">
                  {waiting} {waiting === 1 ? "payment needs" : "payments need"} your review
                </Link>
              ) : (
                <span>All payments are up to date</span>
              )
            ) : month > current ? (
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
            {month !== current && (
              <Link href="/private" className="money-month-back">
                <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />
                This month
              </Link>
            )}
          </div>
        </div>

        {/*
          The number, carrying a fact.

          "08" was ornament: it said nothing that "August" did not. "08/12" says which
          month *and* how much of the year is behind you — which is on no other screen
          in the app, and is the only honest reason a number gets to be this size.

          Quick add is gone from here. It sits in the topbar on every screen, so a
          second one thirty centimetres away was the page repeating an app-level
          control — the same duplication as New.
        */}
        <span className="masthead-num" aria-label={`Month ${month.slice(5, 7)} of 12`}>
          {month.slice(5, 7)}
          <i aria-hidden>/12</i>
        </span>
      </header>

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
        <div className={`money-hero-figure${onHand.free < 0 ? " is-short" : ""}`}>
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
          {youOwe > 0 && (
            <Link href="/private/money" className="is-owed">
              {fmt(youOwe)} still to repay
            </Link>
          )}
          {owedToYou > 0 && (
            <Link href="/private/money">{fmt(owedToYou)} owed to you</Link>
          )}
        </p>
        </div>

          <div
            className={`onhand-accounts money-hero-accounts${overviewAccounts.length === 0 ? " is-empty" : ""}`}
          >
            {overviewAccounts.map((account) => (
              <div key={account.id} className="onhand-account">
                <span className="onhand-account-name">
                  {account.name} ({account.currency})
                </span>
                <span className="mono onhand-account-value">{fmt(account.balance)}</span>
                {account.reserved > 0 && (
                  <span className="onhand-account-note">
                    {fmt(account.free)} available · {fmt(account.reserved)} set aside
                  </span>
                )}
              </div>
            ))}
            <Link href="/private/setup#setup-accounts" className="onhand-manage">
              Manage accounts <ChevronRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
      </section>
      )}


      {/* No "Spent this month" card: the masthead is that figure, and printing it
          twice on one screen is how a page stops looking composed. */}
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
      {live && budgeted.length > 0 && (
        <p className={`money-verdict${remedy ? " is-warn" : ""}`}>
          {remedy ? (
            remedy.room > 0 ? (
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
            )
          ) : (
            <>Every limit is on pace.</>
          )}
        </p>
      )}

      {live && <DueSoonPanel soon={soon} free={onHand.free} />}

      {live && <DueRecurringPanel due={due} />}

      {/*
        Under "Due now", because they are the same kind of thing: a short list of
        entries only you can finish, and both are gone from the screen the moment you
        have. A purchase with no price yet is half an entry — this is where the other
        half gets typed.
      */}
      {live && <UnpricedPanel entries={unpriced} />}

      {/*
        Today and Goals are both facts about right now, not about the month in the
        heading — so on any other month they simply are not here, and the two panels
        that survive still make an even row.
      */}
      {live && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
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
              <>
              <div>
                {tasks.slice(0, TODAY_SHOWN).map((t) => (
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
              <MoreRow
                count={tasks.length - TODAY_SHOWN}
                href="/private/tasks"
                noun="task"
              />
              </>
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
              <>
              <div className="space-y-3 px-4 py-3.5">
                {goals.slice(0, GOALS_SHOWN).map((g) => {
                  const target = Number(g.target_rsd);
                  const pct = target > 0 ? Math.min(g.saved / target, 1) : 0;
                  /*
                    A goal at zero is not a measurement, it is an untouched goal.

                    Four rows reading `0 / 150k` with four empty bars is the case the
                    "never show the user a zero" rule is actually about: nothing was ever
                    moved, so there is no quantity to report, and an empty progress bar
                    under it reads as a component that failed to load. The em dash says
                    the same truth without pretending to have measured it, and the bar
                    simply is not drawn until there is something to draw.
                  */
                  const untouched = g.saved === 0;
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
                              data-tip="Nothing has been moved into this goal yet"
                              tabIndex={0}
                              role="img"
                              aria-label="Nothing has been moved into this goal yet"
                            >
                              —
                            </span>
                          ) : (
                            fmtShort(g.saved)
                          )}
                          {target > 0 ? ` / ${fmtShort(target)}` : ""}
                        </span>
                      </div>
                      {!untouched && (
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-white/6">
                          <div
                            className="h-full rounded-pill"
                            style={{ width: `${pct * 100}%`, background: g.color ?? "var(--color-muted)" }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <MoreRow count={goals.length - GOALS_SHOWN} href="/private/goals" noun="goal" />
              </>
            )}
          </Panel>
        </div>
      )}

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
      <Panel
        title="Where it went"
        action={
          <Link href="/private/budgets" className="text-[12px] font-semibold text-gold-hi">
            Set limits
          </Link>
        }
      >
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
              {topCats.map((l, i) => (
                <span
                  key={l.category.id}
                  style={{ width: `${share(l.spent) * 100}%`, background: catTone(i) }}
                />
              ))}
              {uncategorizedSpend > 0 && (
                <span
                  style={{
                    width: `${share(uncategorizedSpend) * 100}%`,
                    background: "var(--color-muted)",
                  }}
                />
              )}
              {otherSpend > 0 && (
                <span style={{ width: `${share(otherSpend) * 100}%`, background: CAT_REST }} />
              )}
            </div>

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
              {topCats.map((l, i) => {
                const capped = l.limit > 0;
                const used = capped ? Math.min(l.spent / l.limit, 1) : 0;
                const isOver = capped && l.spent > l.limit;
                return (
                  <li key={l.category.id}>
                    {/*
                      A door, like its twin on Money — each row there filters the ledger
                      under it, and here it goes to the same entries.
                    */}
                    <Link
                      href={`/private/money?month=${month}&cat=${l.category.id}`}
                      className="overview-cat"
                    >
                      <span
                        className="overview-cat-dot"
                        style={{ background: catTone(i) }}
                        aria-hidden
                      />
                      <span className="overview-cat-name">{l.category.name}</span>

                      {/*
                        The bar means the cap: how much of what this category was allowed
                        to cost has gone. Its colour is the row's own, the same as the
                        dot; red is the one state that takes a colour of its own, because
                        red is not in the ramp and cannot be mistaken for a rank.

                        Without a cap it says so, in words, and offers nothing. That is
                        the correction: plenty of categories cannot sensibly have a limit
                        at all — a domain renews for what it renews for, a utility bill
                        is whatever the meter says — so a "Set a limit" control on every
                        uncapped row was the screen treating a fact as an unfinished
                        task. Five buttons asking you to fix five things that are not
                        broken.

                        Words, then. A label never reads as a bar that failed to render,
                        which is what the blank cell and the dashed ghost before it did,
                        and it makes no demand. The single offer that remains is under
                        the list, and only when it is worth making.
                      */}
                      {capped ? (
                        <span className="overview-cat-track" aria-hidden>
                          <span
                            style={{
                              width: `${used * 100}%`,
                              background: isOver ? "var(--color-danger)" : catTone(i),
                            }}
                          />
                        </span>
                      ) : (
                        <span className="overview-cat-note">no limit</span>
                      )}

                      <span className={`mono overview-cat-amt${isOver ? " is-over" : ""}`}>
                        {fmtShort(l.spent)}
                        {capped && <i>/ {fmtShort(l.limit)}</i>}
                      </span>
                    </Link>
                  </li>
                );
              })}
              {uncategorizedSpend > 0 && (
                <li>
                  <Link
                    href={`/private/money?month=${month}&cat=${UNCATEGORIZED_CATEGORY_ID}`}
                    className="overview-cat is-rest"
                  >
                    <span
                      className="overview-cat-dot"
                      style={{ background: "var(--color-muted)" }}
                      aria-hidden
                    />
                    <span className="overview-cat-name">Uncategorized</span>
                    <span className="overview-cat-note">needs category</span>
                    <span className="mono overview-cat-amt">{fmtShort(uncategorizedSpend)}</span>
                  </Link>
                </li>
              )}
              {otherSpend > 0 && (
                <li>
                  <div className="overview-cat is-rest">
                    <span
                      className="overview-cat-dot"
                      style={{ background: CAT_REST }}
                      aria-hidden
                    />
                    <span className="overview-cat-name">Other</span>
                    {/*
                      Nothing in the middle, and nothing said about it. The row is
                      already marked as the tail — grey dot, muted name, last in the
                      list — so a caption explaining that was the screen telling you
                      what you could already see. The cell stays so the columns keep
                      lining up.
                    */}
                    <span className="overview-cat-note" aria-hidden />
                    <span className="mono overview-cat-amt">{fmtShort(otherSpend)}</span>
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

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel
          title="Recent transactions"
          action={
            <Link href="/private/money" className="text-[12px] font-semibold text-gold-hi">
              See all
            </Link>
          }
        >
          {recent.length === 0 ? (
            /*
              The invitation only makes sense on the month you are living in. Quick add
              writes today's date, so offering it under a July heading is offering to
              file a July entry that will land in August.
            */
            <EmptyState
              icon={Wallet}
              title={live ? "Nothing logged yet" : "Nothing logged that month"}
              description={
                live
                  ? "Log it the moment you spend it — that is the whole habit."
                  : "No entries were recorded for this month."
              }
              action={
                live ? (
                  <Link href="/private/quick" className={buttonClasses("primary")}>
                    Add the first one
                  </Link>
                ) : undefined
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
                    /* Rhythm, not identity — see `@/lib/money/tone`. */
                    style={{ background: "var(--color-faint)" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {t.title ?? t.category?.name ?? t.goal?.name ?? t.note ?? "—"}
                  </span>
                  {/*
                    A deposit into a goal was getting the same minus sign as a purchase,
                    so five rows of saving read as five rows of spending. Money into a
                    goal goes in, money out of one comes back, and neither is a minus.
                  */}
                  {/*
                    An entry logged without a price has no figure to show, and showing
                    `0` would be a lie the row cannot take back. It says so instead, in
                    the quietest tone on the screen — it is not an error, it is an entry
                    that is not finished.
                  */}
                  {t.amount_rsd === null ? (
                    <span className="text-[11.5px] font-semibold text-faint">no price</span>
                  ) : (
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
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Spending · last 6 months">
        <div className="flex items-end gap-3 px-4 py-4">
          {/*
            The same zero rule as the goals, for the same reason.

            A month with no rows and a month where you genuinely spent nothing come
            back from the query as the identical `0`, so printing `0` claims a
            measurement the data cannot support. Five columns of `0` over five empty
            bars also read as a chart that failed rather than a history that is short.
            The dash says "nothing recorded", which is the honest version.
          */}
          {trend.map((t, i) => (
            <div key={t.month} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="mono text-[10.5px] text-faint">
                {t.expense > 0 ? fmtShort(t.expense) : "—"}
              </span>
              <div
                className={`money-bar-in w-full rounded-t-[4px] ${
                  t.expense === 0
                    ? "bg-white/5"
                    : t.month === month
                      ? "bg-gold"
                      : "bg-white/12"
                }`}
                /*
                  Grown rather than printed, the same way the breakdown above it draws
                  its fills. Six columns arriving at once is the one part of this page
                  that still just appeared — and the eye reads a chart that lands whole
                  as an image, while one that rises reads as a measurement.

                  45ms apart, matching `breakdown-row`, so the two charts on this screen
                  are visibly the same object moving.
                */
                style={{
                  height: `${Math.max(4, (t.expense / peak) * 90)}px`,
                  animationDelay: `${240 + i * 45}ms`,
                }}
              />
              <span className="text-[10.5px] text-muted">{t.month.slice(5)}</span>
            </div>
          ))}
        </div>
        </Panel>
      </div>
    </div>
  );
}
