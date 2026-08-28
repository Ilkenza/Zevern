"use client";

import { useActionState, useState } from "react";
import { deleteCategory, saveCategory, type MoneyState } from "@/app/(app)/private/actions";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { MoneyCategory } from "@/lib/types";
import {
  AddCaption,
  RowDelete,
  RowError,
  SavedFlash,
  SwapLabel,
  categoryCols,
  field,
  rowMotion,
  useRowCommit,
  useSavedPulse,
} from "./kit";

export function CategoryRow({
  category,
  kind,
  arrived,
}: {
  category?: MoneyCategory;
  kind: "expense" | "income";
  arrived?: boolean;
}) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveCategory, undefined);
  const isNew = !category;
  const [leaving, setLeaving] = useState(false);
  const saved = useSavedPulse(category ? state : undefined);
  const commit = useRowCommit(!isNew);

  return (
    <form
      action={formAction}
      onInput={commit.onInput}
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

        {/*
          The colour picker is gone.

          A category's colour is no longer drawn anywhere — see `@/lib/money/tone` for
          why — so the control was asking for a decision that changed nothing on any
          screen. Goals lost theirs for the same reason and before this one.
        */}

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
          <div className="flex min-w-0 items-center justify-end gap-3">
            {/*
              Only while there is something to save. The column keeps its width either
              way, so the bin does not walk sideways when the button comes and goes.
            */}
            {(commit.dirty || pending) && (
              <Button
                type="submit"
                variant="secondary"
                className="money-premium-button w-full px-3 py-1.5 text-[12.5px] min-[480px]:w-21"
                disabled={pending}
              >
                <SwapLabel pending={pending} idle="Save" busy="Saving…" />
              </Button>
            )}
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

