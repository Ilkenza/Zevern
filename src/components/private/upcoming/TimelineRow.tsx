"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Flag, Pencil, Repeat, TriangleAlert, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatRsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ForecastLine } from "@/lib/data/money";
import { ShortfallActions } from "../ShortfallActions";
import { daysBetween, planHref, shortfallLevers, whenLabel } from "./index";
import { Dot, Marker, caps } from "./ui";

/**
 * The one thing on this screen that cannot wait: the first date the free money runs
 * out. It gets its own card above everything else, with the figure at headline size,
 * the item that tips it over, the amount that would have to arrive to stop it — and
 * the moves that would actually change the date.
 *
 * Free, not total — money already put aside for a goal is not available to pay a bill,
 * so counting it here would hide the day this actually happens.
 */
export function Shortfall({
  line,
  low,
  from,
  reserved,
  lines,
  index,
}: {
  line: ForecastLine;
  low: ForecastLine;
  from: string;
  reserved: number;
  lines: ForecastLine[];
  index: number;
}) {
  const when = whenLabel(daysBetween(from, line.on));
  const deeper = low.on !== line.on && low.balance < line.balance;
  const levers = shortfallLevers(lines, index, from);

  return (
    <section className="overflow-hidden rounded-card border border-danger/40 bg-danger-bg">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <TriangleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13.5px] font-bold text-danger">
            You run out of free money on <span className="mono">{line.on}</span>
          </h2>

          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="mono text-[26px] font-semibold tracking-[-0.5px] text-danger">
              {formatRsd(line.balance)}
            </span>
            <span className="text-[12.5px] text-muted">
              after{" "}
              {line.source === "everyday"
                ? `${line.days} ${line.days === 1 ? "day" : "days"} of everyday spending`
                : line.name}
              {when && <> · {when}</>}
            </span>
          </div>

          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            <span className="mono text-ink">{formatRsd(-line.balance)}</span> has to come in
            before then.
            {deeper && (
              <>
                {" "}
                It keeps falling after that — down to{" "}
                <span className="mono text-ink">{formatRsd(low.balance)}</span> on{" "}
                <span className="mono">{low.on}</span>.
              </>
            )}
            {reserved > 0 && (
              <>
                {" "}
                There is <span className="mono text-ink">{formatRsd(reserved)}</span> set aside
                for goals on top of this. Close a goal or take money back out and it counts
                again.
              </>
            )}
          </p>
        </div>
      </div>

      <ShortfallActions levers={levers} on={line.on} />
    </section>
  );
}

/**
 * The bookings an estimate was averaged from — dates and amounts, from the row that
 * uses them. An average of six readings can hide one freak winter bill, and there is no
 * way to tell a steady figure from a dragged one without seeing the readings.
 */
function EstimateDetail({ line }: { line: ForecastLine }) {
  const amounts = line.samples.map((s) => s.amount);
  const lowest = Math.min(...amounts);
  const highest = Math.max(...amounts);
  const spread = highest - lowest;

  return (
    <div className="mt-2 rounded-ctrl border border-line-soft bg-white/[0.02] px-3 py-2">
      <div className={caps}>
        Averaged from the last {line.samples.length}{" "}
        {line.samples.length === 1 ? "booking" : "bookings"}
      </div>
      <div className="mt-1.5 space-y-0.5">
        {line.samples.map((s, i) => (
          <div
            key={`${s.on}-${i}`}
            className="flex items-baseline justify-between gap-3 text-[11.5px]"
          >
            <span className="mono text-muted">{s.on}</span>
            <span className="mono text-faint">{formatRsd(s.amount)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
        Lowest <span className="mono">{formatRsd(lowest)}</span>, highest{" "}
        <span className="mono">{formatRsd(highest)}</span>
        {spread > 0 ? (
          <>
            {" "}
            — <span className="mono">{formatRsd(spread)}</span> between them. The timeline uses
            the average of all {line.samples.length}.
          </>
        ) : (
          <> — every one the same. The timeline uses that figure.</>
        )}
      </p>
    </div>
  );
}

/** One due date: what it is, when it lands, what it costs, what it leaves behind. */
export function Row({ line, from }: { line: ForecastLine; from: string }) {
  const [open, setOpen] = useState(false);
  const days = daysBetween(from, line.on);
  const when = whenLabel(days);
  const income = line.kind === "income";
  const everyday = line.source === "everyday";
  const planned = line.source === "planned";
  const inspectable = line.samples.length > 0;

  return (
    <div
      className={cn(
        "flex items-start gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0",
        everyday && "bg-white/[0.015]",
      )}
    >
      <Marker source={line.source} color={line.color} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {planned && <Flag aria-hidden="true" className="h-3.25 w-3.25 shrink-0 text-muted" />}
          {everyday && (
            <Utensils aria-hidden="true" className="h-3.25 w-3.25 shrink-0 text-faint" />
          )}
          <span
            className={cn(
              "min-w-0 truncate text-[13.5px]",
              everyday ? "font-normal text-muted" : "font-medium text-ink",
            )}
          >
            {line.name}
          </span>

          {!everyday && days !== null && days < 0 && <Badge status="danger">Not booked yet</Badge>}
          {!everyday && days === 0 && <Badge status="active">Today</Badge>}
          {everyday && <Badge status="draft">Projection</Badge>}

          {/* The estimate opens onto the bookings it was averaged from — six readings
              hide one freak winter bill, and the average alone cannot show that. */}
          {!everyday &&
            line.estimated &&
            (inspectable ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-label={`${open ? "Hide" : "Show"} the bookings behind the estimate for ${line.name}`}
                className="inline-flex items-center rounded-pill transition-opacity hover:opacity-80"
              >
                <Badge status="info">
                  Estimate
                  {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Badge>
              </button>
            ) : (
              <Badge status="info">Estimate</Badge>
            ))}

          {planned && (
            <Link
              href={planHref(line.id)}
              aria-label={`Edit ${line.name}`}
              title={`Edit ${line.name}`}
              className="zv-rowctrl zv-rowctrl-sm"
            >
              <Pencil className="h-3.25 w-3.25" />
            </Link>
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted">
          <span className="mono">{line.on}</span>
          {everyday ? (
            <>
              <Dot />
              <span>
                {line.days} {line.days === 1 ? "day" : "days"} of ordinary living
              </span>
            </>
          ) : (
            <>
              {when && (
                <>
                  <Dot />
                  <span>{when}</span>
                </>
              )}
              <Dot />
              {line.goal ? (
                <span className="min-w-0 truncate text-held">Into {line.goal}</span>
              ) : (
                <span className="min-w-0 truncate">{line.category ?? "No category"}</span>
              )}
              <Dot />
              <span className="inline-flex items-center gap-1 text-faint">
                {line.source === "recurring" ? (
                  <>
                    <Repeat aria-hidden="true" className="h-3 w-3" />
                    Repeats
                  </>
                ) : (
                  <>One-off</>
                )}
              </span>
            </>
          )}
        </div>

        {open && inspectable && <EstimateDetail line={line} />}
      </div>

      <div className="shrink-0 text-right">
        <div
          className={cn(
            "mono text-[13.5px] font-semibold",
            income
              ? "text-ok"
              : everyday
                ? "text-muted"
                : line.goal
                  ? "text-held"
                  : line.estimated
                    ? "text-muted"
                    : "text-ink",
          )}
        >
          {income ? "+" : "−"} {formatRsd(line.amount)}
        </div>
        <div className={cn("mono text-[11px]", line.balance < 0 ? "text-danger" : "text-faint")}>
          <span className="sr-only">leaves </span>
          {formatRsd(line.balance)}
        </div>
      </div>
    </div>
  );
}

