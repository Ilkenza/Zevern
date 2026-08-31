"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { fold } from "@/lib/money/entry-search";

import {
  ArrowUpRight,
  CalendarClock,
  Coins,
  HardDriveDownload,
  Landmark,
  ShoppingBasket,
  Tag,
  Wallet,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListBar } from "@/components/ui/ListBar";
import { Badge } from "@/components/ui/Badge";

import type { RecurringRow, MoneyCategory, MoneyItem } from "@/lib/types";
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
import { usePane } from "./setup/usePane";
import { useMoney } from "@/lib/money/currency";
import { monthlyFor } from "./upcoming/rules-reading";

export function SetupView({
  accounts,
  categories,
  usage,
  items,
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
  const used = (c: MoneyCategory) => (usage[c.id] ?? 0) > 0;
  const inUse = allExpense.filter(used).length;
  const catTags = [
    { key: "used", label: "In use", count: inUse },
    { key: "empty", label: "Empty", count: allExpense.length - inUse },
  ].filter((t) => t.count > 0);
  const activeCatTag = catTags.some((t) => t.key === catTag) ? catTag : null;
  const catTerm = fold(catQuery.trim());
  const expense = allExpense.filter((c) => {
    if (catTerm && !fold(c.name).includes(catTerm)) return false;
    if (activeCatTag === "used") return used(c);
    if (activeCatTag === "empty") return !used(c);
    return true;
  });
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

  const foundation = foundationOf({
    accounts: accounts.length,
    expense: expense.length,
    income: income.length,
    earning: incomeOnFile,
    ratesUpdatedOn,
    calendarToken,
    things: items.length,
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
  const newExpense = useArrived(expense.map((c) => c.id));
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
              lede="So an expense can be picked off a list instead of typed out again. It fills itself — a name lands here the second time you use it."
              className="overflow-visible"
              meta={
                items.length > 0 ? (
                  <PanelMeta>
                    {items.length} {items.length === 1 ? "thing" : "things"}
                  </PanelMeta>
                ) : undefined
              }
            >
              {items.length === 0 ? (
                <EmptyState
                  icon={ShoppingBasket}
                  title="Nothing on the list yet"
                  description="File the same name on two expenses and it turns up here on its own, with what it cost. Or add one now."
                />
              ) : (
                <div className="setup-item-list">
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      categories={expense}
                      arrived={newThings.has(item.id)}
                    />
                  ))}
                </div>
              )}
              <ItemRow categories={expense} />
            </SetupSection>
          )}

          {pane === "setup-rates" && (
            <SetupSection
              id="setup-rates"
              icon={Landmark}
              title="Exchange rates"
              lede="What a euro and a dollar are worth in dinars. Only matters once something is held in one."
              meta={
                <Badge status={ratesBadge(ratesUpdatedOn).status}>
                  {ratesBadge(ratesUpdatedOn).label}
                </Badge>
              }
            >
              <RatesPanel eur={rates.EUR} usd={rates.USD} updatedOn={ratesUpdatedOn} />
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



