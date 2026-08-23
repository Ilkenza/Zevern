"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Repeat, Plus, Pencil } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { formatAmount } from "@/lib/money";
import type { MoneyAccount, MoneyCategory, MoneyRecurring, RecurringRow } from "@/lib/types";
import { RecurringForm } from "./RecurringForm";
import { DueRecurringPanel } from "./DueRecurringPanel";

export type RecurringPanel =
  | { mode: "new" }
  | { mode: "edit"; item: MoneyRecurring }
  | null;

export function RecurringView({
  items,
  due,
  accounts,
  categories,
  panel,
}: {
  items: RecurringRow[];
  due: RecurringRow[];
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
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
              <div
                key={item.id}
                className="group flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0 hover:bg-white/2"
              >
                <span
                  className="h-7 w-1 shrink-0 rounded-pill"
                  style={{ background: item.category?.color ?? "#565c6b" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{item.name}</div>
                  <div className="mono truncate text-[11.5px] text-muted">
                    next {item.next_on} · {item.every} · {item.account?.name ?? "No account"}
                  </div>
                </div>
                {item.variable ? (
                  <Badge status="info">Variable</Badge>
                ) : (
                  <span className="mono text-[13px] font-semibold text-ink">
                    {formatAmount(Number(item.amount), item.currency)}
                  </span>
                )}
                {!item.active && <Badge status="draft">Paused</Badge>}
                <Link
                  href={`/private/recurring?edit=${item.id}`}
                  aria-label={`Edit ${item.name}`}
                  className="inline-flex rounded-ctrl p-1.5 text-faint opacity-0 transition-opacity hover:bg-white/5 hover:text-ink group-hover:opacity-100"
                >
                  <Pencil className="h-3.75 w-3.75" />
                </Link>
              </div>
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
