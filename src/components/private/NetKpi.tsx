"use client";

import Link from "next/link";
import { Kpi } from "@/components/ui/Kpi";
import { monthNetNote, type NetScope } from "@/lib/money";
import { useMoney } from "@/lib/money/currency";

/**
 * The month's net, said in a way that cannot be mistaken for a balance.
 *
 * One component rather than the same block written twice, because the two screens that
 * show this figure — Money and the Private overview — had drifted into two different
 * labels and two different warnings for the identical number.
 *
 * The name carries the fix. "Left over" reads as "what I have left", which put it in
 * direct contradiction with the account balance sitting beside it; "Net for the month"
 * says it is a month, and the note underneath says which month behaviour produced it.
 */
export function NetKpi({
  net,
  income,
  saved = 0,
  incomeOnFile = true,
  scope = "month",
  className,
}: {
  net: number;
  income: number;
  /** Net earmarked this month. Said here so its absence from the figure is deliberate. */
  saved?: number;
  /**
   * Whether anything at all is on file as income — a booking or a standing rule.
   *
   * Without it the note cannot tell a profile that has never said what comes in from
   * one whose pay simply lands later in the month, and the two need opposite words:
   * the first is a gap to close, the second is Tuesday.
   */
  incomeOnFile?: boolean;
  /**
   * Which stretch the figure covers, which is also what it is called.
   *
   * `Net for the month` over four years of ledger is the same class of mistake as a note
   * about "this month" under it: the label is part of the number.
   */
  scope?: NetScope;
  className?: string;
}) {
  const { fmt } = useMoney();
  const note = monthNetNote(net, income, incomeOnFile, scope);

  return (
    <Kpi
      className={className}
      label={
        scope === "all" ? "Net total" : scope === "span" ? "Net for these dates" : "Net for the month"
      }
      value={fmt(net)}
      hint={
        <span className={note?.tone === "danger" ? "text-danger" : "text-muted"}>
          {note?.text}
          {/*
            The one case with something to do about it gets a way to do it. The other
            two are statements of fact and a link on them would be an invitation to fix
            a month that is not broken.
          */}
          {note?.setup && (
            <>
              {" · "}
              <Link href="/private/setup#setup-earning" className="zv-net-fix">
                add what comes in
              </Link>
            </>
          )}
          {note && saved > 0 && " · "}
          {/* Set aside on purpose does not belong in a figure about money that left. */}
          {saved > 0 && <>{fmt(saved)} also set aside</>}
        </span>
      }
    />
  );
}

