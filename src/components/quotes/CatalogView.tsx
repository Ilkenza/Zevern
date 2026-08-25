"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, LayoutList, ArrowLeft } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, buttonClasses } from "@/components/ui/Button";
import { formatMoney } from "@/lib/format";
import type { ServiceItem } from "@/lib/types";
import { ServiceItemForm } from "./ServiceItemForm";
import { addStarterFeatures } from "@/app/(app)/quotes/catalog/actions";

export type CatalogPanel =
  | { mode: "new" }
  | { mode: "edit"; item: ServiceItem }
  | null;

export function CatalogView({
  items,
  panel,
}: {
  items: ServiceItem[];
  panel: CatalogPanel;
}) {
  const router = useRouter();
  const close = () => router.push("/quotes/catalog");

  return (
    <div className="mx-auto max-w-225">
      <Link
        href="/quotes"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-ink"
      
        transitionTypes={["zv-back"]}
      >
        <ArrowLeft className="h-4 w-4" />
        Quotes
      </Link>

      <PageHeader
        className="mt-3"
        kicker="What a quote is built from"
        title="Feature catalog"
        lede="Price a thing once here and every quote after it costs one click."
        stats={[{ label: "Features", value: String(items.length) }]}
        actions={
          <Link href="/quotes/catalog?new=1" className={buttonClasses("primary", "zv-turn")}>
            <Plus className="h-4 w-4" />
            Add feature
          </Link>
        }
      />

      <Panel>
        {items.length === 0 ? (
          <EmptyState
            icon={LayoutList}
            title="No features yet"
            description="Add the things you offer (form, login, Stripe…) with prices, then reuse them in quotes."
            action={
              <form action={addStarterFeatures}>
                <Button type="submit" variant="primary">
                  Add starter features
                </Button>
              </form>
            }
          />
        ) : (
          <div>
            {items.map((it) => (
              <div
                key={it.id}
                className="zv-row group flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-ink">
                    {it.label}
                  </div>
                  {it.category && (
                    <div className="text-[11.5px] text-muted">
                      {it.category}
                    </div>
                  )}
                </div>
                <span className="mono shrink-0 text-right text-[12px] text-ink">
                  {[
                    it.price_rsd != null
                      ? formatMoney(it.price_rsd, "RSD")
                      : null,
                    it.price_eur != null
                      ? formatMoney(it.price_eur, "EUR")
                      : null,
                    it.price_usd != null
                      ? formatMoney(it.price_usd, "USD")
                      : null,
                  ]
                    .filter(Boolean)
                    .map((s, i) => (
                      <span key={i} className="ml-2 whitespace-nowrap">
                        {s}
                      </span>
                    ))}
                  {it.price_rsd == null &&
                    it.price_eur == null &&
                    it.price_usd == null && (
                      <span className="text-faint">—</span>
                    )}
                </span>
                <Link
                  href={`/quotes/catalog?edit=${it.id}`}
                  aria-label={`Edit ${it.label}`}
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
        title={panel?.mode === "edit" ? "Edit feature" : "New feature"}
      >
        <ServiceItemForm
          item={panel?.mode === "edit" ? panel.item : undefined}
        />
      </SlideOver>
    </div>
  );
}
