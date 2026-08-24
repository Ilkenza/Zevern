"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Sparkles, RefreshCw } from "lucide-react";
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
import { Button, buttonClasses } from "@/components/ui/Button";
import { ACCOUNT_KIND_OPTIONS, CURRENCIES, SWATCHES, formatRsd } from "@/lib/money";
import type { MoneyCategory } from "@/lib/types";
import type { AccountBalance } from "@/lib/data/money";

const input =
  "rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-gold focus:outline-none";

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
      className="rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-danger"
    >
      <Trash2 className="h-3.75 w-3.75" />
    </button>
  );
}

function AccountRow({ account }: { account?: AccountBalance }) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveAccount, undefined);
  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 last:border-b-0"
    >
      {account && <input type="hidden" name="id" value={account.id} />}
      <input
        name="name"
        defaultValue={account?.name ?? ""}
        placeholder="Account name"
        aria-label="Account name"
        required
        className={`${input} min-w-40 flex-1`}
      />
      <select
        name="kind"
        defaultValue={account?.kind ?? "bank"}
        aria-label="Account type"
        className={`${input} scheme-dark`}
      >
        {ACCOUNT_KIND_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#1A1D24]">
            {o.label}
          </option>
        ))}
      </select>
      <select
        name="currency"
        defaultValue={account?.currency ?? "RSD"}
        aria-label="Currency"
        className={`${input} scheme-dark`}
      >
        {CURRENCIES.map((c) => (
          <option key={c} value={c} className="bg-[#1A1D24]">
            {c}
          </option>
        ))}
      </select>
      <input
        name="opening_balance"
        defaultValue={account ? String(account.opening_balance) : ""}
        placeholder="Opening"
        aria-label="Opening balance"
        inputMode="decimal"
        className={`${input} w-28 text-right`}
      />
      {account && (
        <span className="mono w-28 text-right text-[12px] text-muted">
          {formatRsd(account.balance)}
        </span>
      )}
      <Button type="submit" variant="secondary" className="px-3 py-1.5" disabled={pending}>
        {pending ? "…" : account ? "Save" : "Add"}
      </Button>
      {account && (
        <RowDelete
          onDelete={async () => {
            await deleteAccount(account.id);
          }}
          label={`Delete ${account.name}`}
        />
      )}
      {state?.error && <span className="w-full text-[11px] text-danger">{state.error}</span>}
    </form>
  );
}

function CategoryRow({ category, kind }: { category?: MoneyCategory; kind: "expense" | "income" }) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveCategory, undefined);
  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 last:border-b-0"
    >
      {category && <input type="hidden" name="id" value={category.id} />}
      <input type="hidden" name="kind" value={category?.kind ?? kind} />
      <input
        name="name"
        defaultValue={category?.name ?? ""}
        placeholder="Category name"
        aria-label="Category name"
        required
        className={`${input} min-w-40 flex-1`}
      />
      <div className="flex gap-1.5">
        {SWATCHES.map((color) => (
          <label key={color} className="cursor-pointer">
            <input
              type="radio"
              name="color"
              value={color}
              defaultChecked={(category?.color ?? SWATCHES[0]) === color}
              className="peer sr-only"
            />
            <span
              className="block h-5 w-5 rounded-full border-2 border-transparent peer-checked:border-ink"
              style={{ background: color }}
            />
          </label>
        ))}
      </div>
      <Button type="submit" variant="secondary" className="px-3 py-1.5" disabled={pending}>
        {pending ? "…" : category ? "Save" : "Add"}
      </Button>
      {category && (
        <RowDelete
          onDelete={async () => {
            await deleteCategory(category.id);
          }}
          label={`Delete ${category.name}`}
        />
      )}
      {state?.error && <span className="w-full text-[11px] text-danger">{state.error}</span>}
    </form>
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
    <form action={formAction} className="space-y-3 px-4 py-4">
      <p className="text-[13px] leading-relaxed text-muted">
        Everything is totalled in dinars. These are the rates used when you enter something in
        euros or dollars — the rate is stored with each entry, so past months never move when you
        update them here.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-[#C6CAD6]">
          1 EUR =
          <input
            name="rate_eur"
            defaultValue={String(eur)}
            inputMode="decimal"
            className={`${input} ml-2 w-28`}
          />
        </label>
        <label className="text-xs font-semibold text-[#C6CAD6]">
          1 USD =
          <input
            name="rate_usd"
            defaultValue={String(usd)}
            inputMode="decimal"
            className={`${input} ml-2 w-28`}
          />
        </label>
        <Button type="submit" variant="primary" disabled={pending || fetching}>
          {pending ? "Saving…" : "Save rates"}
        </Button>
        <button
          type="button"
          onClick={pull}
          disabled={fetching || pending}
          className={buttonClasses("secondary")}
        >
          <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
          {fetching ? "Fetching…" : "Today's NBS rate"}
        </button>
      </div>
      <p className="mono text-[11.5px] text-faint">
        {updatedOn ? `Rate list of ${updatedOn}` : "Rates have never been updated"}
        {stale && (
          <span className="ml-2 text-draft">
            — not today&apos;s, pull the NBS rate before you trust a total in dinars
          </span>
        )}
      </p>
      {state?.ok && <p className="text-[12px] text-ok">Saved.</p>}
      {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
      {fetchError && <p className="text-[12px] text-danger">{fetchError}</p>}
    </form>
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
}: {
  accounts: AccountBalance[];
  categories: MoneyCategory[];
  rates: { EUR: number; USD: number };
  ratesUpdatedOn: string | null;
}) {
  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");
  const empty = accounts.length === 0 && categories.length === 0;

  return (
    <div className="mx-auto max-w-220 space-y-6">
      <div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
          Setup
        </h1>
        <p className="text-[12.5px] text-muted">Accounts, categories and exchange rates.</p>
      </div>

      {empty && (
        <Panel>
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <h3 className="text-[14px] font-semibold text-ink">Nothing set up yet</h3>
            <p className="max-w-sm text-[12.5px] text-muted">
              One tap creates a cash account, a bank account and a sensible set of categories. You
              can rename or delete any of them afterwards.
            </p>
            <SeedButton />
          </div>
        </Panel>
      )}

      <Panel title="Exchange rates">
        <RatesPanel eur={rates.EUR} usd={rates.USD} updatedOn={ratesUpdatedOn} />
      </Panel>

      <Panel title="Accounts">
        <div>
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
          <AccountRow />
        </div>
      </Panel>

      <Panel title="Expense categories">
        <div>
          {expense.map((c) => (
            <CategoryRow key={c.id} category={c} kind="expense" />
          ))}
          <CategoryRow kind="expense" />
        </div>
      </Panel>

      <Panel title="Income categories">
        <div>
          {income.map((c) => (
            <CategoryRow key={c.id} category={c} kind="income" />
          ))}
          <CategoryRow kind="income" />
        </div>
      </Panel>
    </div>
  );
}
