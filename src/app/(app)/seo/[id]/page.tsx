import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { getCheck } from "@/lib/data/seo";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { deleteCheck } from "../actions";
import { scoreBadge, checkStatusMeta } from "@/lib/status";
import { formatDate } from "@/lib/format";
import { CHECK_INFO } from "@/lib/seo/explain";
import type { CheckResult } from "@/lib/types";

const ICONS = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
} as const;

export default async function CheckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const check = await getCheck(id);
  if (!check) notFound();

  const badge = scoreBadge(check.score);
  const scoreColor =
    check.score >= 80
      ? "text-ok"
      : check.score >= 50
        ? "text-gold"
        : "text-danger";

  return (
    <div className="mx-auto max-w-300 space-y-6">
      <Link
        href="/seo"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-ink"
      
        transitionTypes={["zv-back"]}
      >
        <ArrowLeft className="h-4 w-4" />
        SEO / GEO
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {check.title && (
            <h1 className="truncate font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
              {check.title}
            </h1>
          )}
          <a
            href={check.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mono mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-gold-hi hover:underline"
          >
            {check.url}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <p className="mono mt-1 text-[11.5px] text-faint">
            Checked {formatDate(check.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/seo?url=${encodeURIComponent(check.url)}`}
            className={buttonClasses("secondary")}
          >
            <RotateCw className="h-4 w-4" />
            Check again
          </Link>
          <DeleteButton
            action={deleteCheck.bind(null, check.id)}
            confirmText="Delete this check?"
          />
        </div>
      </div>

      <div className="flex items-center gap-6 rounded-card border border-line bg-surface px-6 py-5">
        <div className="text-center">
          <div
            className={`mono text-[40px] font-bold leading-none ${scoreColor}`}
          >
            {check.score}
          </div>
          <div className="mt-1 text-[11px] text-faint">/ 100</div>
        </div>
        <div>
          <Badge status={badge.variant}>{badge.label}</Badge>
          <p className="mt-2 text-[12.5px] text-muted">
            On-page SEO + AI/GEO readiness across {check.results.length} checks.
          </p>
        </div>
      </div>

      <Panel title="Findings">
        <p className="border-b border-line-soft px-4 py-2.5 text-[11.5px] text-muted">
          Click an item to see what it means, why it matters, and an example.
        </p>
        <div>
          {check.results.map((r: CheckResult) => {
            const meta = checkStatusMeta(r.status);
            const Icon = ICONS[r.status] ?? AlertTriangle;
            const info = CHECK_INFO[r.key];
            return (
              <details
                key={r.key}
                className="group border-b border-line-soft last:border-b-0 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 hover:bg-white/2">
                  <Icon
                    className={`mt-0.5 h-4.25 w-4.25 shrink-0 ${meta.color}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-ink">
                      {r.label}
                    </div>
                    <div className="text-[12px] text-muted">{r.detail}</div>
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-semibold uppercase ${meta.color}`}
                  >
                    {meta.label}
                  </span>
                </summary>
                {(info || r.found) && (
                  <div className="space-y-2.5 px-4 pb-3.5 pl-11">
                    {info?.why && (
                      <p className="text-[11.5px] leading-relaxed text-muted">
                        {info.why}
                      </p>
                    )}
                    {r.found && (
                      <div>
                        <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
                          Your page
                        </div>
                        <pre className="mono overflow-x-auto rounded-ctrl border border-line-soft bg-white/3 px-3 py-2 text-[11px] leading-relaxed text-ink/90">
                          {r.found}
                        </pre>
                      </div>
                    )}
                    {info?.example && (
                      <div>
                        <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
                          Example (recommended)
                        </div>
                        <pre className="mono overflow-x-auto rounded-ctrl border border-line-soft bg-white/3 px-3 py-2 text-[11px] leading-relaxed text-ink/90">
                          {info.example}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </details>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
