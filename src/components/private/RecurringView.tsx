"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Repeat, Plus, Pencil, Pause, Play } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Kpi } from "@/components/ui/Kpi";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { buttonClasses } from "@/components/ui/Button";
import { removeRecurring, toggleRecurring } from "@/app/(app)/private/actions";
import { formatAmount, formatRsd } from "@/lib/money";
import type { RecurringTotals } from "@/lib/data/money";
import type { MoneyAccount, MoneyCategory, MoneyRecurring, RecurringRow } from "@/lib/types";
import { RecurringForm } from "./RecurringForm";
import { DueRecurringPanel } from "./DueRecurringPanel";

export type RecurringPanel =
  | { mode: "new" }
  | { mode: "edit"; item: MoneyRecurring }
  | null;


function ItemRow({ item }: { item: RecurringRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const flip = () => {
    startTransition(async () => {
      await toggleRecurring(item.id, !item.active);
      router.refresh();
    });
  };

  const total = item.installments_total;
  const done = item.installments_done ?? 0;
  const settled = total != null && done >= total;

  return (
    <div className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0 hover:bg-white/2">
      <span
        className="h-7 w-1 shrink-0 rounded-pill"
        style={{ background: item.category?.color ?? "#565c6b" }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold text-ink">{item.name}</div>
        <div className="mono truncate text-[11.5px] text-muted">
          next {item.next_on} · {item.every} · {item.account?.name ?? "No account"}
          {item.ends_on ? ` · until ${item.ends_on}` : ""}
        </div>
      </div>
      {total != null && (
        <Badge status={settled ? "ok" : "draft"}>
          {settled ? `Paid off · ${total}/${total}` : `${done}/${total}`}
        </Badge>
      )}
      {item.variable ? (
        <Badge status="info">Variable</Badge>
      ) : (
        <span className="mono text-[13px] font-semibold text-ink">
          {formatAmount(Number(item.amount), item.currency)}
        </span>
      )}
      {!item.active && !settled && <Badge status="draft">Paused</Badge>}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={flip}
          disabled={pending}
          aria-label={item.active ? `Pause ${item.name}` : `Resume ${item.name}`}
          title={item.active ? "Pause — stop booking this one" : "Resume"}
          className="inline-flex cursor-pointer rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {item.active ? <Pause className="h-3.75 w-3.75" /> : <Play className="h-3.75 w-3.75" />}
        </button>
        <Link
          href={`/private/recurring?edit=${item.id}`}
          aria-label={`Edit ${item.name}`}
          title="Edit"
          className="inline-flex rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
        >
          <Pencil className="h-3.75 w-3.75" />
        </Link>
        <DeleteButton
          compact
          label={`Delete ${item.name}`}
          confirmText="Delete this recurring item? It stops repeating from now on — entries already booked from it stay in Money."
          action={async () => {
            await removeRecurring(item.id);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}

export function RecurringView({
  items,
  due,
  accounts,
  categories,
  totals,
  panel,
}: {
  items: RecurringRow[];
  due: RecurringRow[];
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  totals: RecurringTotals;
  panel: RecurringPanel;
}) {
  const router = useRouter();
  const close = () => router.push("/private/recurring");

  return (
    <div className="mx-auto max-w-220 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
            Recurring
          </h1>
          <p className="text-[12.5px] text-muted">
            Fixed ones book themselves. Variable ones ask for the amount.
          </p>
        </div>
        <Link href="/private/recurring?new=1" className={buttonClasses("primary")}>
          <Plus className="h-4 w-4" />
          New
        </Link>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi
            label="Per month"
            value={formatRsd(totals.expense)}
            hint={
              totals.estimated > 0 || totals.unknown > 0 ? (
                <>
                  {totals.estimated > 0 &&
                    `${totals.estimated} estimated from past bills`}
                  {totals.estimated > 0 && totals.unknown > 0 && " · "}
                  {totals.unknown > 0 && (
                    <span className="text-draft">
                      {totals.unknown} variable, no history yet
                    </span>
                  )}
                </>
              ) : (
                "Active items only"
              )
            }
          />
          <Kpi
            label="Next 12 months"
            value={formatRsd(totals.yearExpense)}
            hint={`${totals.yearCount} ${totals.yearCount === 1 ? "payment" : "payments"} due by ${totals.yearHorizon}`}
          />
          {totals.income > 0 && (
            <Kpi
              label="Net per month"
              value={formatRsd(totals.net)}
              hint={`Income ${formatRsd(totals.income)}`}
            />
          )}
        </div>
      )}

      <DueRecurringPanel due={due} />

      <Panel>
        {items.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="Nothing recurring yet"
            description="Hosting, domains, subscriptions, rent — enter each once and never type it again."
            action={
              <Link href="/private/recurring?new=1" className={buttonClasses("primary")}>
                Add one
              </Link>
            }
          />
        ) : (
          <div>
            {items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </Panel>

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.mode === "edit" ? "Edit recurring" : "New recurring"}
      >
        <RecurringForm
          item={panel?.mode === "edit" ? panel.item : undefined}
          accounts={accounts}
          categories={categories}
        />
      </SlideOver>
    </div>
  );
}
