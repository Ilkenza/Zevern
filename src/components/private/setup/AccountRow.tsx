"use client";

import { useActionState, useState } from "react";
import { deleteAccount, saveAccount, type MoneyState } from "@/app/(app)/private/actions";
import { Button } from "@/components/ui/Button";
import { ACCOUNT_KIND_OPTIONS, CURRENCIES, formatRsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { AccountBalance } from "@/lib/data/money";
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
  useSavedPulse,
} from "./kit";

export function AccountRow({ account, arrived }: { account?: AccountBalance; arrived?: boolean }) {
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

export function AccountHead() {
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

