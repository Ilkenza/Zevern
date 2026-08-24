"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coins, Plus, RefreshCw, Sparkles, Tag, Trash2, Wallet } from "lucide-react";
import {
  saveAccount,
  saveCategory,
  saveRates,
  refreshRatesFromNbs,
  seedDefaults,
  deleteAccount,
  deleteCategory,
  type MoneyState,
} from "@/app/(app)/private/actions";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ACCOUNT_KIND_OPTIONS, CURRENCIES, SWATCHES, formatRsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MoneyCategory } from "@/lib/types";
import type { AccountBalance } from "@/lib/data/money";

const field =
  "rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring";

/** Small caps label — column heads, composer captions, tile labels. */
const caps = "text-[10.5px] font-semibold uppercase tracking-wider text-faint";

/**
 * One column template, shared by the head strip, every account row and the
 * composer — they are separate <form> elements, so the columns only line up if
 * every one of them is measured the same way. Fixed widths for everything but
 * the name, which takes the slack.
 *
 * Under 420px each field takes its own line; up to 720px they pair up; above
 * that an account is one line, read left to right: what it is, what is in it.
 */
const accountCols =
  "grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 min-[720px]:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem_7rem_7.5rem] min-[720px]:items-center min-[720px]:gap-3";

const categoryCols =
  "grid grid-cols-2 items-center gap-2 min-[480px]:grid-cols-[minmax(0,1fr)_auto_7.5rem] min-[480px]:gap-3";

function RowDelete({ onDelete, label }: { onDelete: () => Promise<void>; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={label}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await onDelete();
          router.refresh();
        })
      }
      className="rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-danger disabled:opacity-50"
    >
      <Trash2 className="h-3.75 w-3.75" />
    </button>
  );
}

/** The line under a panel title: how many of the thing there are. */
function PanelMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11.5px] font-semibold whitespace-nowrap text-muted">{children}</span>
  );
}

/** Caption above a composer, so adding never looks like editing. */
function AddCaption({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5">
      <Plus className="h-3.5 w-3.5 text-gold" />
      <span className={caps}>{children}</span>
    </div>
  );
}

function RowError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 text-[11px] text-danger">{message}</p>;
}

function AccountRow({ account }: { account?: AccountBalance }) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveAccount, undefined);
  const isNew = !account;

  return (
    <form
      action={formAction}
      className={cn(
        "px-4",
        isNew
          ? "rounded-b-card border-t border-line bg-white/[0.02] py-3.5"
          : "border-b border-line-soft py-2.5 last:border-b-0",
      )}
    >
      {isNew && <AddCaption>Add an account</AddCaption>}
      {account && <input type="hidden" name="id" value={account.id} />}

      <div className={accountCols}>
        <input
          name="name"
          defaultValue={account?.name ?? ""}
          placeholder="Account name"
          aria-label="Account name"
          required
          className={cn(
            field,
            "w-full min-w-0 font-medium min-[420px]:col-span-2 min-[720px]:col-span-1",
          )}
        />

        <select
          name="kind"
          defaultValue={account?.kind ?? "bank"}
          aria-label="Account type"
          className={cn(field, "w-full scheme-dark")}
        >
          {ACCOUNT_KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-surface">
              {o.label}
            </option>
          ))}
        </select>

        {/* Opening balance and its currency are one control: the currency is a
            property of the money in the account, not another box to fill. */}
        <div className="flex w-full min-w-0 items-center rounded-ctrl border border-line bg-white/[0.035] focus-within:border-gold focus-within:shadow-ring">
          <input
            name="opening_balance"
            defaultValue={account ? String(account.opening_balance) : ""}
            placeholder="0"
            aria-label="Opening balance"
            inputMode="decimal"
            className="mono min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-right text-[13px] text-ink placeholder:text-faint"
          />
          <select
            name="currency"
            defaultValue={account?.currency ?? "RSD"}
            aria-label="Currency"
            className="mono rounded-r-ctrl border-l border-line-soft bg-transparent py-1.5 pr-1.5 pl-1.5 text-[11.5px] font-semibold text-muted scheme-dark"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c} className="bg-surface">
                {c}
              </option>
            ))}
          </select>
        </div>

        {account ? (
          <div className="flex items-center justify-between gap-2 min-[720px]:justify-end">
            <span className={cn(caps, "min-[720px]:hidden")}>Balance</span>
            <span
              className={cn(
                "mono text-[14px] font-semibold",
                account.balance < 0 ? "text-danger" : "text-ink",
              )}
            >
              {formatRsd(account.balance)}
            </span>
          </div>
        ) : (
          <div className="hidden min-[720px]:block" />
        )}

        {isNew ? (
          <div className="col-span-full min-[720px]:col-span-1">
            <Button
              type="submit"
              variant="primary"
              className="w-full px-3 py-1.5 text-[12.5px]"
              disabled={pending}
            >
              {pending ? "Adding…" : "Add"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="submit"
              variant="secondary"
              className="w-21 px-3 py-1.5 text-[12.5px]"
              disabled={pending}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            <RowDelete
              onDelete={async () => {
                await deleteAccount(account.id);
              }}
              label={`Delete ${account.name}`}
            />
          </div>
        )}
      </div>

      <RowError message={state?.error} />
    </form>
  );
}

function AccountHead() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "hidden border-b border-line-soft bg-white/[0.02] px-4 py-2",
        "min-[720px]:grid min-[720px]:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem_7rem_7.5rem] min-[720px]:items-center min-[720px]:gap-3",
      )}
    >
      <span className={caps}>Account</span>
      <span className={caps}>Type</span>
      <span className={cn(caps, "text-right")}>Opening</span>
      <span className={cn(caps, "text-right")}>Balance now</span>
      <span />
    </div>
  );
}

function CategoryRow({
  category,
  kind,
  custom,
}: {
  category?: MoneyCategory;
  kind: "expense" | "income";
  custom: string[];
}) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveCategory, undefined);
  const isNew = !category;

  return (
    <form
      action={formAction}
      className={cn(
        "px-4",
        isNew
          ? "rounded-b-card border-t border-line bg-white/[0.02] py-3.5"
          : "border-b border-line-soft py-2.5 last:border-b-0",
      )}
    >
      {isNew && (
        <AddCaption>
          {kind === "income" ? "Add an income category" : "Add an expense category"}
        </AddCaption>
      )}
      {category && <input type="hidden" name="id" value={category.id} />}
      <input type="hidden" name="kind" value={category?.kind ?? kind} />

      <div className={categoryCols}>
        <input
          name="name"
          defaultValue={category?.name ?? ""}
          placeholder="Category name"
          aria-label="Category name"
          required
          className={cn(field, "col-span-2 w-full min-w-0 font-medium min-[480px]:col-span-1")}
        />

        <div className="justify-self-start">
          <ColorPicker name="color" value={category?.color ?? SWATCHES[0]} custom={custom} />
        </div>

        {isNew ? (
          <Button
            type="submit"
            variant="primary"
            className="w-full px-3 py-1.5 text-[12.5px]"
            disabled={pending}
          >
            {pending ? "Adding…" : "Add"}
          </Button>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="submit"
              variant="secondary"
              className="w-21 px-3 py-1.5 text-[12.5px]"
              disabled={pending}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            <RowDelete
              onDelete={async () => {
                await deleteCategory(category.id);
              }}
              label={`Delete ${category.name}`}
            />
          </div>
        )}
      </div>

      <RowError message={state?.error} />
    </form>
  );
}

/** A rate is a figure first: big, mono, and editable in place. */
function RateTile({ code, name, value }: { code: string; name: string; value: number }) {
  return (
    <label className="block rounded-card border border-line bg-surface-2 px-3.5 py-3">
      <span className={caps}>1 {code} in dinars</span>
      <input
        name={name}
        defaultValue={String(value)}
        inputMode="decimal"
        aria-label={`Dinars for one ${code}`}
        className="mono mt-1 w-full rounded-ctrl border border-transparent bg-transparent px-1 py-0.5 text-[22px] font-semibold tracking-[-0.5px] text-ink hover:border-line focus:border-gold focus:shadow-ring"
      />
    </label>
  );
}

function RatesPanel({ eur, usd, updatedOn }: { eur: number; usd: number; updatedOn: string | null }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveRates, undefined);
  const [fetching, startFetch] = useTransition();
  const [fetchError, setFetchError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const stale = !updatedOn || updatedOn < today;

  const pull = () => {
    setFetchError(null);
    startFetch(async () => {
      const result = await refreshRatesFromNbs();
      if (result?.error) setFetchError(result.error);
      else router.refresh();
    });
  };

  return (
    <Panel
      title="Exchange rates"
      action={
        <Badge status={stale ? "draft" : "ok"}>
          {!updatedOn ? "Never pulled" : stale ? "Not today's" : "Today's rate"}
        </Badge>
      }
    >
      <form action={formAction} className="px-4 py-4">
        <div className="grid gap-2.5 min-[420px]:grid-cols-2">
          <RateTile code="EUR" name="rate_eur" value={eur} />
          <RateTile code="USD" name="rate_usd" value={usd} />
        </div>

        <p className="mt-3 text-[11.5px] text-faint">
          <span className="mono">
            {updatedOn ? `Rate list of ${updatedOn}` : "No rate list pulled yet"}
          </span>
          {stale && (
            <span className="ml-2 text-draft">
              — not today&apos;s, pull the NBS rate before you trust a total in dinars
            </span>
          )}
        </p>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={pull}
            disabled={fetching || pending}
            className={buttonClasses("secondary")}
          >
            <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
            {fetching ? "Fetching…" : "Today's NBS rate"}
          </button>
          <Button type="submit" variant="primary" disabled={pending || fetching}>
            {pending ? "Saving…" : "Save rates"}
          </Button>
          {state?.ok && <span className="text-[12px] text-ok">Saved.</span>}
          {state?.error && <span className="text-[12px] text-danger">{state.error}</span>}
          {fetchError && <span className="text-[12px] text-danger">{fetchError}</span>}
        </div>

        <p className="mt-3.5 border-t border-line-soft pt-3 text-[12.5px] leading-relaxed text-muted">
          Everything is totalled in dinars. These are the rates used when you enter something in
          euros or dollars — the rate is stored with each entry, so past months never move when you
          update them here.
        </p>
      </form>
    </Panel>
  );
}

function SeedButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await seedDefaults();
          router.refresh();
        })
      }
      className={buttonClasses("primary")}
    >
      <Sparkles className="h-4 w-4" />
      {pending ? "Setting up…" : "Start me off with the basics"}
    </button>
  );
}

export function SetupView({
  accounts,
  categories,
  rates,
  ratesUpdatedOn,
  customColors,
}: {
  accounts: AccountBalance[];
  categories: MoneyCategory[];
  rates: { EUR: number; USD: number };
  ratesUpdatedOn: string | null;
  customColors: string[];
}) {
  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");
  const empty = accounts.length === 0 && categories.length === 0;
  const onHand = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="mx-auto max-w-220 space-y-5">
      <div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
          Setup
        </h1>
        <p className="text-[12.5px] text-muted">
          Where your money sits, what you call your spending, and what a euro is worth today.
        </p>
      </div>

      {empty && (
        <div className="flex flex-col gap-3 rounded-card border border-gold/25 bg-active-bg px-4 py-3.5 min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between">
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
              <AccountRow key={a.id} account={a} />
            ))}
          </div>
        )}
        <AccountRow />
      </Panel>

      <Panel
        className="overflow-visible"
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
              <CategoryRow key={c.id} category={c} kind="expense" custom={customColors} />
            ))}
          </div>
        )}
        <CategoryRow kind="expense" custom={customColors} />
      </Panel>

      <Panel
        className="overflow-visible"
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
              <CategoryRow key={c.id} category={c} kind="income" custom={customColors} />
            ))}
          </div>
        )}
        <CategoryRow kind="income" custom={customColors} />
      </Panel>
    </div>
  );
}
