import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, UserPlus, ArrowUpRight, ExternalLink } from "lucide-react";
import { getLead } from "@/lib/data/leads";
import { leadProfileUrl } from "@/lib/leads/profile-url";
import { getTemplates } from "@/lib/data/templates";
import { ComposeMessage } from "@/components/leads/ComposeMessage";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { deleteLead, convertLeadToClient } from "../actions";
import { leadStatusBadge, serviceLabel } from "@/lib/status";
import { formatCurrency, formatDate } from "@/lib/format";

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="mt-1 text-[14px] text-ink">{children}</div>
    </div>
  );
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const templates = await getTemplates();
  const badge = leadStatusBadge(lead.status);
  const profileUrl = leadProfileUrl(lead.channel, lead.contact);

  return (
    <div className="mx-auto max-w-300 space-y-6">
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-ink"
      
        transitionTypes={["zv-back"]}
      >
        <ArrowLeft className="h-4 w-4" />
        Leads
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-extrabold tracking-[-0.5px] text-ink">
            {lead.name}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge status={badge.variant}>{badge.label}</Badge>
            {lead.company && (
              <span className="text-[13px] text-muted">{lead.company}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lead.client_id ? (
            <Link
              href={`/clients/${lead.client_id}`}
              className={buttonClasses("secondary")}
            >
              <ArrowUpRight className="h-4 w-4" />
              View client
            </Link>
          ) : (
            <form action={convertLeadToClient.bind(null, lead.id)}>
              <Button type="submit" variant="primary">
                <UserPlus className="h-4 w-4" />
                Convert to client
              </Button>
            </form>
          )}
          <Link
            href={`/leads?edit=${lead.id}`}
            className={buttonClasses("secondary")}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
          <DeleteButton
            action={deleteLead.bind(null, lead.id)}
            confirmText={`Delete "${lead.name}"?`}
          />
        </div>
      </div>

      <Panel title="Details">
        <div className="grid grid-cols-2 gap-5 px-4 py-4 sm:grid-cols-3">
          <Stat label="Contact">
            {lead.contact ? (
              profileUrl ? (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-gold-hi hover:underline"
                >
                  {lead.contact}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                lead.contact
              )
            ) : (
              <span className="text-muted">—</span>
            )}
          </Stat>
          <Stat label="Channel">
            {lead.channel ? (
              <span className="capitalize">{lead.channel}</span>
            ) : (
              <span className="text-muted">—</span>
            )}
          </Stat>
          <Stat label="Service">
            {serviceLabel(lead.service) ?? (
              <span className="text-muted">—</span>
            )}
          </Stat>
          <Stat label="Est. value">
            <span className="mono">{formatCurrency(lead.value)}</span>
          </Stat>
          <Stat label="Last contacted">
            <span className="mono">{formatDate(lead.last_contact_at)}</span>
          </Stat>
          <Stat label="Next follow-up">
            <span className="mono">{formatDate(lead.next_followup)}</span>
          </Stat>
        </div>
      </Panel>

      <Panel title="Message (mail-merge)">
        <ComposeMessage lead={lead} templates={templates} />
      </Panel>

      {lead.notes && (
        <Panel title="Notes">
          <p className="whitespace-pre-wrap px-4 py-4 text-[13px] leading-relaxed text-muted">
            {lead.notes}
          </p>
        </Panel>
      )}
    </div>
  );
}
