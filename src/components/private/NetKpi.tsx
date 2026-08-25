import { Kpi } from "@/components/ui/Kpi";
import { formatRsd, monthNetNote } from "@/lib/money";

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
  className,
}: {
  net: number;
  income: number;
  /** Net earmarked this month. Said here so its absence from the figure is deliberate. */
  saved?: number;
  className?: string;
}) {
  const note = monthNetNote(net, income);

  return (
    <Kpi
      className={className}
      label="Net for the month"
      value={formatRsd(net)}
      hint={
        <span className={note?.tone === "danger" ? "text-danger" : "text-muted"}>
          {note?.text}
          {note && saved > 0 && " · "}
          {/* Set aside on purpose does not belong in a figure about money that left. */}
          {saved > 0 && <>{formatRsd(saved)} also set aside</>}
        </span>
      }
    />
  );
}
