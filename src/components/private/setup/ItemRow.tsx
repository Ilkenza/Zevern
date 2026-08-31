"use client";

import { useActionState, useState } from "react";
import { deleteItem, saveItem, type MoneyState } from "@/app/(app)/private/actions";
import { Button } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";
import { cn } from "@/lib/utils";
import { CURRENCY_OPTIONS } from "@/lib/money";
import type { MoneyCategory, MoneyItem } from "@/lib/types";
import {
  AddCaption,
  RowDelete,
  RowError,
  RowMark,
  SavedFlash,
  SwapLabel,
  field,
  rowMotion,
  useRowCommit,
  useSavedPulse,
} from "./kit";

/**
 * One thing you buy: what it is called, and what it cost last time.
 *
 * The price is a suggestion and the row says so by leaving it optional — half of what
 * anybody buys has no fixed price, and a field that insists on one turns "remember this
 * name" into "guess a number".
 *
 * The category is here for the same reason the price is: picking the thing on an entry
 * form should fill in where it gets filed, because that is the rest of the same keystroke.
 */
export function ItemRow({
  item,
  categories,
  arrived,
}: {
  item?: MoneyItem;
  categories: MoneyCategory[];
  arrived?: boolean;
}) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveItem, undefined);
  const isNew = !item;
  const [leaving, setLeaving] = useState(false);
  const saved = useSavedPulse(item ? state : undefined);
  const commit = useRowCommit(!isNew);

  return (
    <form
      action={formAction}
      onInput={commit.onInput}
      onBlur={commit.onBlur}
      className={cn(
        "setup-row-premium",
        rowMotion,
        isNew
          ? "setup-cat-add rounded-b-card border-t border-line bg-white/[0.02] px-4 py-3.5"
          : "setup-item is-quiet",
        arrived && "zv-row-in",
        leaving && "translate-x-1 opacity-0",
      )}
    >
      {isNew && <AddCaption>Add something you buy</AddCaption>}
      {item && <input type="hidden" name="id" value={item.id} />}

      <div className={isNew ? "setup-item-add-in" : "setup-item-in"}>
        {item && <RowMark used={(item.uses ?? 0) > 0} />}

        <input
          name="name"
          defaultValue={item?.name ?? ""}
          placeholder="Rozi sok"
          aria-label="What it is called"
          required
          className={cn(field, "w-full min-w-0 font-medium", !isNew && "setup-cat-name")}
        />

        <MoneyField
          name="price"
          defaultValue={item?.price ?? ""}
          placeholder="Price"
          aria-label="What it cost last time"
          className="mb-0"
          inputClassName={cn(field, "w-full min-w-0 text-right")}
        />

        <select
          name="currency"
          defaultValue={item?.currency ?? "RSD"}
          aria-label="Currency"
          className={cn(field, "scheme-dark")}
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value} className="bg-surface">
              {c.label}
            </option>
          ))}
        </select>

        <select
          name="category_id"
          defaultValue={item?.category_id ?? ""}
          aria-label="Where it gets filed"
          className={cn(field, "scheme-dark min-w-0")}
        >
          <option value="" className="bg-surface">
            No category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id} className="bg-surface">
              {c.name}
            </option>
          ))}
        </select>

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
          <div className="flex min-w-0 items-center justify-end gap-2">
            {(commit.dirty || pending) && (
              <Button
                type="submit"
                variant="secondary"
                className="money-premium-button px-2.5 py-1 text-[11.5px]"
                disabled={pending}
              >
                <SwapLabel pending={pending} idle="Save" busy="Saving…" />
              </Button>
            )}
            <RowDelete
              onDelete={async () => {
                await deleteItem(item.id);
              }}
              label={`Remove ${item.name} from the list`}
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
