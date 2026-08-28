"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Star } from "lucide-react";
import {
  deleteAccount,
  saveAccount,
  setAccountOnOverview,
  setDefaultAccount,
  type MoneyState,
} from "@/app/(app)/private/actions";
import { Button } from "@/components/ui/Button";
import { ACCOUNT_KIND_OPTIONS, CURRENCIES, formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { AccountBalance } from "@/lib/data/money";
import { useDefaultCurrency, useMoney } from "@/lib/money/currency";
import {
  AddCaption,
  RowDelete,
  RowError,
  SavedFlash,
  SwapLabel,
  accountCols,
  caps,
  field,
  rowMotion,
  useRowCommit,
  useSavedPulse,
} from "./kit";

/**
 * Which account every form should start on.
 *
 * A star rather than a "Default" button, because it is a state before it is an action:
 * filled means this is the one, and there is exactly one filled star on the screen.
 */
function DefaultStar({ account }: { account: AccountBalance }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const on = account.is_default;

  return (
    <button
      type="button"
      disabled={pending || on}
      onClick={() =>
        startTransition(async () => {
          await setDefaultAccount(account.id);
          router.refresh();
        })
      }
      aria-pressed={on}
      aria-label={on ? `${account.name} is the default account` : `Make ${account.name} the default`}
      title={
        on
          ? "Every form starts on this account"
          : `Start every form on ${account.name} instead`
      }
      className={cn("zv-rowctrl", on && "zv-rowctrl-on")}
    >
      <Star className={cn("h-3.75 w-3.75", on && "fill-current")} />
    </button>
  );
}

/** Whether this account occupies one of the two compact slots on Overview. */
function OverviewEye({
  account,
  onError,
}: {
  account: AccountBalance;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const on = typeof account.overview_rank === "number";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setAccountOnOverview(account.id, !on);
          onError(result?.error ?? null);
          if (!result?.error) router.refresh();
        })
      }
      aria-pressed={on}
      aria-label={on ? `Hide ${account.name} from Overview` : `Show ${account.name} on Overview`}
      title={on ? "Shown on Overview — click to hide" : "Show on Overview — up to two accounts"}
      className={cn("zv-rowctrl", on && "zv-rowctrl-on")}
    >
      {on ? <Eye className="h-3.75 w-3.75" /> : <EyeOff className="h-3.75 w-3.75" />}
    </button>
  );
}

/** The amount box, shared by the composer and by an account still showing its opening figure. */
function AmountBox({
  defaultValue,
  label,
}: {
  defaultValue: string;
  label: string;
}) {
  return (
    <input
      name="opening_balance"
      defaultValue={defaultValue}
      placeholder="0"
      aria-label={label}
      inputMode="decimal"
      className={cn(field, "mono w-full min-w-0 text-right")}
    />
  );
}

/**
 * The money on the account, as one column rather than two.
 *
 * It used to be two boxes side by side — "Opening" and "Balance now" — with equal
 * weight and the first of them permanently editable. That was two problems in one
 * control. It kept a figure from the day you signed up on screen forever, competing
 * for attention with the only figure that is actually true today; and it left the
 * tempting fix for any difference between the app and the bank sitting right there,
 * where using it silently rewrites every balance the app has ever shown, past months
 * included.
 *
 * So the column shows one number, and which number it is depends on whether the
 * account has been used. Untouched, the opening balance *is* the balance — one
 * editable box, and no second figure repeating it. Once entries exist, the balance is
 * the computed one and the opening figure steps down to a footnote, still reachable
 * because a typo on day one has to be fixable, but no longer the obvious lever.
 */
function BalanceCell({ account }: { account: AccountBalance }) {
  const { fmt } = useMoney();
  const [editing, setEditing] = useState(false);
  const fresh = account.entries === 0;

  if (fresh) {
    return (
      <div className="flex items-center justify-between gap-2 min-[720px]:justify-end">
        <span className={cn(caps, "min-[720px]:hidden")}>Balance</span>
        <AmountBox defaultValue={String(account.opening_balance)} label="Starting balance" />
      </div>
    );
  }

  return (
    <div className="setup-bal">
      <span className={cn(caps, "min-[720px]:hidden")}>Balance</span>
      <div className="setup-bal-side">
        <span className={cn("setup-bal-now", account.balance < 0 && "is-short")}>
          {fmt(account.balance)}
        </span>
        {editing ? (
          <AmountBox
            defaultValue={String(account.opening_balance)}
            label={`Starting balance for ${account.name}`}
          />
        ) : (
          <>
            {/* Still submitted, so saving a name change cannot blank the figure. */}
            <input
              type="hidden"
              name="opening_balance"
              value={String(account.opening_balance)}
            />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="setup-bal-note"
              title="Change what this account started with"
            >
              started with {formatAmount(Number(account.opening_balance), account.currency)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function AccountRow({ account, arrived }: { account?: AccountBalance; arrived?: boolean }) {
  const fallback = useDefaultCurrency();
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveAccount, undefined);
  const isNew = !account;
  const [leaving, setLeaving] = useState(false);
  const [warn, setWarn] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  // The composer confirms by producing a row, not by lighting itself up.
  const saved = useSavedPulse(account ? state : undefined);
  const commit = useRowCommit(!isNew);

  return (
    <form
      action={formAction}
      onInput={(e) => {
        // The one field on this row whose edit reaches backwards through the ledger.
        if ((e.target as HTMLElement).getAttribute?.("name") === "opening_balance" && account) {
          setWarn(true);
        }
        commit.onInput();
      }}
      onBlur={commit.onBlur}
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

        {/*
          Its own control now. It used to be welded to the right-hand side of the
          opening-balance box, which was defensible while that box was always there —
          the currency is a property of the money in the account, not a separate
          question. It is not always there any more, and a control that disappears when
          an unrelated one does is a control nobody can find.
        */}
        <select
          name="currency"
          defaultValue={account?.currency ?? fallback}
          aria-label="Currency"
          className={cn(field, "mono w-full font-semibold scheme-dark")}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c} className="bg-surface">
              {c}
            </option>
          ))}
        </select>

        {account ? (
          <BalanceCell account={account} />
        ) : (
          <div className="flex items-center justify-between gap-2 min-[720px]:justify-end">
            <span className={cn(caps, "min-[720px]:hidden")}>Balance</span>
            <AmountBox defaultValue="" label="Starting balance" />
          </div>
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
          <div className="flex items-center justify-end gap-3">
            <OverviewEye account={account} onError={setOverviewError} />
            <DefaultStar account={account} />
            {/* Only while there is something to save — see `useRowCommit`. */}
            {(commit.dirty || pending) && (
              <Button
                type="submit"
                variant="secondary"
                className="money-premium-button w-21 px-3 py-1.5 text-[12.5px]"
                disabled={pending}
              >
                <SwapLabel pending={pending} idle="Save" busy="Saving…" />
              </Button>
            )}
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

      {/*
        Said at the moment it can still be undone, not in the column head where it would
        be read once and never again. The starting figure sits under every balance the
        app has ever printed, so moving it moves last March as well as today — and the
        thing people actually want when today's figure is wrong is an entry for the
        difference, which is a normal expense or income with a category of its own.
      */}
      {warn && (
        <p className="setup-open-warn">
          This moves every balance in the app, past months included. If it is only
          today&apos;s figure that is off, add an entry for the difference instead.
        </p>
      )}

      <RowError message={state?.error} />
      <RowError message={overviewError ?? undefined} />
      {saved > 0 && <SavedFlash key={saved} />}
    </form>
  );
}

export function AccountHead() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "hidden border-b border-line-soft bg-white/[0.02] px-4 py-2",
        "min-[720px]:grid min-[720px]:grid-cols-[minmax(0,1fr)_8.5rem_5.5rem_11rem_9.5rem] min-[720px]:items-center min-[720px]:gap-3",
      )}
    >
      <span className={caps}>Account</span>
      <span className={caps}>Type</span>
      <span className={caps}>Currency</span>
      <span className={cn(caps, "text-right")}>Balance</span>
      <span />
    </div>
  );
}
