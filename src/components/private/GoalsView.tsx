"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Plus } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { ListBar } from "@/components/ui/ListBar";

import { GoalIcon } from "@/components/icons/GoalIcon";
import type { OnHand } from "@/lib/data/money";
import type { AccountBalance } from "@/lib/data/money";
import type { GoalLine, MoneyCategory } from "@/lib/types";
import { GoalForm } from "./GoalForm";
import { ARCHIVE_HREF, GOALS_HREF, PanelMeta, caps } from "./goals/shared";
import { isOpen, read } from "./goals/reading";
import { GoalCard } from "./goals/GoalCard";
import { ClosedRow } from "./goals/ClosedRow";
import { Overall } from "./goals/Overall";
import { todayISO } from "@/lib/format";
import { useMoney } from "@/lib/money/currency";

export type GoalsPanel = { mode: "new" } | { mode: "edit"; goal: GoalLine } | null;

/**
 * Every state an open goal can be standing in, worst first.
 *
 * The first five are the badge the card already prints, word for word — `read` is what
 * puts that badge there, so a chip and the card under it cannot end up disagreeing. The
 * last three are the states a card deliberately shows *no* badge for: a goal too young to
 * judge, one with no date to be late for, one with no amount to be short of. Those are
 * the ones worth being able to ask for, because on a card they look like every other
 * quiet goal — which is how twenty-five of them accumulate without anyone noticing.
 */
const GOAL_STATES = [
  "Date passed",
  "Behind pace",
  "Due today",
  "On track",
  "Reached",
  "Paid off",
  "Just started",
  "No date",
  "No amount",
] as const;

type GoalState = (typeof GOAL_STATES)[number];

/** Nothing saved for yet — so the screen has to explain what a goal is for on its own. */
function NoGoals() {
  const steps = [
    "Name what the money is for, and set the amount you are aiming at — in dinars, euros or dollars.",
    "Put money aside against it — the money stays on the account, it just stops counting as free to spend.",
    "Give it a date and the goal tells you what each month has to look like to make it.",
    "Buy the thing, or change your mind: take the money back out, or close the goal and it lets go of what is left.",
  ];

  return (
    <Panel className="money-empty-panel">
      <EmptyState
        icon={GoalIcon}
        title="Nothing being saved for yet"
        description="A goal is a name, an amount and — if you know it — a date. A laptop, a deposit, three months of rent in reserve."
        action={
          <Link href={`${GOALS_HREF}?new=1`} className={buttonClasses("primary", "money-premium-button")}>
            New goal
          </Link>
        }
      />
      <div className="border-t border-line-soft px-5 py-4">
        <div className={caps}>How a goal works</div>
        <ol className="mt-2.5 space-y-2 text-[12.5px] text-muted">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-2.5">
              <span className="mono shrink-0 text-[11.5px] text-faint">{i + 1}</span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

export function GoalsView({
  goals,
  accounts,
  categories,
  onHand,
  panel,
  showArchived,
}: {
  goals: GoalLine[];
  accounts: AccountBalance[];
  categories: MoneyCategory[];
  onHand: OnHand;
  panel: GoalsPanel;
  showArchived: boolean;
}) {
  const router = useRouter();
  const { fmt } = useMoney();
  const close = () => router.push(GOALS_HREF);

  // Read the same way Setup reads today — UTC on both sides, so nothing disagrees.
  const today = todayISO();

  // Open is measured by completed_at alone, never by the archive flag: a goal still
  // holding money back has to stay visible, whatever else has been done to it.
  const open = goals.filter(isOpen);
  /*
    Two lists, because they are two objects that happen to share a card.

    A goal that collects holds money: it reserves part of an account, and the panel
    above it reconciles that claim against what is actually there. A goal that clears
    holds nothing — the money went when it was spent — so it has nothing to reconcile
    and no business inside a sum whose whole purpose is to say what is still free to
    spend. Mixed into one list they would read as one kind of thing and quietly make
    that sum wrong.
  */
  const saving = open.filter((g) => !g.paying);
  const paying = open.filter((g) => g.paying);
  const closed = goals.filter((g) => !isOpen(g) && !g.archived);
  const archived = goals.filter((g) => !isOpen(g) && g.archived);
  // The totals these three lines produced now live in `Overall`, which draws them once.

  /*
    Four orders, because they answer four different questions.

    "Mine" is the order you arranged: what matters most, first. "Closest" is the one
    that finishes goals — motivation climbs the nearer a target gets, and a list that
    buries the goal sitting at 92% behind three at 4% spends that climb on nothing. A
    goal with no target has nothing to be close to, so it sorts last either way.
    "Soonest" is the calendar's opinion rather than yours, and a goal with no date has
    nothing to say to it, so it also sorts last. "Largest" is the one question a screen
    of amounts always invites: which of these is the big one.
  */
  const [order, setOrder] = useState<"mine" | "closest" | "soonest" | "largest">("mine");

  /** Which state is being looked at on its own. Null — every open goal — is where it starts. */
  const [state, setState] = useState<GoalState | null>(null);

  /*
    One open card, held here rather than in each card.

    A boolean inside every card would let you open ten and be back where we started —
    a page of stacked forms. The identity of the open one lives with the list, so
    opening a second closes the first, the way a set of accordions is supposed to work.
  */
  const [openId, setOpenId] = useState<string | null>(null);

  /*
    The card that is on its way out.

    A disclosure that animates open and then vanishes on close is worse than one that
    never animated at all — the two directions disagree, and the eye reads the close
    as a glitch. Playing the exit means the form has to stay mounted while it plays,
    so a second piece of state holds the id of whichever card is currently closing.

    The timer is started in the click handler rather than in an effect. An effect
    would be reacting to a change it already caused, and this codebase lints against
    setting state from effects for exactly that reason. A click is a moment; this is
    the moment.
  */
  const [closingId, setClosingId] = useState<string | null>(null);
  const CLOSE_MS = 260;

  const retire = (id: string) => {
    setClosingId(id);
    setTimeout(() => setClosingId((current) => (current === id ? null : current)), CLOSE_MS);
  };

  const toggle = (id: string) => {
    if (openId === id) {
      setOpenId(null);
      retire(id);
      return;
    }
    // Opening a second card closes the first, and the first still gets its exit.
    if (openId) retire(openId);
    setOpenId(id);
  };

  /*
    And a page size, because there was none.

    Every open goal was rendered, always. Thirty-eight goals is fifteen screens of
    scrolling before the closed ones even start, and the tail of that list is goals
    the owner has already decided are less important — the ordering above says so.
  */
  const PAGE = 10;
  const [shown, setShown] = useState(PAGE);
  // No useMemo: the compiler handles this, and hand-written memoization here only
  // stopped it from optimising the component at all.
  const share = (g: GoalLine) => {
    const target = Math.max(Number(g.target_rsd) || 0, 0);
    return target > 0 ? Math.min(g.progress / target, 1) : -1;
  };

  /*
    Where a goal stands, by the same reading that prints its badge.

    The three states with no badge are the point of this: a goal with no date and a goal
    on track look identical at a glance, and only one of them is finished being set up.
  */
  const stateOf = (goal: GoalLine): GoalState => {
    const badge = read(goal, today, fmt).badge;
    if (badge) return badge.label as GoalState;
    if ((Number(goal.target_rsd) || 0) <= 0) return "No amount";
    return goal.target_date ? "Just started" : "No date";
  };

  /*
    A census, and that is what makes a filter safe on a page like this.

    Unpressed the row is not a set of doors, it is one line counting every open goal by
    state — which on thirty goals is the fact the page could not previously say at all.
    Pressing one narrows; `All` sits first and always comes back; nothing is remembered
    between visits, so the page can never open already hiding something.
  */
  // No useMemo, for the reason written over the page size below: the compiler optimises
  // this component, and a hand-written memo here is the one thing that stops it.
  const counted = new Map<GoalState, number>();
  for (const goal of saving) {
    const key = stateOf(goal);
    counted.set(key, (counted.get(key) ?? 0) + 1);
  }
  const census = GOAL_STATES.filter((key) => (counted.get(key) ?? 0) > 0).map(
    (key) => [key, counted.get(key) ?? 0] as const,
  );

  // A state can stop existing under you — put the last dinar into the only goal that was
  // behind and its chip goes with it. Falling back to every goal beats a page of nothing.
  const active = census.some(([key]) => key === state) ? state : null;

  const kept = active ? saving.filter((g) => stateOf(g) === active) : saving;

  const byDate = (a: GoalLine, b: GoalLine) => {
    if (!a.target_date !== !b.target_date) return a.target_date ? -1 : 1;
    if (!a.target_date || !b.target_date) return 0;
    return a.target_date < b.target_date ? -1 : a.target_date > b.target_date ? 1 : 0;
  };
  const ordered =
    order === "mine"
      ? kept
      : order === "soonest"
        ? [...kept].sort(byDate)
        : order === "largest"
          ? [...kept].sort((a, b) => (Number(b.target_rsd) || 0) - (Number(a.target_rsd) || 0))
          : [...kept].sort((a, b) => share(b) - share(a));
  // Only goals with an amount to reach can be short of one; the rest are just counting.
  const leftToPay = paying.reduce(
    (sum, g) => sum + Math.max((Number(g.target_rsd) || 0) - g.progress, 0),
    0,
  );


  return (
    <div className="money-premium money-goals mx-auto max-w-300 space-y-5">
      <div className="money-page-head goals-page-head flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="money-page-kicker">Private wealth</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            Goals
          </h1>
          {/*
            The subtitle says what the screen holds, not why goals are nice.

            "Turn something you want into a plan you can reach. Create a goal and make
            every contribution count." is landing-page copy: aspirational, true of any
            savings feature ever built, and worth reading exactly once. On a screen you
            open weekly it is two lines of furniture above the thing you came for.

            What replaces it is the only sentence this page can write that no other page
            can: money here is reserved, not moved. That is the single fact people get
            wrong about goals, and the one worth spending a subtitle on.
          */}
          <p className="mt-1 max-w-md text-[13px] leading-5 text-muted">
            Money put aside stays on the account — it just stops counting as free to
            spend.
          </p>
        </div>
        {/*
          The four-figure strip that used to sit here is gone.

          It said Active, Saved, Target and Reached — and two hundred pixels below it
          the `Overall` panel said the same four numbers again, in sentences, plus the
          one thing the strip could not: the equation that turns a balance into what
          is actually free to spend. Two readouts of one fact is not redundancy the eye
          forgives; it is the screen sounding unsure which one you should believe.
        */}
        <div className="goals-head-side">
          <Link href={`${GOALS_HREF}?new=1`} className={buttonClasses("primary", "money-premium-button shrink-0")}>
            <Plus className="h-4 w-4" />
            New goal
          </Link>
        </div>
      </div>

      {goals.length === 0 ? (
        <NoGoals />
      ) : (
        <>
          {saving.length > 0 && <Overall goals={saving} onHand={onHand} />}

          {/*
            The same bar as everywhere else. This was two tabs with icons — a third
            vocabulary for "reorder this" on a page that already had two elsewhere.
          */}
          {saving.length > 1 && (
            <ListBar
              all={{ count: saving.length }}
              tags={census.map(([key, count]) => ({ key, label: key, count }))}
              tag={active}
              onTag={(key) => setState(key as GoalState | null)}
              orders={[
                ["mine", "My order"],
                ["closest", "Closest"],
                ["soonest", "Soonest"],
                ["largest", "Largest"],
              ]}
              order={order}
              onOrder={(key) => setOrder(key as typeof order)}
            />
          )}

          {/*
            A grid, top-aligned.

            Two independent stacks were tried and reverted. They do solve the gap —
            only the open card's own column moves — but they only *look* like a grid
            while every card is the same height, and the cards are not: one carries an
            extra line for a target set in euros, another has no target date, a third
            has no target at all. One extra line at the top of a stack shifts
            everything under it, so within a screen or two the two columns are visibly
            out of step. Alignment is what a grid is for, and giving it up to avoid one
            gap was the wrong trade.

            Top-aligned, and this is where five attempts landed.

            Five designs were built for the empty half a stretched card leaves: a bare
            emblem, an emblem on a radial wash, an emblem in a progress dial, an emblem
            in a seal, and the seal reproportioned. Every one was rejected on sight, and
            the last three were built after it was already clear why. Writing it down so
            the sixth does not get built:

            The space cannot be furnished because there is nothing true to put in it. A
            goal at zero knows four things and all four are already printed above. Any
            graphic placed there is therefore decoration standing in for content, and it
            reads as such however well it is drawn — as a spinner, a badge, a button, a
            watermark that wandered. The drawing was never the problem.

            So the space goes. The long way round to that:

            Stretching keeps a square bottom line across the row, at the cost of leaving
            the shorter card with a large empty area inside it. Three separate designs
            were built to make that area look deliberate — a plain emblem, an emblem on
            a radial wash, and an emblem inside a progress dial — and all three were
            rejected on sight. That is not three unlucky attempts; it is the same answer
            three times. A big graphic standing in a void is decoration standing in for
            content, and it reads as such no matter how well it is drawn.

            So the void goes instead of being furnished. A card is only ever as tall as
            what is in it, and the space beside a taller neighbour is page. Empty page
            between cards is architecture — every card grid with variable content looks
            like that. Empty space inside a card is a card that failed to load, because
            a card is an object that claims to be full.

            This is cheap to reverse — remove `items-start` — but do not reach for the
            emblem again without a new idea. That one is spent.
          */}
          {/*
            Wider between the rows than between the columns, deliberately.

            Two cards side by side are one row of the same thing and want to read as a
            pair; two cards stacked are separate items and want a beat between them.
            Equal gaps in both directions make a wall of cards read as a mesh — the eye
            has no reason to group left-with-right rather than top-with-bottom.
          */}
          <div className="money-card-grid grid items-start gap-x-3 gap-y-5 sm:grid-cols-2">
            {ordered.slice(0, shown).map((goal, i) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                accounts={accounts}
                /*
                  Every open goal, never the narrowed list. This is where money can be
                  moved to, and a filter is a way of looking at the page — it must not
                  quietly remove somewhere the money was allowed to go.
                */
                siblings={saving.filter((g) => g.id !== goal.id)}
                today={today}
                first={i === 0}
                last={i === ordered.length - 1}
                /*
                  And no dragging while narrowed. The arrows move a goal past the one
                  above it in *your* order; with eight of thirty on screen the one above
                  it is not the one you can see, so the card would move somewhere else
                  than where you aimed it.
                */
                reorderable={order === "mine" && !active && ordered.length > 1}
                expanded={openId === goal.id}
                closing={closingId === goal.id}
                onToggle={() => toggle(goal.id)}
              />
            ))}
          </div>

          {ordered.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="goal-archive-link flex w-full items-center justify-center gap-1.5 rounded-card border border-line bg-surface px-4 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
            >
              Show {Math.min(PAGE, ordered.length - shown)} more of {ordered.length}
            </button>
          )}

          {/*
            The second kind, under its own heading rather than mixed into the grid.

            They share a card because they answer the same question — how far along is
            this — and they are separated here because they answer it about different
            money. Above this line the figures are claims on an account; below it they
            are money that has already gone. One heading is cheaper than teaching every
            card to explain which it is.
          */}
          {paying.length > 0 && (
            <section className="goals-group">
              <div className="goals-group-head">
                <h2 className="goals-group-title">Paying off</h2>
                <PanelMeta>
                  {paying.length} {paying.length === 1 ? "goal" : "goals"}
                  {leftToPay > 0 && ` · ${fmt(leftToPay)} left`}
                </PanelMeta>
              </div>
              <p className="goals-group-note">
                This money has already left the account — these count what has gone, not
                what is being held back.
              </p>
              <div className="money-card-grid grid items-start gap-x-3 gap-y-5 sm:grid-cols-2">
                {paying.map((goal, i) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    accounts={accounts}
                    siblings={[]}
                    today={today}
                    first={i === 0}
                    last={i === paying.length - 1}
                    reorderable={order === "mine" && paying.length > 1}
                    expanded={openId === goal.id}
                    closing={closingId === goal.id}
                    onToggle={() => toggle(goal.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {open.length === 0 && (
            <Panel className="goal-secondary-panel">
              <EmptyState
                icon={GoalIcon}
                title="Nothing being saved for right now"
                description="Every goal has been closed. Start another one, or reopen one below."
                action={
                  <Link href={`${GOALS_HREF}?new=1`} className={buttonClasses("primary", "money-premium-button")}>
                    New goal
                  </Link>
                }
              />
            </Panel>
          )}

          {closed.length > 0 && (
            <Panel
              className="goal-secondary-panel"
              title="Closed"
              action={
                <PanelMeta>
                  {closed.length} {closed.length === 1 ? "goal" : "goals"} · holding nothing back
                </PanelMeta>
              }
            >
              {closed.map((goal) => (
                <ClosedRow key={goal.id} goal={goal} />
              ))}
            </Panel>
          )}

          {archived.length > 0 &&
            (showArchived ? (
              <Panel
                className="goal-secondary-panel"
                title="Archived"
                action={
                  <Link href={GOALS_HREF} className="text-[12px] font-semibold text-gold-hi">
                    Hide
                  </Link>
                }
              >
                {archived.map((goal) => (
                  <ClosedRow key={goal.id} goal={goal} />
                ))}
              </Panel>
            ) : (
              <Link
                href={ARCHIVE_HREF}
                className="goal-archive-link flex items-center justify-center gap-1.5 rounded-card border border-line bg-surface px-4 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
              >
                <Archive className="h-3.5 w-3.5" />
                Show {archived.length} archived {archived.length === 1 ? "goal" : "goals"}
              </Link>
            ))}
        </>
      )}

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.mode === "edit" ? "Edit goal" : "New goal"}
      >
        <GoalForm
          goal={panel?.mode === "edit" ? panel.goal : undefined}
          accounts={accounts}
          categories={categories}
          onDone={close}
        />
      </SlideOver>
    </div>
  );
}



