"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { Button, buttonClasses } from "@/components/ui/Button";
import { renderTemplate, type MergeLead } from "@/lib/leads/merge";
import type { OutreachTemplate } from "@/lib/types";

export function ComposeMessage({
  lead,
  templates,
}: {
  lead: MergeLead;
  templates: OutreachTemplate[];
}) {
  const [templateId, setTemplateId] = useState("");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  const pick = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    setText(t ? renderTemplate(t.body, lead) : "");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  };

  if (templates.length === 0) {
    return (
      <div className="px-4 py-4 text-[13px] text-muted">
        No templates yet.{" "}
        <Link href="/leads/templates" className="text-gold-hi hover:underline">
          Create one
        </Link>{" "}
        with variables like <code className="mono">{"{name}"}</code>,{" "}
        <code className="mono">{"{company}"}</code> to reuse it here.
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 py-4">
      <Select
        label="Template"
        name="template"
        value={templateId}
        onChange={(e) => pick(e.target.value)}
        placeholder="Choose a template…"
        options={templates.map((t) => ({ value: t.id, label: t.title }))}
      />

      {templateId && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full rounded-ctrl border border-line bg-white/[0.035] px-3 py-2.5 text-[13px] leading-relaxed text-ink focus:border-gold focus:shadow-ring focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="primary" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy message"}
            </Button>
            <Link href="/leads/templates" className={buttonClasses("secondary")}>
              Edit templates
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
