"use client";

import { Coins, Tag, Wallet } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRsd } from "@/lib/money";
import type { MoneyCategory } from "@/lib/types";
import type { AccountBalance } from "@/lib/data/money";
import { PanelMeta, useArrived } from "./setup/kit";
import { AccountHead, AccountRow } from "./setup/AccountRow";
import { CategoryRow } from "./setup/CategoryRow";
import { RatesPanel } from "./setup/RatesPanel";
import { CalendarPanel } from "./setup/CalendarPanel";
import { SeedButton } from "./setup/SeedButton";

export function SetupView({
  accounts,
  categories,
  rates,
  ratesUpdatedOn,
  customColors,
  calendarToken,
  origin,
}: {
  accounts: AccountBalance[];
  categories: MoneyCategory[];
  rates: { EUR: number; USD: number };
  ratesUpdatedOn: string | null;
  customColors: string[];
  /** The secret path segment of the .ics feed, or null while there is no address. */
  calendarToken: string | null;
  /** Where this app is being served from, so the feed address can be shown in full. */
  origin: string;
}) {
  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");
  const empty = accounts.length === 0 && categories.length === 0;
  const onHand = accounts.reduce((sum, a) => sum + a.balance, 0);

  // Rows the composer has just produced, per panel. Nothing on this page moves
  // until one of these lists gains something.
  const newAccounts = useArrived(accounts.map((a) => a.id));
  const newExpense = useArrived(expense.map((c) => c.id));
  const newIncome = useArrived(income.map((c) => c.id));

  return (
    <div className="setup-premium money-premium mx-auto max-w-220 space-y-5">
      <header className="money-page-head setup-page-head flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="money-page-kicker">Financial foundation</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
          Setup
          </h1>
          <p className="mt-1 max-w-lg text-[13px] leading-5 text-muted">
            Build the structure once — accounts, categories and rates keep every money view
            accurate, and the calendar address sends your reminders to your phone.
          </p>
        </div>
        <div className="setup-head-stats" aria-label="Setup summary">
          <span><small>Accounts</small><b>{accounts.length}</b></span>
          <span><small>Categories</small><b>{categories.length}</b></span>
          <span><small>On hand</small><b className="mono">{formatRsd(onHand)}</b></span>
        </div>
      </header>

      {empty && (
        <div className="setup-seed-card flex flex-col gap-3 rounded-card border border-gold/25 bg-active-bg px-4 py-4 min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between">
          <div className="min-w-0">
            <h2 className="text-[13.5px] font-bold text-ink">Nothing set up yet</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              One tap creates a cash account, a bank account and a sensible set of categories.
              Rename or delete any of them afterwards.
            </p>
          </div>
          <div className="shrink-0">
            <SeedButton />
          </div>
        </div>
      )}

      <RatesPanel eur={rates.EUR} usd={rates.USD} updatedOn={ratesUpdatedOn} />

      <Panel
        className="setup-panel"
        title="Accounts"
        action={
          accounts.length > 0 ? (
            <PanelMeta>
              <span className="hidden min-[420px]:inline">
                {accounts.length} {accounts.length === 1 ? "account" : "accounts"} ·{" "}
              </span>
              <span className="mono text-ink">{formatRsd(onHand)}</span>
            </PanelMeta>
          ) : undefined
        }
      >
        {accounts.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description="The account your salary lands in, the cash in your pocket. Every entry you log later points at one of these."
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
      </Panel>

      <Panel
        className="setup-panel overflow-visible"
        title="Expense categories"
        action={
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
            description="Categories are how spending gets grouped on every other screen. Start with the handful you actually spend on."
          />
        ) : (
          <div>
            {expense.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                kind="expense"
                custom={customColors}
                arrived={newExpense.has(c.id)}
              />
            ))}
          </div>
        )}
        <CategoryRow kind="expense" custom={customColors} />
      </Panel>

      <Panel
        className="setup-panel overflow-visible"
        title="Income categories"
        action={
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
            description="Where the money comes from — salary, invoices, the occasional gift."
          />
        ) : (
          <div>
            {income.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                kind="income"
                custom={customColors}
                arrived={newIncome.has(c.id)}
              />
            ))}
          </div>
        )}
        <CategoryRow kind="income" custom={customColors} />
      </Panel>

      <CalendarPanel origin={origin} token={calendarToken} />
    </div>
  );
}
