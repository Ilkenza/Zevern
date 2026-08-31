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
  RowMark,
  RowUses,
  SavedFlash,
  SwapLabel,
  categoryAddCols,
  field,
  rowMotion,
  useRowCommit,
  useSavedPulse,
} from "./kit";

export function CategoryRow({
  category,
  kind,
  arrived,
  uses = 0,
}: {
  category?: MoneyCategory;
  kind: "expense" | "income";
  arrived?: boolean;
  /** How many entries have been filed here — the fact that tells a real one from a typo. */
  uses?: number;
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
        "setup-row-premium",
        rowMotion,
        isNew
          ? "setup-cat-add rounded-b-card border-t border-line bg-white/[0.02] px-4 py-3.5"
          : "setup-cat is-quiet",
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

      <div className={isNew ? categoryAddCols : "setup-cat-in"}>
        {/*
          A saved category is a tile: mark, name, and how much has been filed here.

          It was a full-width row, and fifty-eight of those is four screens of one line
          each — every line the same shape, the same length, and mostly empty, so scrolling
          for one category meant reading past fifty-seven names one under the other. A tile
          holds exactly the same three things in a quarter of the width, which puts a whole
          screen of them in front of you at once. The list is not shorter; the distance the
          eye has to travel to find something in it is.

          The colour picker that used to sit in the row is gone — a category's colour is
          drawn nowhere, so the control asked for a decision that changed nothing. What
          replaced it is not another control: it is which one this is, and whether it has
          ever been used. The mark carries the second of those in its ring, so the figure
          beside it is only a figure, and an unused category says it with an empty space
          rather than with two more words.
        */}
        {category && <RowMark used={uses > 0} />}
        <input
          name="name"
          defaultValue={category?.name ?? ""}
          placeholder="Category name"
          aria-label="Category name"
          required
          className={cn(field, "w-full min-w-0 font-medium", !isNew && "setup-cat-name")}
        />

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
          <>
            {/*
              Save takes the count's place rather than sitting next to it. There is no room
              in a tile for both, and while you are mid-edit the count is not the thing you
              are looking at — a tile only ever needs to say one thing on that side, and
              which thing depends on whether there is work to keep.
            */}
            {commit.dirty || pending ? (
              <Button
                type="submit"
                variant="secondary"
                className="money-premium-button setup-cat-save px-2.5 py-1 text-[11.5px]"
                disabled={pending}
              >
                <SwapLabel pending={pending} idle="Save" busy="Saving…" />
              </Button>
            ) : (
              <RowUses count={uses} />
            )}
            <RowDelete
              onDelete={async () => {
                await deleteCategory(category.id);
              }}
              label={`Delete ${category.name}`}
              onLeaving={setLeaving}
            />
          </>
        )}
      </div>

      <RowError message={state?.error} />
      {saved > 0 && <SavedFlash key={saved} />}
    </form>
  );
}


