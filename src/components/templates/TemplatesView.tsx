"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ArrowLeft, Pencil, FileText } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import type { OutreachTemplate } from "@/lib/types";
import { CopyButton } from "./CopyButton";
import { TemplateForm } from "./TemplateForm";

export type TemplatesPanel =
  | { mode: "new" }
  | { mode: "edit"; template: OutreachTemplate }
  | null;

export function TemplatesView({
  templates,
  panel,
}: {
  templates: OutreachTemplate[];
  panel: TemplatesPanel;
}) {
  const router = useRouter();
  const close = () => router.push("/leads/templates");

  return (
    <div className="mx-auto max-w-225">
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-ink"
      
        transitionTypes={["zv-back"]}
      >
        <ArrowLeft className="h-4 w-4" />
        Leads
      </Link>

      <PageHeader
        className="mt-3"
        kicker="The first message"
        title="Message templates"
        lede="Write the approach once; the variables fill themselves in per lead."
        stats={[{ label: "Templates", value: String(templates.length) }]}
        actions={
          <Link href="/leads/templates?new=1" className={buttonClasses("primary", "zv-turn")}>
            <Plus className="h-4 w-4" />
            New template
          </Link>
        }
      />

      {templates.length === 0 ? (
        <Panel>
          <EmptyState
            icon={FileText}
            title="No templates yet"
            description="Save reach-out messages and copy them in one click."
            action={
              <Link
                href="/leads/templates?new=1"
                className={buttonClasses("primary")}
              >
                New template
              </Link>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-card border border-line bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[14px] font-bold text-ink">{t.title}</h3>
                <div className="flex shrink-0 items-center gap-2">
                  <CopyButton text={t.body} />
                  <Link
                    href={`/leads/templates?edit=${t.id}`}
                    aria-label={`Edit ${t.title}`}
                    className="inline-flex rounded-ctrl p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
                  >
                    <Pencil className="h-3.75 w-3.75" />
                  </Link>
                </div>
              </div>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">
                {t.body}
              </p>
            </div>
          ))}
        </div>
      )}

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.mode === "edit" ? "Edit template" : "New template"}
      >
        <TemplateForm
          template={panel?.mode === "edit" ? panel.template : undefined}
        />
      </SlideOver>
    </div>
  );
}
