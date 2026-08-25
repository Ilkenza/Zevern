"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Wrench, Pencil, ExternalLink, Tag } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, buttonClasses } from "@/components/ui/Button";
import type { Tool } from "@/lib/types";
import { ToolForm } from "./ToolForm";
import { CategoryForm } from "./CategoryForm";
import { addStarterTools } from "@/app/(app)/toolbox/actions";

export type ToolboxPanel =
  | { mode: "new" }
  | { mode: "edit"; tool: Tool }
  | { mode: "category"; name: string }
  | null;

export function ToolboxView({
  tools,
  categories,
  panel,
}: {
  tools: Tool[];
  categories: string[];
  panel: ToolboxPanel;
}) {
  const router = useRouter();
  const close = () => router.push("/toolbox");

  const groups = new Map<string, Tool[]>();
  for (const t of tools) {
    const cat = t.category?.trim() || "Other";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(t);
  }
  const groupKeys = [...groups.keys()].sort((a, b) =>
    a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b),
  );

  return (
    <div className="mx-auto max-w-275">
      <PageHeader
        kicker="Your kit"
        title="Toolbox"
        lede="The links, logins and licences you keep having to go and find."
        stats={[
          { label: "Tools", value: String(tools.length) },
          { label: "Categories", value: String(categories.length), tone: "gold" },
        ]}
        actions={
          <Link href="/toolbox?new=1" className={buttonClasses("primary", "zv-turn")}>
            <Plus className="h-4 w-4" />
            New tool
          </Link>
        }
      />

      {tools.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Wrench}
            title="No tools yet"
            description="Keep the services you use to build sites in one place (hosting, DB, design, email…)."
            action={
              <form action={addStarterTools}>
                <Button type="submit" variant="primary">
                  Add starter tools
                </Button>
              </form>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-6">
          {groupKeys.map((cat) => (
            <div key={cat}>
              <div className="group/cat mb-2 flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
                  {cat}
                </span>
                {cat !== "Other" && (
                  <Link
                    href={`/toolbox?cat=${encodeURIComponent(cat)}`}
                    aria-label={`Edit category ${cat}`}
                    className="inline-flex items-center gap-1 rounded-ctrl border border-line px-1.5 py-0.5 text-[10.5px] font-semibold text-muted transition-colors hover:border-muted hover:text-ink"
                  >
                    <Tag className="h-3 w-3" />
                    Edit
                  </Link>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groups.get(cat)!.map((t) => (
                  <div
                    key={t.id}
                    className="group rounded-card border border-line bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      {t.url ? (
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink hover:text-gold-hi"
                        >
                          {t.name}
                          <ExternalLink className="h-3.5 w-3.5 text-faint" />
                        </a>
                      ) : (
                        <span className="text-[14px] font-bold text-ink">
                          {t.name}
                        </span>
                      )}
                      <Link
                        href={`/toolbox?edit=${t.id}`}
                        aria-label={`Edit ${t.name}`}
                        className="shrink-0 rounded-ctrl p-1 text-faint opacity-0 transition-opacity hover:bg-white/5 hover:text-ink group-hover:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3,5" />
                      </Link>
                    </div>
                    {t.notes && (
                      <p className="mt-1.5 text-[12px] text-muted">{t.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={
          panel?.mode === "category"
            ? "Edit category"
            : panel?.mode === "edit"
              ? "Edit tool"
              : "New tool"
        }
      >
        {panel?.mode === "category" ? (
          <CategoryForm name={panel.name} />
        ) : (
          <ToolForm
            tool={panel?.mode === "edit" ? panel.tool : undefined}
            categories={categories}
          />
        )}
      </SlideOver>
    </div>
  );
}
