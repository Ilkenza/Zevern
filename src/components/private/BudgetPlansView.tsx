"use client";

"use client";

import { loadBudgetEntries } from "@/app/(app)/private/actions";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListBar } from "@/components/ui/ListBar";
import { SlideOver } from "@/components/ui/SlideOver";
import type { BudgetEntry,BudgetPast } from "@/lib/data/money";
import { useMoney } from "@/lib/money/currency";
import { fold } from "@/lib/money/entry-search";
import type {
BudgetPlanLine,
MoneyAccount,
MoneyBudgetBoost,
MoneyCategory,
} from "@/lib/types";
import { Plus,Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback,useMemo,useRef,useState } from "react";
import { BudgetCard } from "./budgets/BudgetCard";
import { BudgetPlanForm } from "./budgets/BudgetPlanForm";
import { STATE_LABEL,STATE_ORDER,type BudgetState } from "./budgets/card-bits";
import { HistoryPanel } from "./budgets/HistoryPanel";
import {
readPlan
} from "./budgets/plan-reading";

export function BudgetPlansView({
  lines,
  categories,
  accounts,
  boosts,
  histories,
  today,
  openNew,
}: {
  lines: BudgetPlanLine[];
  categories: MoneyCategory[];
  accounts: MoneyAccount[];
  /** Every grant on the profile, so the form can show what a trip already raises. */
  boosts: MoneyBudgetBoost[];
  /** The windows behind the current one, per budget. Empty for anything with fixed dates. */
  histories: Record<string, BudgetPast[]>;
  /** Read on the server, so the client cannot disagree about which period is current. */
  today: string;
  /**
   * The address says to open the new-budget form — `?new=1`, from the quick-add menu.
   *
   * Read on every render rather than seeded into state once, because the second press of
   * that menu item lands on the same component with the same state: an initial value
   * would open the form the first time and do nothing ever after.
   */
  openNew?: boolean;
}) {
  const { fmt } = useMoney();
  const router = useRouter();

  /*
    The entries behind a figure, fetched when the panel opens rather than carried down
    with every card. Eleven budgets' worth of ledger would ride to the browser on every
    page load for a list almost nobody opens, and this way it is always a fresh read.
  */
  const [entries, setEntries] = useState<BudgetEntry[] | null>(null);

  /** How the cards are ordered. */
  const [view, setView] = useState<"need" | "date" | "name" | "big">("need");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  /** Which state is being looked at on its own. Null — every budget — is where it starts. */
  const [state, setState] = useState<BudgetState | null>(null);

  /** Four questions the page cannot answer on its own. `Need` is its own opinion. */
  const ORDERS = [
    { value: "need", label: "What needs you first", reverse: "Quietest first" },
    { value: "date", label: "Ending soonest", reverse: "Ending last" },
    { value: "name", label: "Name A–Z", reverse: "Name Z–A" },
    { value: "big", label: "Largest first", reverse: "Smallest first" },
  ];

  /** Twenty-four budgets is past the point where you find one by looking. */
  const [q, setQ] = useState("");

  const [panel, setPanel] = useState<
    | { mode: "new" }
    | { mode: "edit"; line: BudgetPlanLine }
    | { mode: "history"; line: BudgetPlanLine }
    | null
  >(null);

  /*
    The address opens the form too, and wins while it says so.

    Everything else on this screen opens a panel by being clicked, so the panel is state.
    The quick-add menu arrives from another screen entirely and has only the address to
    say what it wants, so `?new=1` is read here on every render and the close puts the
    address back — which is also what makes pressing that menu item twice work.
  */
  const shown = openNew ? ({ mode: "new" } as const) : panel;

  /*
    Two groups, not four, and no caption under either.

    The page used to split by clock as well as direction — Spending, Spending with an end
    date, Saving, Saving with an end date — with a sentence under each explaining what a
    budget of that shape was for. The reason given in this file was that the difference
    was not visible in the cards. It is now: a dated budget prints its two dates and no
    rhythm, a repeating one prints `every month` and no dates, and a savings budget says
    `toward` where a spending one says `of`. Four headings and four sentences were being
    spent restating what every card already said, on a screen whose whole complaint was
    that there was too much to read.
  */

  /*
    What needs you, first.

    Eleven cards in the order they happened to be created is a list you have to read all
    of to find the two that matter — here, Eating out at 98% sitting fourth and a month
    28.000 in the red sitting tenth. So the order is: the ones with something wrong, then
    the ones running quietly, then what has not started, then what is over.

    Only the first tier moves, and it moves for a stated reason the card repeats in words.
    Inside a tier the key is what ends soonest, which is a date rather than a measurement
    — so the page does not quietly rearrange itself every time a coffee is entered.
  */
  /*
    Opened by the click, not by an effect watching what the click changed.

    An effect would have to reset the list on every open and clear it on close, which is
    state chasing state — and the ref is what keeps a slow read for one budget from
    landing in a panel that has since been opened on another.
  */
  const wanted = useRef<string | null>(null);
  /** Which budget's window read is already under way, so a click does not start a second. */
  const primed = useRef<string | null>(null);
  /*
    `useCallback` here is not an optimisation and should not be removed as one.

    This handler closes over a ref, and the grid helper below hands it to every card
    during render. Left as a plain function the compiler cannot prove the ref is only
    ever touched from an event, and `react-hooks/refs` fails the build — correctly, since
    reading `.current` while rendering is how a component quietly stops updating. An
    empty dependency list says out loud what is true: nothing in here is rendered from.
  */
  /*
    One loader, because the panel can now ask for a different span than the one it opened
    with. `wanted` still guards the answer: open one budget, change the span, close it and
    open another, and the slower of the two reads must not land in the newer panel.
  */
  const readEntries = useCallback((planId: string, span?: { from: string; to: string }) => {
    wanted.current = planId;
    // Only a plain window read counts as primed; a span read answers a different
    // question and must not be mistaken for the one the panel opens with.
    primed.current = span ? null : planId;
    setEntries(null);
    loadBudgetEntries(planId, span).then((rows) => {
      if (wanted.current === planId) setEntries(rows);
    });
  }, []);

  /*
    Start reading on the press, not on the click.

    The panel's two halves arrive at different speeds and always will: the periods
    underneath are already in hand, the entries are a round trip. So the panel opened
    with its bottom finished and its top still coming — which reads as half a panel
    however good the skeleton is.

    Carrying every budget's entries down with the page was rejected for good reason —
    eleven budgets' worth of ledger for a list almost nobody opens. But a pointer going
    down on this one card is as much warning as anyone needs, and it buys the hundred
    or two hundred milliseconds between press and release. Often that is the whole wait.
  */
  const primeEntries = useCallback(
    (planId: string) => {
      if (primed.current === planId) return;
      readEntries(planId);
    },
    [readEntries],
  );

  const openEntries = useCallback(
    (line: BudgetPlanLine) => {
      setPanel({ mode: "history", line });
      if (primed.current !== line.plan.id) readEntries(line.plan.id);
    },
    [readEntries],
  );

  const urgency = (line: BudgetPlanLine) => {
    if (line.window.ended) return 3;
    const { status } = readPlan(line, today, fmt);
    if (status === "over" || status === "unset") return 0;
    if (line.plan.kind === "savings" && line.used < 0) return 0;
    if (status === "ahead" || status === "behind") return 1;
    if (today < line.window.from) return 2.5;
    return 2;
  };

  const byNeed = (a: BudgetPlanLine, b: BudgetPlanLine) =>
    urgency(a) - urgency(b) ||
    (a.window.to < b.window.to ? -1 : a.window.to > b.window.to ? 1 : 0) ||
    a.plan.name.localeCompare(b.plan.name);

  /*
    Inside a direction, the clock still splits — but with a rule, not a second heading.

    Merging the two shapes into one grid was a step too far: a monthly ceiling and a ten
    day holiday are read with different questions ("how is this month going" against "how
    much of this thing is left"), and mixed into one grid you have to read each card's
    dates to know which question you are holding. The four headings and four sentences
    that used to say so cost 39 words; a labelled hairline costs four and takes one line.

    Need still leads inside each block, so the card with something wrong is the first one
    under its own rule rather than buried in the middle of it.
  */
  /*
    Two orders the page cannot arrive at on its own.

    `Need` is the page's own opinion and stays the default. `Name` is for when you know
    which budget you want and are hunting for it among eleven — the one job an opinionated
    order actively makes harder. `Largest` is the other question a screen of figures
    invites: not which is in trouble, but which is carrying the weight.
  */
  const byName = (a: BudgetPlanLine, b: BudgetPlanLine) =>
    a.plan.name.localeCompare(b.plan.name);
  const byWeight = (a: BudgetPlanLine, b: BudgetPlanLine) =>
    Math.abs(b.used) - Math.abs(a.used) || byName(a, b);
  const byDate = (a: BudgetPlanLine, b: BudgetPlanLine) =>
    (a.window.to < b.window.to ? -1 : a.window.to > b.window.to ? 1 : 0) || byName(a, b);

  const chosen =
    view === "date" ? byDate : view === "name" ? byName : view === "big" ? byWeight : byNeed;

  /*
    The same order, read from the other end.

    Swapping the two arguments rather than reversing the sorted array, because those are
    not the same thing: `reverse()` also turns ties around, so two budgets that tie on
    figure would swap places for no reason the screen can explain. Negating the
    comparison keeps every tie-break intact — and it is the only version that behaves
    under `Need`, where the grouping stays and each block sorts on its own.
  */
  const order = dir === "asc" ? chosen : (a: BudgetPlanLine, b: BudgetPlanLine) => chosen(b, a);

  /*
    The state each budget is standing in, by the same reading the card prints.

    Not a second opinion computed for the filter: `readPlan` is the function behind the
    word on the card and the colour of its bar, so a card can never sit under a chip that
    disagrees with the word on the card.
  */
  const stateOf = (line: BudgetPlanLine): BudgetState =>
    line.window.ended ? "finished" : readPlan(line, today, fmt).status;

  /*
    A census, which is the reason the filter is allowed back.

    There was a filter here for an afternoon and I took it out, because a chip that hid
    the budgets not asking for anything turned "am I all right" into "am I all right among
    the ones I remembered to look at" — and being the place every budget is, is this
    page's whole job.

    Carrying its count is what settles that. Unpressed, the row is not a set of doors, it
    is one line saying `Over 1 · Spending fast 1 · On track 8 · No amount 1` — the whole
    page counted, before anything is hidden. That is strictly more than the page said
    before. Pressing one narrows; `All` sits first and always comes back; nothing is
    remembered between visits, so the page can never open already hiding something.
  */
  const census = useMemo(() => {
    const seen = new Map<BudgetState, number>();
    for (const line of lines) {
      const key = line.window.ended ? "finished" : readPlan(line, today, fmt).status;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return STATE_ORDER.filter((key) => (seen.get(key) ?? 0) > 0).map(
      (key) => [key, STATE_LABEL[key], seen.get(key) ?? 0] as const,
    );
  }, [lines, today, fmt]);

  // Whether a control is worth drawing is `ListBar`'s rule now, not this file's: two
  // states for a filter, two orders for an order. One place to state it, one to change it.

  // A state can stop existing under you — delete the only budget that was over and the
  // chip goes with it. Falling back to every budget beats a page that shows none.
  const active = census.some(([key]) => key === state) ? state : null;

  const term = fold(q.trim());
  const keep = (l: BudgetPlanLine) =>
    (!active || stateOf(l) === active) && (!term || fold(l.plan.name).includes(term));
  const shownCount = lines.filter(keep).length;

  const split = (kind: string) => {
    const mine = lines.filter((l) => l.plan.kind === kind && keep(l));
    return {
      repeating: mine.filter((l) => l.plan.period !== "custom").sort(order),
      dated: mine.filter((l) => l.plan.period === "custom").sort(order),
    };
  };

  const groups = [
    { key: "spending", title: "Spending", ...split("expense") },
    { key: "saving", title: "Saving", ...split("savings") },
  ].filter((group) => group.repeating.length + group.dated.length > 0);

  /*
    One list, for the three orders that asked a question about the whole page.

    The grouping above is `Need`'s opinion — spending apart from saving, a rhythm apart
    from a stretch with an end — and it is the right shape for scanning, because those
    two are read with different questions in mind.

    It is the wrong shape the moment you press `Name`, `Ending` or `Largest`, and this is
    the fault that made the sort look broken. Sorting inside four blocks restarts the
    order three times down the page: A-to-Z ran `… Shopping`, then began again at
    `limit for spending`; `Largest` left the biggest figure on the screen — a month
    28.123 in the red — second from last, under its own heading. Pressing `Largest` and
    not getting the largest first is indistinguishable from a broken sort, and it was not
    far off one.

    Asking for an order is overriding the grouping, so the grouping goes. Nothing is lost
    with it: a savings card already says `toward` where a spending one says `of`, and a
    dated one prints its two dates where a repeating one prints its rhythm — which is the
    same argument that took this page from four headings to two.
  */
  const flat = lines.filter(keep).sort(order);

  const grid = (rows: BudgetPlanLine[]) => (
    <div className="grid gap-2.5 md:grid-cols-2">
      {rows.map((line) => (
        <BudgetCard
          key={line.plan.id}
          line={line}
          past={histories[line.plan.id] ?? []}
          today={today}
          onEdit={() => setPanel({ mode: "edit", line })}
          onHistory={() => openEntries(line)}
          onPrime={() => primeEntries(line.plan.id)}
        />
      ))}
    </div>
  );

  return (
    <div className="pb-10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
            Budgets
          </h1>
          <p className="text-[12.5px] text-muted">
            Each one keeps its own clock, so they do not all have to be months.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPanel({ mode: "new" })}
          className={buttonClasses("primary", "shrink-0")}
        >
          <Plus className="h-4 w-4" /> New budget
        </button>
      </div>

      {lines.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No budgets yet"
          description="A budget can be a month of groceries, a fortnight of eating out, or one holiday with an end date. Start with the one you would actually check."
        />
      ) : (
        <div className="space-y-5">
          {/*
            The bar every list in here uses, in the same words and the same order:
            what to show on the left, what order to show it in on the right.
          */}
          {lines.length >= 2 && (
            <ListBar
              query={q}
              onQuery={setQ}
              searchLabel="Search budgets…"
              filters={[
                {
                  value: active ?? "",
                  onChange: (v) => setState((v || null) as BudgetState | null),
                  label: "Filter by state",
                  all: `All ${lines.length}`,
                  // The count rides in the label: the breakdown a chip row showed at rest
                  // is one click away here rather than nought, and nothing else was lost.
                  options: census.map(([key, label, count]) => ({
                    value: key,
                    label: `${label} (${count})`,
                  })),
                },
              ]}
              sort={{
                value: view,
                onChange: (v) => setView(v as typeof view),
                label: "Order the budgets",
                options: ORDERS,
                direction: dir,
                onDirection: setDir,
              }}
              shown={shownCount}
              total={lines.length}
              onClear={() => {
                setQ("");
                setState(null);
                setDir("asc");
              }}
            />
          )}

          {view !== "need"
            ? grid(flat)
            : groups.map((group) => (
                <section key={group.key}>
                  <h2 className="money-page-kicker mb-2">{group.title}</h2>
                  {group.repeating.length > 0 && grid(group.repeating)}
                  {group.dated.length > 0 && (
                    <>
                      {/* Four words and a rule, where four headings and four sentences were. */}
                      <div className="zv-split">
                        <span>With an end date</span>
                      </div>
                      {grid(group.dated)}
                    </>
                  )}
                </section>
              ))}
        </div>
      )}

      <SlideOver
        open={shown !== null}
        onClose={() => {
          // Forget the priming with the panel: reopening a budget after adding an entry
          // has to read again, not hand back what was true a minute ago.
          primed.current = null;
          setPanel(null);
          if (openNew) router.replace("/private/budgets");
        }}
        title={
          shown?.mode === "history"
            ? shown.line.plan.name
            : shown?.mode === "edit"
              ? "Edit budget"
              : "New budget"
        }
      >
        {shown?.mode === "history" && (
          <HistoryPanel
            key={shown.line.plan.id}
            line={shown.line}
            entries={entries}
            past={histories[shown.line.plan.id] ?? []}
            today={today}
            onSpan={(span) => readEntries(shown.line.plan.id, span)}
          />
        )}

        {shown && shown.mode !== "history" && (
          <BudgetPlanForm
            plan={shown.mode === "edit" ? shown.line.plan : undefined}
            categoryIds={shown.mode === "edit" ? shown.line.categoryIds : []}
            accountIds={shown.mode === "edit" ? shown.line.accountIds : []}
            categories={categories}
            accounts={accounts}
            /*
              Only the repeating budgets can be raised, and never this one. A holiday
              raising a holiday means nothing, and a budget raising itself is a loop the
              database refuses anyway — offering either would be offering a mistake.
            */
            raisable={lines
              .filter(
                (l) =>
                  l.plan.period !== "custom" &&
                  l.plan.id !== (shown.mode === "edit" ? shown.line.plan.id : ""),
              )
              .map((l) => ({ id: l.plan.id, name: l.plan.name, baseRsd: l.baseRsd }))}
            boosts={
              shown.mode === "edit"
                ? boosts.filter((b) => b.source_budget_id === shown.line.plan.id)
                : []
            }
            /*
              The other end of the same list: dated budgets that can raise this one, and
              the raises already pointed at it. A repeating budget is edited from the card
              that goes red, which is where anybody notices the limit needs to be bigger
              for one month rather than for all twelve.
            */
            raisers={lines
              .filter(
                (l) =>
                  l.plan.period === "custom" &&
                  l.plan.ends_on &&
                  l.plan.id !== (shown.mode === "edit" ? shown.line.plan.id : ""),
              )
              .map((l) => ({ id: l.plan.id, name: l.plan.name, baseRsd: l.baseRsd }))}
            raisedBy={
              shown.mode === "edit"
                ? boosts.filter((b) => b.target_budget_id === shown.line.plan.id)
                : []
            }
            onSaved={() => setPanel(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}

