"use client";

import { useActionState, useState } from "react";
import { deleteCategory, saveCategory, type MoneyState } from "@/app/(app)/private/actions";
import { Button } from "@/components/ui/Button";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { SWATCHES } from "@/lib/money";
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
  useSavedPulse,
} from "./kit";

export function CategoryRow({
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
          <div className="flex min-w-0 items-center justify-end gap-1">
            <Button
              type="submit"
              variant="secondary"
              className="money-premium-button w-full px-3 py-1.5 text-[12.5px] min-[480px]:w-21"
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

