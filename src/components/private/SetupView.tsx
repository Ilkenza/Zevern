"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { formatAmount } from "@/lib/money";

import { ArrowUpRight, CalendarClock, Coins, Landmark, Tag, Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";

import type { RecurringRow, MoneyCategory } from "@/lib/types";
import type { AccountBalance } from "@/lib/data/money";
import { PanelMeta, useArrived } from "./setup/kit";
import { AccountHead, AccountRow } from "./setup/AccountRow";
import { CategoryRow } from "./setup/CategoryRow";
import { RatesPanel, ratesBadge } from "./setup/RatesPanel";
import { CalendarPanel, calendarBadge } from "./setup/CalendarPanel";
import { SeedButton } from "./setup/SeedButton";
import { SetupSection } from "./setup/SetupSection";
import { FoundationPanel } from "./setup/FoundationPanel";
import { foundationOf } from "./setup/foundation";
import { useMoney } from "@/lib/money/currency";

/** The three intervals a rule can repeat on, said the way a person would say them. */
const EVERY_LABEL: Record<string, string> = {
  week: "Every week",
  month: "Every month",
  year: "Every year",
};

export function SetupView({
  accounts,
  categories,
  rates,
  ratesUpdatedOn,
  calendarToken,
  earning,
  incomeOnFile,
  origin,
}: {
  accounts: AccountBalance[];
  categories: MoneyCategory[];
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
  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");
  const empty = accounts.length === 0 && categories.length === 0;
  const onHand = accounts.reduce((sum, a) => sum + a.balance, 0);
  const overviewAccounts = accounts.filter(
    (account) => typeof account.overview_rank === "number",
  ).length;

  const foundation = foundationOf({
    accounts: accounts.length,
    expense: expense.length,
    income: income.length,
    earning: incomeOnFile,
    ratesUpdatedOn,
    calendarToken,
  });

  // Rows the composer has just produced, per section. Nothing on this page moves
  // until one of these lists gains something.
  const newAccounts = useArrived(accounts.map((a) => a.id));
  const newExpense = useArrived(expense.map((c) => c.id));
  const newIncome = useArrived(income.map((c) => c.id));

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
        <FoundationPanel
          foundation={foundation}
          onHand={onHand}
          accounts={accounts.length}
        />

        <div className="setup-sections">
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

          <SetupSection
            id="setup-expense"
            icon={Tag}
            title="Expense categories"
            lede="How spending is grouped on every other screen. Start with the handful you actually spend on."
            className="overflow-visible"
            meta={
              expense.length > 0 ? (
                <PanelMeta>
                  {expense.length} {expense.length === 1 ? "category" : "categories"}
                </PanelMeta>
              ) : undefined
            }
          >
            {expense.length === 0 ? (
              <EmptyState
                icon={Tag}
                title="No expense categories yet"
                description="Without these, spending cannot be grouped anywhere in the app."
              />
            ) : (
              <div>
                {expense.map((c) => (
                  <CategoryRow
                    key={c.id}
                    category={c}
                    kind="expense"
                    arrived={newExpense.has(c.id)}
                  />
                ))}
              </div>
            )}
            <CategoryRow kind="expense" />
          </SetupSection>

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
              <div>
                {income.map((c) => (
                  <CategoryRow
                    key={c.id}
                    category={c}
                    kind="income"
                    arrived={newIncome.has(c.id)}
                  />
                ))}
              </div>
            )}
            <CategoryRow kind="income" />
          </SetupSection>

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
              <div className="setup-earning-list">
                {earning.map((rule) => (
                  <div key={rule.id} className="setup-earning-row">
                    <span className="min-w-0 flex-1">
                      <span className="setup-earning-name">{rule.name}</span>
                      <span className="setup-earning-sub">
                        {EVERY_LABEL[rule.every] ?? rule.every} · next{" "}
                        <span className="mono">{rule.next_on}</span>
                        {rule.account?.name ? ` · ${rule.account.name}` : ""}
                      </span>
                    </span>
                    <span className="mono setup-earning-amount">
                      {rule.variable || !(Number(rule.amount) > 0)
                        ? "varies"
                        : formatAmount(Number(rule.amount), rule.currency)}
                    </span>
                  </div>
                ))}
                <Link
                  href="/private/upcoming?view=rules&new=1"
                  className={buttonClasses("secondary", "mt-3 w-full justify-center")}
                >
                  Add another
                </Link>
              </div>
            )}
          </SetupSection>

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
        </div>
      </div>
    </div>
  );
}
