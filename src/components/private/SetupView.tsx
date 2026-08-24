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

/**
 * How a row leaves: it fades and drifts a little towards the trash it was sent
 * to, so the gap that opens a moment later reads as a row that left rather than
 * a row that vanished. `translate` and not `transform`, because that is the
 * property Tailwind's translate utilities set. `relative` is here for the save
 * confirmation, which is an overlay on the row.
 */
const rowMotion =
  "relative transition-[opacity,translate] duration-150 ease-out motion-reduce:transition-none";

const NONE: ReadonlySet<string> = new Set();

type Arrivals = { key: string; ids: ReadonlySet<string>; fresh: ReadonlySet<string> };

/**
 * The ids that turned up after the first render — the rows the user just added.
 * Whatever was already on screen when the page loaded is never "new", so
 * arriving at Setup animates nothing; only adding something does.
 *
 * The comparison happens during render, not in an effect: the new row has to
 * carry the class the very first time it paints, or it would sit there for a
 * frame and then start fading in from nothing.
 */
function useArrived(ids: string[]): ReadonlySet<string> {
  const key = ids.join(",");
  const [seen, setSeen] = useState<Arrivals>(() => ({ key, ids: new Set(ids), fresh: NONE }));

  if (seen.key !== key) {
    setSeen({
      key,
      ids: new Set(ids),
      fresh: new Set(ids.filter((id) => !seen.ids.has(id))),
    });
  }

  return seen.fresh;
}

/**
 * Counts the saves a row has reported. The count is the key on the confirmation,
 * so saving the same row twice replays it instead of leaving a finished
 * animation on screen. A new result from the action is a new object, which is
 * what makes a second identical save countable at all.
 */
function useSavedPulse(state: MoneyState): number {
  const [seen, setSeen] = useState<{ state: MoneyState; pulse: number }>({ state, pulse: 0 });

  if (seen.state !== state) {
    setSeen({ state, pulse: state?.ok ? seen.pulse + 1 : seen.pulse });
  }

  return seen.pulse;
}

/** The receipt for a save: a tint over the row, held long enough to read, then gone. */
function SavedFlash() {
  return (
    <span
      aria-hidden="true"
      className="zv-row-saved pointer-events-none absolute inset-0 bg-active-bg"
    />
  );
}

/**
 * The two faces of a button that can be busy, stacked in one grid cell. The
 * button is therefore as wide as the longer label from the start, so "Save"
 * turning into "Saving…" never moves anything next to it. The faces cross-fade;
 * under reduced motion they simply swap.
 */
function SwapLabel({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  const face =
    "col-start-1 row-start-1 transition-opacity duration-150 ease-out motion-reduce:transition-none";
  return (
    <span className="grid text-center whitespace-nowrap">
      <span aria-hidden={pending} className={cn(face, pending && "opacity-0")}>
        {idle}
      </span>
      <span aria-hidden={!pending} className={cn(face, !pending && "opacity-0")}>
        {busy}
      </span>
    </span>
  );
}

function RowDelete({
  onDelete,
  label,
  onLeaving,
}: {
  onDelete: () => Promise<void>;
  label: string;
  onLeaving?: (leaving: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={label}
      disabled={pending}
      onClick={() => {
        // The row starts leaving on the click rather than on the answer, so the
        // gap that opens when the data comes back reads as "that one left"
        // instead of as a row that blinked out of existence.
        onLeaving?.(true);
        startTransition(async () => {
          try {
            await onDelete();
          } catch (error) {
            onLeaving?.(false); // it did not leave after all
            throw error;
          }
          router.refresh();
        });
      }}
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

function AccountRow({ account, arrived }: { account?: AccountBalance; arrived?: boolean }) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveAccount, undefined);
  const isNew = !account;
  const [leaving, setLeaving] = useState(false);
  // The composer confirms by producing a row, not by lighting itself up.
  const saved = useSavedPulse(account ? state : undefined);

  return (
    <form
      action={formAction}
      className={cn(
        "setup-row-premium px-4",
        rowMotion,
        isNew
          ? "rounded-b-card border-t border-line bg-white/[0.02] py-3.5"
          : "border-b border-line-soft py-2.5 last:border-b-0",
        arrived && "zv-row-in",
        leaving && "translate-x-1 opacity-0",
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
              className="money-premium-button w-full px-3 py-1.5 text-[12.5px]"
              disabled={pending}
            >
              <SwapLabel pending={pending} idle="Add" busy="Adding…" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="submit"
              variant="secondary"
              className="money-premium-button w-21 px-3 py-1.5 text-[12.5px]"
              disabled={pending}
            >
              <SwapLabel pending={pending} idle="Save" busy="Saving…" />
            </Button>
            <RowDelete
              onDelete={async () => {
                await deleteAccount(account.id);
              }}
              label={`Delete ${account.name}`}
              onLeaving={setLeaving}
            />
          </div>
        )}
      </div>

      <RowError message={state?.error} />
      {saved > 0 && <SavedFlash key={saved} />}
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
  arrived,
}: {
  category?: MoneyCategory;
  kind: "expense" | "income";
  custom: string[];
  arrived?: boolean;
}) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveCategory, undefined);
  const isNew = !category;
  const [leaving, setLeaving] = useState(false);
  const saved = useSavedPulse(category ? state : undefined);

  return (
    <form
      action={formAction}
      className={cn(
        "setup-row-premium px-4",
        rowMotion,
        isNew
          ? "rounded-b-card border-t border-line bg-white/[0.02] py-3.5"
          : "border-b border-line-soft py-2.5 last:border-b-0",
        arrived && "zv-row-in",
        leaving && "translate-x-1 opacity-0",
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

        {/* zv-picker: the popover inside grows out of this swatch (globals.css). */}
        <div className="zv-picker justify-self-start">
          <ColorPicker name="color" value={category?.color ?? SWATCHES[0]} custom={custom} />
        </div>

        {isNew ? (
          <Button
            type="submit"
            variant="primary"
            className="money-premium-button w-full px-3 py-1.5 text-[12.5px]"
            disabled={pending}
          >
            <SwapLabel pending={pending} idle="Add" busy="Adding…" />
          </Button>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="submit"
              variant="secondary"
            className="money-premium-button w-21 px-3 py-1.5 text-[12.5px]"
              disabled={pending}
            >
              <SwapLabel pending={pending} idle="Save" busy="Saving…" />
            </Button>
            <RowDelete
              onDelete={async () => {
                await deleteCategory(category.id);
              }}
              label={`Delete ${category.name}`}
              onLeaving={setLeaving}
            />
          </div>
        )}
      </div>

      <RowError message={state?.error} />
      {saved > 0 && <SavedFlash key={saved} />}
    </form>
  );
}

/** A rate is a figure first: big, mono, and editable in place. */
function RateTile({ code, name, value }: { code: string; name: string; value: number }) {
  // Pulling the NBS rate changes this figure while the reader is looking at it.
  // That change is the entire answer to the button they pressed, so the new
  // figure arrives rather than replacing the old one between two frames. It
  // clears itself when the animation ends, so the next pull animates too.
  const [shown, setShown] = useState<{ value: number; landed: boolean }>({ value, landed: false });

  if (shown.value !== value) {
    setShown({ value, landed: true });
  }

  return (
    <label className="setup-rate-tile block rounded-card border border-line bg-surface-2 px-3.5 py-3">
      <span className={caps}>1 {code} in dinars</span>
      <input
        name={name}
        defaultValue={String(value)}
        inputMode="decimal"
        aria-label={`Dinars for one ${code}`}
        onAnimationEnd={() => setShown({ value, landed: false })}
        className={cn(
          "mono mt-1 w-full rounded-ctrl border border-transparent bg-transparent px-1 py-0.5 text-[22px] font-semibold tracking-[-0.5px] text-ink hover:border-line focus:border-gold focus:shadow-ring",
          shown.landed && "zv-figure-in",
        )}
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
      className="setup-panel setup-rates-panel"
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
            className={buttonClasses("secondary", "money-premium-button")}
          >
            <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
            <SwapLabel pending={fetching} idle="Today's NBS rate" busy="Fetching…" />
          </button>
          <Button type="submit" variant="primary" className="money-premium-button" disabled={pending || fetching}>
            <SwapLabel pending={pending} idle="Save rates" busy="Saving…" />
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
      className={buttonClasses("primary", "money-premium-button")}
    >
      <Sparkles className="h-4 w-4" />
      <SwapLabel pending={pending} idle="Start me off with the basics" busy="Setting up…" />
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
            Build the structure once — accounts, categories and rates keep every money view accurate.
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
    </div>
  );
}
