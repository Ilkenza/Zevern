"use client";

/**
 * Everything behind one budget: this period's entries, and how every period before it
 * went. Lifted out of the screen that opens it.
 */

"use client";

import { ListBar } from "@/components/ui/ListBar";
import { Skeleton } from "@/components/ui/Skeleton";
import type { BudgetEntry,BudgetPast } from "@/lib/data/money";
import { useMoney } from "@/lib/money/currency";
import { RANGE_OPTIONS,rangeFor,type RangeKey } from "@/lib/money/date-range";
import { fold } from "@/lib/money/entry-search";
import type {
BudgetPlanLine
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMemo,useState } from "react";
import {
readPlan,
shortDate,
windowLabel
} from "./plan-reading";
import {
MISSED_LABEL,
Meter,
periodReading,
readingOf
} from "./card-bits";

/**
 * One budget, opened.
 *
 * It leads with the same instrument the card leads with — the figure, the limit, the line
 * of time — because you arrived here from that picture and the panel that answers for it
 * should be anchored by it. Under that, what is actually in the figure. Under that, the
 * windows behind this one, and only once there are any: a "history" of the single period
 * you are standing in is the same numbers a third time.
 */
export function HistoryPanel({
  line,
  entries,
  past,
  today,
  scope,
  onSpan,
}: {
  line: BudgetPlanLine;
  /** Null while the read is in flight — an empty list means the window really is empty. */
  entries: BudgetEntry[] | null;
  /** Ask for a different span. Undefined means the budget's own window again. */
  onSpan: (span?: { from: string; to: string }) => void;
  past: BudgetPast[];
  today: string;
  /**
   * What this budget watches, when the name does not say it.
   *
   * The panel is where the question gets asked out loud — you open it because a row in
   * here surprised you. A sweeping budget named after one category listed entries from
   * every other one and gave no reason anywhere on the screen; this is the reason,
   * printed above the list rather than left to be deduced from it.
   */
  scope: string | null;
}) {
  const { fmt } = useMoney();
  const reading = readPlan(line, today, fmt);
  const { bad, fill } = readingOf(line, reading);

  const [sort, setSort] = useState<"new" | "big" | "cat">("new");
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [dateKey, setDateKey] = useState("");
  const [picked, setPicked] = useState({ from: "", to: "" });

  /*
    The same spans as everywhere else, plus the one only this panel has.

    An earlier version offered a short list built out of the budget's own window, on the
    reasoning that the panel only held that window and `Last 6 months` would be a second
    name for it. That reasoning was sound and the conclusion was backwards: the fix is to
    let the panel read six months, not to hide the question. So the reader takes a span
    now, and this asks the server rather than filtering what it already has.

    `This period` leads and is the default, because it is what the panel is *for* — the
    budget's own clock, whatever length that is. Everything under it is the app's list,
    in the app's words, minus `This month`, which for a fortnightly budget would be a
    span nothing on this screen is measured against.
  */
  const dateOptions = [
    { value: "", label: "This period" },
    ...RANGE_OPTIONS.filter((o) => o.value !== "month"),
  ];

  const askFor = (key: string, dates = picked) => {
    setDateKey(key);
    if (key === "custom") {
      // Nothing is asked until at least one end is set — an empty pair is not a request.
      onSpan(dates.from || dates.to ? dates : undefined);
      return;
    }
    onSpan(key ? rangeFor(key as RangeKey, today) : undefined);
  };

  /*
    The things a row is already tagged with, offered as the way to narrow it.

    Not an invented filter vocabulary: every chip here is a word printed on the rows
    below, so what a chip will do is visible before it is pressed. Categories first,
    because that is what a sweeping budget is made of, then the budgets an entry was filed
    into by hand — which is the row-level answer to "14.737 covered by na moru".
  */
  const tags = useMemo(() => {
    if (!entries) return [] as string[];
    const weight = new Map<string, number>();
    const rows = new Map<string, number>();
    const kept = new Set<string>();
    for (const e of entries) {
      for (const t of [e.category, e.filedInto]) {
        if (!t) continue;
        weight.set(t, (weight.get(t) ?? 0) + Math.abs(e.amount));
        rows.set(t, (rows.get(t) ?? 0) + 1);
      }
      // A budget an entry was filed into is always worth offering: it is the row-level
      // answer to the card's "covered by" note even when it covers a single line.
      if (e.filedInto) kept.add(e.filedInto);
    }
    return [...weight.keys()]
      .filter((t) => kept.has(t) || (rows.get(t) ?? 0) > 1)
      .sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0));
  }, [entries]);

  /*
    The order is always there. The filters are not.

    Sorting had a threshold too — four rows, on the reasoning that below it you can see the
    order anyway. That reasoning is about the list; it is not about the person, who opens
    two budgets, finds the control in neither, and concludes the app does not sort. A
    control worth having is one you can point at without checking whether today's data
    earned it, and one row of two words is a cheap price for never having to look for it.

    Filters keep their rule, because theirs is not about crowding: with a single tag the
    only filter on offer keeps every row. That is not a redundant control, it is a button
    that does nothing dressed as a choice.
  */
  const canFilter = tags.length >= 2;

  /*
    Grouping is only an order worth having where there is more than one group.

    It is also the only one of the three that changes the shape of the answer rather than
    the sequence: `Newest` and `Largest` reorder the same list, while this turns it into
    the categories the budget is actually made of. On a budget that sweeps one category it
    would produce the list it already had.
  */
  const canGroup = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entries ?? []) if (e.category) seen.add(e.category);
    return seen.size >= 2;
  }, [entries]);

  const shown = useMemo(() => {
    if (!entries) return null;
    /*
      Search over what the row prints, not over the row.

      The name, the category and the budget it was filed into are the three things on
      screen, so they are the three things a search has to match — anything else and you
      would be typing a word you can see and getting nothing back.
    */
    const term = fold(q.trim());
    const kept = entries.filter(
      (e) =>
        (!canFilter || !tag || e.category === tag || e.filedInto === tag) &&
        (!term ||
          fold(`${e.title ?? ""} ${e.category ?? ""} ${e.filedInto ?? ""}`).includes(term)),
    );

    if (sort === "big") {
      return [...kept].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    }

    if (sort === "cat" && canGroup) {
      /*
        Groups by what they cost, not alphabetically — the question this order answers is
        "where did it go", and an A-to-Z list of categories answers it in whatever order
        the alphabet happens to agree with. Inside a group, the largest first for the same
        reason. Anything with no category at all sits at the end: it is not a group.
      */
      const weight = new Map<string, number>();
      for (const e of kept) {
        if (!e.category) continue;
        weight.set(e.category, (weight.get(e.category) ?? 0) + Math.abs(e.amount));
      }
      return [...kept].sort((a, b) => {
        if (!a.category !== !b.category) return a.category ? -1 : 1;
        if (a.category !== b.category) {
          return (
            (weight.get(b.category ?? "") ?? 0) - (weight.get(a.category ?? "") ?? 0) ||
            (a.category ?? "").localeCompare(b.category ?? "")
          );
        }
        return Math.abs(b.amount) - Math.abs(a.amount);
      });
    }

    return kept;
  }, [entries, tag, q, sort, canFilter, canGroup]);

  /*
    The same order, from the other end.

    Reversed rather than sorted backwards because one of the three is not a comparison:
    `Newest` is the order the ledger handed back, and there is nothing to negate. On the
    other two the answer is the same either way.
  */
  const ordered = useMemo(
    () => (shown && dir === "desc" ? [...shown].reverse() : shown),
    [shown, dir],
  );

  /*
    Both ends of each, because the bar asks for the order in one select.

    `cat` groups by what a category cost rather than by its name, so its other end is the
    small ones first — "Category Z–A" would be a label for a sort this list does not do.
  */
  const orders: { value: typeof sort; label: string; reverse: string }[] = [
    { value: "new", label: "Newest", reverse: "Oldest" },
    { value: "big", label: "Largest", reverse: "Smallest" },
    ...(canGroup
      ? [
          {
            value: "cat" as typeof sort,
            label: "Biggest categories",
            reverse: "Smallest categories",
          },
        ]
      : []),
  ];

  const finished = [...past].filter((p) => !p.current).reverse();
  const over = finished.filter((p) => periodReading(line.plan.kind, p).missed).length;
  const typical = finished.length
    ? finished.reduce((sum, p) => sum + p.used, 0) / finished.length
    : 0;

  /*
    The bar is built here, not inside the branch that draws the list.

    A span is read from the ledger, so asking for one can come back with nothing — and
    while the bar lived inside the "there are entries" branch, that answer took the span
    picker away with it. You were left in a window you had chosen, looking at an empty
    panel, with nothing on screen that could widen it again.
  */
  const toolbar = (
    <ListBar
      inPanel
      flush
      query={q}
      onQuery={setQ}
      searchLabel="Search these entries…"
      dateRange={{
        value: dateKey,
        onChange: askFor,
        options: dateOptions,
        from: picked.from,
        to: picked.to,
        onFrom: (v) => {
          const next = { ...picked, from: v };
          setPicked(next);
          askFor("custom", next);
        },
        onTo: (v) => {
          const next = { ...picked, to: v };
          setPicked(next);
          askFor("custom", next);
        },
        maxDate: today,
      }}
      filters={[
        {
          value: tag ?? "",
          onChange: (v) => setTag(v || null),
          label: "Filter by category",
          all: `All ${entries?.length ?? 0}`,
          options: canFilter ? tags.map((t) => ({ value: t, label: t })) : [],
        },
      ]}
      sort={{
        value: sort,
        onChange: (v) => setSort(v as typeof sort),
        label: "Order the entries",
        options: orders,
        direction: dir,
        onDirection: setDir,
      }}
      shown={ordered?.length ?? 0}
      total={entries?.length ?? 0}
      onClear={() => {
        setQ("");
        setTag(null);
        setDir("asc");
        setPicked({ from: "", to: "" });
        askFor("", { from: "", to: "" });
      }}
    />
  );

  return (
    <div>
      <div className={cn("zv-sheet", bad && "is-bad")}>
        <p className="zv-sheet-sum">
          {fmt(line.used).replace(/\s*RSD$/, "")}
          <i>
            {line.plan.kind === "savings" ? "toward" : "of"} {fmt(line.limitRsd)}
          </i>
        </p>
        <Meter line={line} fill={fill} pace={reading.pace} today={today} />
        <p className="zv-sheet-note">
          {reading.note}
          {scope && (
            <i className="zv-sheet-scope">
              {/*
                `watches added only` is not a sentence. A hand-kept budget holds what you
                put in it, and that is the honest reading of the same fact the card puts
                in a pill.
              */}
              {line.plan.membership === "added"
                ? "only what you file into it"
                : `watches ${scope}`}
            </i>
          )}
        </p>
      </div>

      {entries === null ? (
        /*
          The shape first, the rows when they arrive.

          This was one line reading "Reading the ledger…", and the read is a round trip
          — so the top half of the panel was a sentence while the bottom half, which is
          already in hand, was a full history. It read as though only half the panel had
          opened. A skeleton of the list that is coming says the same thing without
          leaving a hole where the list will be.
        */
        <div aria-busy="true" aria-label="Reading the ledger">
          <p className="zv-entries-sum">
            <Skeleton w="66px" h={12} />
            <Skeleton w="74px" h={14} />
          </p>

          {/*
            The toolbar's own footprint, not just the rows'.

            Skeleton rows alone still let the bar drop in above them when the read lands,
            which shoves the whole list down ninety pixels — the jolt this is here to
            prevent, arriving from the one part that was not drawn.
          */}
          <div className="zv-toolbar is-in-panel" aria-hidden>
            <div className="zv-toolbar-find flex h-[35px] items-center">
              <Skeleton w="9rem" h={13} />
            </div>
            <Skeleton className="zv-skel-ctl" h={34} />
            <Skeleton className="zv-skel-ctl" h={34} />
            <Skeleton className="zv-skel-ctl" h={34} />
            <Skeleton w="32px" h={34} />
          </div>

          {/*
            `zv-entry` itself, not a shape that resembles it.

            The first version was a flex row with its own padding and gap and no third
            column — so it was the wrong height, and the amounts down the right-hand edge
            were simply missing. Borrowing the real row's class means the grid, the
            hairline and the spacing cannot drift from the list they stand in for: one of
            them is the other one, empty.
          */}
          <ul className="zv-entries">
            {["58%", "44%", "66%", "38%", "52%", "48%"].map((w, i) => (
              <li key={i} className="zv-entry is-skeleton">
                <Skeleton w="30px" h={10} />
                <Skeleton w={w} h={12} />
                <Skeleton w="52px" h={12} />
              </li>
            ))}
          </ul>
        </div>
      ) : entries.length === 0 || !shown ? (
        /*
          Empty because of the window is not empty. Say which, and leave the way out.
        */
        dateKey ? (
          <>
            {toolbar}
            <p className="zv-entries-sum">Nothing in these dates.</p>
          </>
        ) : (
          <p className="zv-entries-sum">Nothing in it yet.</p>
        )
      ) : (
        <>
          {/*
            The count and the total are the list's own heading — a word above them saying
            what they are would only be repeating what they plainly are. Under a filter
            both describe the slice, not the budget: a total that kept counting rows it had
            stopped showing would be the one kind of number this app must not print.
          */}
          {/*
            The money in what is on screen. The count moved to the toolbar below, which
            says it live beside a way to undo it — two places printing `6 of 12` is how
            they end up disagreeing after somebody edits one of them.
          */}
          <p className="zv-entries-sum">
            {shown.length === 1 ? "1 entry" : `${shown.length} entries`}
            <b>{fmt(shown.reduce((sum, e) => sum + e.amount, 0))}</b>
          </p>

          {/*
            The same toolbar every other list in here wears.

            This was a row of tag chips and two bare words for the order — which was
            defensible while there were two orders and four tags. It stopped being so the
            moment a budget could hold six hundred entries: there was no search at all, so
            finding one meant reading, and the order ran one way only.
          */}
          {toolbar}

          <ul className="zv-entries">
            {(ordered ?? shown).map((e) => (
              <li key={e.id} className="zv-entry">
                <span className="zv-entry-on">{shortDate(e.on)}</span>
                <span className="zv-entry-what">
                  <b>{e.title || e.category || "Untitled"}</b>
                  {e.title && e.category && <i>{e.category}</i>}
                  {e.filedInto && <em>{e.filedInto}</em>}
                </span>
                <span className="zv-entry-sum">{fmt(e.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/*
        The periods wait for the entries, on purpose.

        This half is a prop — it arrives with the page and could paint the instant the
        panel opens. It does not, because the two halves are one answer about one budget,
        and a panel that opens with its bottom finished and its top still coming reads as
        a panel that half failed rather than one that is still arriving.

        Nothing is actually delayed: the figures are in hand and the swap happens the
        moment the read lands, which since the read now starts on pointer-down is usually
        immediately. And because the data is already here, this skeleton can be exactly
        right — the same number of rows as the list it stands in for, so the swap moves
        nothing at all.
      */}
      {entries === null ? (
        <div aria-hidden>
          <div className="zv-split">
            <Skeleton w="5.5rem" h={12} />
          </div>
          {finished.length === 0 ? (
            <Skeleton w="14rem" h={11} />
          ) : (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {/*
                  The line boxes, not the bars: a stat is an 11px label over a 15px
                  figure, and text carries leading a bar does not. Matched by giving each
                  row the height its text occupies — 17 and 24, measured — or the tile
                  comes out nine pixels short and the swap nudges the list below it.
                */}
                {[0, 1].map((i) => (
                  <div key={i} className="zv-stat">
                    <div className="mb-0.5 flex h-[17px] items-center">
                      <Skeleton w="4.5rem" h={10} />
                    </div>
                    <div className="flex h-6 items-center">
                      <Skeleton w="3.5rem" h={15} />
                    </div>
                  </div>
                ))}
              </div>
              <ul className="space-y-2">
                {finished.map((p) => (
                  <li key={p.window.from} className="zv-past-row">
                    {/* 19px is the line box of the 12.5px row above the bar. */}
                    <div className="flex h-[19px] items-center justify-between gap-3">
                      <Skeleton w="7rem" h={12} />
                      <Skeleton w="8rem" h={12} />
                    </div>
                    <Skeleton className="mt-1.5 rounded-pill" w="100%" h={6} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : finished.length === 0 ? (
        <p className="zv-sheet-first">
          First period — it closes {shortDate(line.window.to)}.
        </p>
      ) : (
        <>
          <div className="zv-split">
            <span>Every period</span>
          </div>

          {/*
            Two figures the card cannot carry: how often this budget is broken, and what
            it usually costs — which is the number a limit should actually be set against.
            The running window is left out of the average: a month you are three days into
            would drag it toward nothing and make every budget look generous.
          */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="zv-stat">
              <span>{MISSED_LABEL(line.plan.kind)}</span>
              <b>
                {over}
                <i> of {finished.length}</i>
              </b>
            </div>
            <div className="zv-stat">
              <span>Usually</span>
              <b>{fmt(typical)}</b>
            </div>
          </div>

          <ul className="space-y-2">
            {finished.map((p) => {
              const { missed: isOver, share: pct } = periodReading(line.plan.kind, p);
              return (
                <li key={p.window.from} className="zv-past-row">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] font-semibold text-ink">
                      {windowLabel(p.window)}
                    </span>
                    <span className="mono shrink-0 text-[12.5px] text-ink">
                      {fmt(p.used)}
                      <span className="text-[11.5px] text-faint"> of {fmt(p.limitRsd)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-white/[0.06]">
                    <span
                      className="block h-full rounded-pill"
                      style={{
                        width: `${pct * 100}%`,
                        background: isOver ? "var(--color-danger)" : "var(--color-gold)",
                        opacity: 0.8,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
