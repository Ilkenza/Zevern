"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { fold } from "@/lib/money/entry-search";
import { toRsd } from "@/lib/money";
import { useDefaultCurrency } from "@/lib/money/currency";

import {
  ArrowUpRight,
  CalendarClock,
  Coins,
  HardDriveDownload,
  Landmark,
  Refrigerator,
  ShoppingBasket,
  Tag,
  Wallet,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListBar } from "@/components/ui/ListBar";
import { Badge } from "@/components/ui/Badge";

import type { RecurringRow, MoneyCategory, MoneyItem, StockLine } from "@/lib/types";
import type { AccountBalance } from "@/lib/data/money";
import { PanelMeta, useArrived } from "./setup/kit";
import { AccountHead, AccountRow } from "./setup/AccountRow";
import { CategoryRow } from "./setup/CategoryRow";
import { RatesPanel, ratesBadge } from "./setup/RatesPanel";
import { CalendarPanel, calendarBadge } from "./setup/CalendarPanel";
import { SeedButton } from "./setup/SeedButton";
import { SetupSection } from "./setup/SetupSection";
import { ItemRow } from "./setup/ItemRow";
import { DATA_PANE, SetupTabs } from "./setup/SetupTabs";
import { ExportPanel } from "@/components/settings/ExportPanel";
import { foundationOf } from "./setup/foundation";
import { HousePanel } from "./setup/HousePanel";
import { usePane } from "./setup/usePane";
import { useMoney } from "@/lib/money/currency";
import { monthlyFor } from "./upcoming/rules-reading";

/**
 * What order the two long lists in Setup can be read in. `asc` is the order as it is
 * named, and the picker writes the other end of each one itself.
 *
 * `As listed` first, and it is the default: the read already hands these back in an
 * order — rank then name for categories, most-used then most-recent for things — and a
 * screen that rearranges a familiar list the moment it opens has answered a question
 * nobody asked. Everything under it is a question somebody did ask.
 */
/* What the three kinds are called on the filter. `Neither` rather than `Other`, because
   the question the control is asking is the one the row asks: is this food or drink. */
const KIND_NAME: Record<string, string> = { food: "Food", drink: "Drink", other: "Neither" };

const CAT_SORTS = [
  { value: "listed", label: "As listed", reverse: "Reversed" },
  { value: "uses", label: "Most used", reverse: "Least used" },
  { value: "name", label: "A to Z", reverse: "Z to A" },
];

const THING_SORTS = [
  { value: "uses", label: "Most used", reverse: "Least used" },
  { value: "name", label: "A to Z", reverse: "Z to A" },
  { value: "price", label: "Dearest", reverse: "Cheapest" },
  { value: "bought", label: "Bought recently", reverse: "Longest ago" },
];

/**
 * Bigger first, with anything that has no answer at the bottom whichever way it runs.
 *
 * A thing with no price is not cheaper than one at 119 dinars, it is unknown — and
 * twenty blank rows at the top of `Cheapest` is the list answering a question nobody
 * asked. Same for a thing never bought under `Longest ago`.
 */
function ranked(a: number | null, b: number | null, dir: number): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return dir * (b - a);
}

export function SetupView({
  accounts,
  categories,
  usage,
  items,
  rateUse,
  stock,
  rates,
  ratesUpdatedOn,
  calendarToken,
  earning,
  incomeOnFile,
  origin,
}: {
  accounts: AccountBalance[];
  categories: MoneyCategory[];
  /** Category id → how many entries it holds, so the page can tell alive from forgotten. */
  usage: Record<string, number>;
  /** The things bought before, so the list can be corrected by hand as well as filled by use. */
  items: MoneyItem[];
  rateUse: { count: number; currencies: string[] };
  stock: StockLine[];
  rates: { EUR: number; USD: number };
  ratesUpdatedOn: string | null;
  /** The secret path segment of the .ics feed, or null while there is no address. */
  calendarToken: string | null;
  /** Standing rules that bring money in, so the page can show what it is counting. */
  earning: RecurringRow[];
  /** True once anything is on file as income at all — a rule or a booking. */
  incomeOnFile: boolean;
  /** Where this app is being served from, so the feed address can be shown in full. */
  origin: string;
}) {
  const { fmt } = useMoney();
  const allExpense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");

  /*
    A way through the expense list, which is the one that grows without anybody deciding
    to grow it. Every category typed into a form to get past it stays here forever, and
    at fifty-three the screen for tidying up is itself the thing that needs tidying.

    `In use` and `Empty` rather than a date or a name: the only question worth asking of
    a category list is which of these are carrying a year of spending and which were
    typed once. The counts answer it without pressing anything, which is the point — the
    filter is a readout first and a door second.
  */
  const [catQuery, setCatQuery] = useState("");
  const [catTag, setCatTag] = useState<string | null>(null);
  const [catSort, setCatSort] = useState("listed");
  const [catWay, setCatWay] = useState<"asc" | "desc">("asc");
  const used = (c: MoneyCategory) => (usage[c.id] ?? 0) > 0;
  const inUse = allExpense.filter(used).length;
  const catTags = [
    { key: "used", label: "In use", count: inUse },
    { key: "empty", label: "Empty", count: allExpense.length - inUse },
  ].filter((t) => t.count > 0);
  const activeCatTag = catTags.some((t) => t.key === catTag) ? catTag : null;
  const catTerm = fold(catQuery.trim());
  const catDir = catWay === "desc" ? -1 : 1;
  const expense = allExpense
    .filter((c) => {
      if (catTerm && !fold(c.name).includes(catTerm)) return false;
      if (activeCatTag === "used") return used(c);
      if (activeCatTag === "empty") return !used(c);
      return true;
    })
    .sort((a, b) => {
      if (catSort === "uses")
        return (
          catDir * ((usage[b.id] ?? 0) - (usage[a.id] ?? 0)) ||
          a.name.localeCompare(b.name, "sr")
        );
      if (catSort === "name") return catDir * a.name.localeCompare(b.name, "sr");
      /* `As listed` is the order the read hands back — by hand-set rank, then name — and
         it is the default so that opening this section does not rearrange a list somebody
         already knows the shape of. Reversing it is the one thing `.sort` cannot express,
         so it is done to the copy `.filter` has already made. */
      return 0;
    });
  if (catSort === "listed" && catWay === "desc") expense.reverse();
  /*
    A way through the shopping list, which grows the way the category list grows — every
    name marked on an entry stays here, and at thirty-one the section for tidying it up
    is the thing that needs tidying.

    The same three controls as the categories above, asking what this list is actually
    asked: is this food or drink, what is it filed under, which of these still have no
    price on them, and what is the dearest thing I keep buying.
  */
  const [thingQuery, setThingQuery] = useState("");
  const [thingKinds, setThingKinds] = useState<string[]>([]);
  const [thingCats, setThingCats] = useState<string[]>([]);
  const [thingFlag, setThingFlag] = useState("");
  const [thingSort, setThingSort] = useState("uses");
  const [thingWay, setThingWay] = useState<"asc" | "desc">("asc");

  const tally = <K extends string>(pick: (item: MoneyItem) => K) => {
    const counts = new Map<K, number>();
    for (const item of items) {
      const key = pick(item);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };
  const byKind = tally((i) => i.kind);
  const byCat = tally((i) => i.category_id ?? "none");
  const unpriced = items.filter((i) => i.price == null).length;

  const thingKindOptions = ["food", "drink", "other"]
    .filter((k) => (byKind.get(k) ?? 0) > 0)
    .map((k) => ({ value: k, label: `${KIND_NAME[k]} (${byKind.get(k)})` }));
  const thingCatOptions = [
    ...allExpense
      .filter((c) => (byCat.get(c.id) ?? 0) > 0)
      .map((c) => ({ value: c.id, label: `${c.name} (${byCat.get(c.id)})` })),
    /* `none` rather than an empty string: an empty value is what the bar itself uses
       for "do not narrow at all", and two different nothings in one control is a bug
       waiting for the day this filter is drawn as a plain select. */
    ...((byCat.get("none") ?? 0) > 0
      ? [{ value: "none", label: `Nothing yet (${byCat.get("none")})` }]
      : []),
  ];

  const thingTerm = fold(thingQuery.trim());
  const thingDir = thingWay === "desc" ? -1 : 1;
  /* Prices are kept in the currency the thing is bought in, so ordering them means
     putting them all in dinars first — otherwise a 3 EUR thing sorts under a 119 RSD one
     and the list is quietly wrong rather than loudly wrong. */
  const inRsd = (item: MoneyItem) =>
    item.price == null ? null : toRsd(item.price, item.currency, rates);
  const things = items
    .filter((item) => {
      if (thingTerm && !fold(item.name).includes(thingTerm)) return false;
      if (thingKinds.length > 0 && !thingKinds.includes(item.kind)) return false;
      if (thingCats.length > 0 && !thingCats.includes(item.category_id ?? "none"))
        return false;
      if (thingFlag === "unpriced" && item.price != null) return false;
      return true;
    })
    .sort((a, b) => {
      if (thingSort === "name") return thingDir * a.name.localeCompare(b.name, "sr");
      if (thingSort === "price") return ranked(inRsd(a), inRsd(b), thingDir);
      if (thingSort === "bought")
        return ranked(
          a.last_used_on == null ? null : Date.parse(a.last_used_on),
          b.last_used_on == null ? null : Date.parse(b.last_used_on),
          thingDir,
        );
      return thingDir * (b.uses - a.uses) || a.name.localeCompare(b.name, "sr");
    });
  const thingsNarrowed =
    thingTerm !== "" || thingKinds.length > 0 || thingCats.length > 0 || thingFlag !== "";

  const empty = accounts.length === 0 && categories.length === 0;
  const onHand = accounts.reduce((sum, a) => sum + a.balance, 0);
  const overviewAccounts = accounts.filter(
    (account) => typeof account.overview_rank === "number",
  ).length;

  /*
    What comes in, as three facts rather than as a second copy of the Rules screen.

    A rule that varies has no honest monthly figure — `monthlyFor` says so by returning
    null — so it is counted apart and named apart, instead of being guessed at and folded
    into a total that would then be wrong by however much it guessed.
  */
  const earningMonthly = earning.reduce(
    (sum, rule) => sum + (monthlyFor(rule, rates) ?? 0),
    0,
  );
  const earningVaries = earning.filter((rule) => monthlyFor(rule, rates) === null).length;
  const nextEarning = [...earning]
    .filter((rule) => rule.next_on)
    .sort((a, b) => a.next_on.localeCompare(b.next_on))[0];

  const readIn = useDefaultCurrency();
  /*
    Whether a rate multiplies anything at all — worked out on the server, where the whole
    of the profile is in reach. It was worked out here first and got it wrong in the
    direction that matters: it looked at the *income* rules only, so six subscriptions
    billed in euros and dollars were converted every month by a rate the screen had just
    decided nobody needed.
  */
  const foreign = readIn !== "RSD" || rateUse.count > 0;

  const foundation = foundationOf({
    accounts: accounts.length,
    expense: expense.length,
    income: income.length,
    earning: incomeOnFile,
    ratesUpdatedOn,
    calendarToken,
    things: items.length,
    house: stock.length,
  });

  /*
    One section at a time, chosen by the rail and written in the address.

    Six cards stacked in a column meant the page was as tall as its longest list — fifty
    eight expense categories, and the exchange rates two thousand pixels under them. A
    settings screen is not read top to bottom; it is visited, one question at a time, and
    the rail beside it already names the six.
  */
  const pane = usePane([...foundation.steps.map((s) => s.id), DATA_PANE]);

  // Rows the composer has just produced, per section. Nothing on this page moves
  // until one of these lists gains something.
  const newAccounts = useArrived(accounts.map((a) => a.id));
  /* From the whole list, not the visible one: searching a row out of sight and back
     again is not the row arriving, and the animation that says `this is new` is a lie
     the second time it plays. */
  const newExpense = useArrived(allExpense.map((c) => c.id));
  const newIncome = useArrived(income.map((c) => c.id));
  const newThings = useArrived(items.map((i) => i.id));

  return (
    <div className="money-premium mx-auto max-w-280">
      <header className="money-page-head setup-page-head">
        <div className="min-w-0">
          <span className="money-page-kicker">Financial foundation</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            Setup
          </h1>
          {/* Same cut as the Goals subtitle: what the screen is for, not why it matters. */}
          <p className="mt-1 max-w-lg text-[13px] leading-5 text-muted">
            Accounts, categories and rates. Every other screen reads from what is set
            here.
          </p>
        </div>
      </header>

      {empty && (
        <div className="setup-seed-card">
          <div className="min-w-0">
            <h2 className="text-[14px] font-bold text-ink">Start with a working set</h2>
            <p className="mt-1 max-w-lg text-[12.5px] leading-relaxed text-muted">
              One tap creates a cash account, a bank account and a sensible set of
              categories — everything below, filled in. Rename or delete any of them
              afterwards; nothing here is permanent.
            </p>
          </div>
          <div className="shrink-0">
            <SeedButton />
          </div>
        </div>
      )}

      <div className="setup-layout">
        <SetupTabs foundation={foundation} active={pane} />

        <div className="setup-sections">
          {pane === "setup-accounts" && (
            <SetupSection
              id="setup-accounts"
              icon={Wallet}
              title="Accounts"
              lede="Where the money actually sits. Use the eye to show up to two accounts on Overview."
              meta={
                accounts.length > 0 ? (
                  <PanelMeta>
                    <span className="hidden min-[420px]:inline">
                      {accounts.length} {accounts.length === 1 ? "account" : "accounts"} ·{" "}
                    </span>
                    <span className="hidden min-[560px]:inline">
                      {overviewAccounts}/2 on Overview ·{" "}
                    </span>
                    <span className="mono text-ink">{fmt(onHand)}</span>
                  </PanelMeta>
                ) : undefined
              }
            >
              {accounts.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No accounts yet"
                  description="The account your salary lands in, the cash in your pocket."
                />
              ) : (
                <div>
                  <AccountHead />
                  {accounts.map((a) => (
                    <AccountRow key={a.id} account={a} arrived={newAccounts.has(a.id)} />
                  ))}
                </div>
              )}
              <AccountRow />
            </SetupSection>
          )}

          {pane === "setup-expense" && (
            <SetupSection
              id="setup-expense"
              icon={Tag}
              title="Expense categories"
              lede="How spending is grouped on every other screen. Start with the handful you actually spend on."
              className="overflow-visible"
              meta={
                allExpense.length > 0 ? (
                  <PanelMeta>
                    {expense.length === allExpense.length
                      ? `${allExpense.length} ${allExpense.length === 1 ? "category" : "categories"}`
                      : `${expense.length} of ${allExpense.length}`}
                  </PanelMeta>
                ) : undefined
              }
            >
              {/*
                The bar only once the list has become a list. Under ten categories every
                one of them is on the screen already and a search box is furniture.
              */}
              {allExpense.length >= 10 && (
                <ListBar
                  inPanel
                  query={catQuery}
                  onQuery={setCatQuery}
                  searchLabel="Search categories…"
                  filters={[
                    {
                      value: activeCatTag ?? "",
                      onChange: (v) => setCatTag(v || null),
                      label: "Filter categories by use",
                      all: `All ${allExpense.length}`,
                      options: catTags.map((t) => ({
                        value: t.key,
                        label: `${t.label} (${t.count})`,
                      })),
                    },
                  ]}
                  sort={{
                    value: catSort,
                    onChange: setCatSort,
                    label: "What order to list them in",
                    options: CAT_SORTS,
                    direction: catWay,
                    onDirection: setCatWay,
                  }}
                  shown={expense.length}
                  total={allExpense.length}
                  onClear={() => {
                    setCatQuery("");
                    setCatTag(null);
                  }}
                />
              )}

              {allExpense.length === 0 ? (
                <EmptyState
                  icon={Tag}
                  title="No expense categories yet"
                  description="Without these, spending cannot be grouped anywhere in the app."
                />
              ) : expense.length === 0 ? (
                <p className="py-4 text-[12.5px] text-muted">
                  Nothing matches. All {allExpense.length} are still here — the search or the
                  filter is hiding them.
                </p>
              ) : (
                <div className="setup-cat-grid">
                  {expense.map((c) => (
                    <CategoryRow
                      key={c.id}
                      category={c}
                      kind="expense"
                      arrived={newExpense.has(c.id)}
                      uses={usage[c.id] ?? 0}
                    />
                  ))}
                </div>
              )}
              <CategoryRow kind="expense" />
            </SetupSection>
          )}

          {pane === "setup-income" && (
            <SetupSection
              id="setup-income"
              icon={Coins}
              title="Income categories"
              lede="Where the money comes from — salary, invoices, the occasional gift."
              className="overflow-visible"
              meta={
                income.length > 0 ? (
                  <PanelMeta>
                    {income.length} {income.length === 1 ? "category" : "categories"}
                  </PanelMeta>
                ) : undefined
              }
            >
              {income.length === 0 ? (
                <EmptyState
                  icon={Coins}
                  title="No income categories yet"
                  description="Without one there is no way to log money coming in — and every month then reads as a pure loss."
                />
              ) : (
                <div className="setup-cat-grid">
                  {income.map((c) => (
                    <CategoryRow
                      key={c.id}
                      category={c}
                      kind="income"
                      arrived={newIncome.has(c.id)}
                      uses={usage[c.id] ?? 0}
                    />
                  ))}
                </div>
              )}
              <CategoryRow kind="income" />
            </SetupSection>
          )}

          {/*
            The step the other five leave out.

            Accounts, categories and rates all describe the shape of the money. None of
            them is the money. Someone can finish every required step above this one and
            still have told the app nothing about what arrives — at which point the net
            figure reads as a loss on every screen, forever, and the app looks broken
            when it is merely uninformed.

            A standing rule rather than a one-off entry, because pay repeats and the
            forecast on Upcoming has been waiting for exactly this. Variable is fine:
            the rule can carry no amount and average its own history.
          */}
          {pane === "setup-earning" && (
            <SetupSection
              id="setup-earning"
              icon={ArrowUpRight}
              title="What comes in"
              lede="The pay, the invoices, the standing transfer — and the day each one lands."
              meta={
                earning.length > 0 ? (
                  <PanelMeta>
                    {earning.length} {earning.length === 1 ? "source" : "sources"}
                  </PanelMeta>
                ) : undefined
              }
            >
              {earning.length === 0 ? (
                <EmptyState
                  icon={ArrowUpRight}
                  title={incomeOnFile ? "No standing income" : "Nothing on file as income"}
                  description={
                    incomeOnFile
                      ? "You have logged income by hand. A standing rule saves doing it again every month, and lets the forecast see it coming."
                      : "Until something is here, every month reads as pure loss — the app is counting only what goes out."
                  }
                  action={
                    <Link
                      href="/private/upcoming?view=rules&new=1"
                      className={buttonClasses("primary", "money-premium-button")}
                    >
                      Add what comes in
                    </Link>
                  }
                />
              ) : (
                /*
                  The answer, not the list.

                  This printed every income rule — fourteen of them here — with its interval,
                  its next date and its account: the Rules screen, copied onto a settings
                  page, read-only. Nothing on it could be changed, so every row ended at the
                  same link, and the two lists could disagree the moment one of them changed.

                  What Setup is actually asking is whether this is set up, and that is three
                  facts: how many sources, what they come to in a month, and when the next
                  one lands. The rules themselves live one door away, where they can be
                  edited.
                */
                <div className="setup-earning">
                  <p className="setup-earning-figure">
                    <b className="mono">{fmt(earningMonthly)}</b>
                    <i>a month from {earning.length} {earning.length === 1 ? "source" : "sources"}</i>
                  </p>
                  <p className="setup-earning-note">
                    {nextEarning ? (
                      <>
                        Next is <b>{nextEarning.name}</b> on{" "}
                        <span className="mono">{nextEarning.next_on}</span>
                      </>
                    ) : (
                      "None of them has a next date yet"
                    )}
                    {earningVaries > 0 && (
                      <>
                        {" · "}
                        {earningVaries} {earningVaries === 1 ? "varies" : "vary"} and{" "}
                        {earningVaries === 1 ? "is" : "are"} left out of that figure
                      </>
                    )}
                  </p>
                  <Link
                    href="/private/upcoming?view=rules"
                    className={buttonClasses("secondary", "mt-3 w-full justify-center")}
                  >
                    Manage them in Upcoming
                  </Link>
                </div>
              )}
            </SetupSection>
          )}

          {pane === "setup-things" && (
            <SetupSection
              id="setup-things"
              icon={ShoppingBasket}
              title="Things you buy"
              lede="So an expense can be picked off a list instead of typed out again. Nothing lands here on its own: mark a name on an entry to keep it, or add one below. Mark one as food or drink and what you buy of it turns up in In the house — with a rok, if it goes off."
              className="overflow-visible"
              meta={
                items.length > 0 ? (
                  <PanelMeta>
                    {things.length === items.length
                      ? `${items.length} ${items.length === 1 ? "thing" : "things"}`
                      : `${things.length} of ${items.length}`}
                  </PanelMeta>
                ) : undefined
              }
            >
              {/* Same rule as the categories above: under ten, every one of them is
                  already on the screen and a search box is furniture. */}
              {items.length >= 10 && (
                <ListBar
                  inPanel
                  query={thingQuery}
                  onQuery={setThingQuery}
                  searchLabel="Search things…"
                  filters={[
                    {
                      value: thingKinds[0] ?? "",
                      onChange: (v) => setThingKinds(v ? [v] : []),
                      values: thingKinds,
                      onValues: setThingKinds,
                      many: "kinds",
                      label: "Food, drink or neither",
                      all: `Anything (${items.length})`,
                      options: thingKindOptions,
                    },
                    {
                      value: thingCats[0] ?? "",
                      onChange: (v) => setThingCats(v ? [v] : []),
                      values: thingCats,
                      onValues: setThingCats,
                      many: "categories",
                      label: "What it is filed under",
                      all: "Any category",
                      options: thingCatOptions,
                    },
                    {
                      value: thingFlag,
                      onChange: setThingFlag,
                      label: "Whether it has a price on it",
                      all: `All ${items.length}`,
                      options:
                        unpriced > 0
                          ? [{ value: "unpriced", label: `No price yet (${unpriced})` }]
                          : [],
                      always: unpriced > 0,
                    },
                  ]}
                  sort={{
                    value: thingSort,
                    onChange: setThingSort,
                    label: "What order to list them in",
                    options: THING_SORTS,
                    direction: thingWay,
                    onDirection: setThingWay,
                  }}
                  shown={things.length}
                  total={items.length}
                  alwaysClear={thingsNarrowed}
                  onClear={() => {
                    setThingQuery("");
                    setThingKinds([]);
                    setThingCats([]);
                    setThingFlag("");
                  }}
                />
              )}

              {items.length === 0 ? (
                <EmptyState
                  icon={ShoppingBasket}
                  title="Nothing on the list yet"
                  description="Mark a name on an entry — the bookmark beside a line, or the box under a single purchase — and it turns up here with what it cost. Or add one now."
                />
              ) : things.length === 0 ? (
                <p className="py-4 text-[12.5px] text-muted">
                  Nothing matches. All {items.length} are still here — the search or the
                  filters are hiding them.
                </p>
              ) : (
                <div className="setup-item-list">
                  {things.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      categories={allExpense}
                      arrived={newThings.has(item.id)}
                    />
                  ))}
                </div>
              )}
              {/*
                The composer, and every row above it, offers every category — not the
                ones left after the section above has been searched. What a thing can be
                filed under is not a question about what is on screen two panes away, and
                a row whose own category had been filtered out was drawing a select with
                nothing selected in it.
              */}
              <ItemRow categories={allExpense} />
            </SetupSection>
          )}

          {/*
            What is in the house, directly under the list it is built from.

            Everything about this lives in Setup on purpose — it was offered on Money and
            turned down. One list, one place, and the two questions it needs (is this food,
            and how long does it keep) are answered one section up.
          */}
          {pane === "setup-house" && (
            <SetupSection
              id="setup-house"
              icon={Refrigerator}
              title="In the house"
              lede="What you have bought and not finished. A press takes one — click the number on a row to say how many, or take the lot. Nothing here is counted in money."
              meta={
                stock.length > 0 ? (
                  <PanelMeta>
                    {stock.length} {stock.length === 1 ? "thing" : "things"}
                  </PanelMeta>
                ) : undefined
              }
            >
              <HousePanel stock={stock} items={items} />
            </SetupSection>
          )}

          {pane === "setup-rates" && (
            <SetupSection
              id="setup-rates"
              icon={Landmark}
              title="Exchange rates"
              lede="What a euro and a dollar are worth in dinars. Only matters once something is held in one."
              meta={
                /* No badge while nothing is converted — it would be a warning about a
                   number that multiplies nothing. */
                foreign ? (
                  <Badge status={ratesBadge(ratesUpdatedOn).status}>
                    {ratesBadge(ratesUpdatedOn).label}
                  </Badge>
                ) : undefined
              }
            >
              <RatesPanel
                eur={rates.EUR}
                usd={rates.USD}
                updatedOn={ratesUpdatedOn}
                needed={foreign}
                use={rateUse}
              />
            </SetupSection>
          )}

          {pane === "setup-calendar" && (
            <SetupSection
              id="setup-calendar"
              icon={CalendarClock}
              title="Calendar feed"
              lede="A private address your phone's calendar can subscribe to, so what falls due turns up next to everything else."
              meta={
                <Badge status={calendarBadge(calendarToken).status}>
                  {calendarBadge(calendarToken).label}
                </Badge>
              }
            >
              <CalendarPanel origin={origin} token={calendarToken} />
            </SetupSection>
          )}

          {/*
            The same export the Freelance settings screen has, because it is the same
            account and the same file — one component, shown in both places rather than
            written twice. It is here because from Private there was no way to reach it
            without changing workspaces, and the export is the one thing you go looking
            for at the moment you least want a hunt.
          */}
          {pane === DATA_PANE && (
            <SetupSection
              id={DATA_PANE}
              icon={HardDriveDownload}
              title="Your data"
              lede="Everything on this account, on your own disk — accounts, entries, budgets, goals, debts and the rest."
            >
              <ExportPanel />
            </SetupSection>
          )}
        </div>
      </div>
    </div>
  );
}



