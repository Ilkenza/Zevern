"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { removeTransaction } from "@/app/(app)/private/actions";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { useMoney } from "@/lib/money/currency";
import { weighLoanMove } from "@/lib/money/loan-progress";
import { cn } from "@/lib/utils";
import type { LoanLine } from "@/lib/types";

/**
 * What has actually happened on a debt.
 *
 * The goals have had this for as long as they have had a card, and the debts had a
 * stripe of three columns on one screen and nothing at all on the other two — no sign,
 * no account, no way to take a mistyped payment back out. A debt is the one figure in
 * this app that is worked out from its entries every time it is read, so the entries are
 * the answer to every question the figure raises, and "which 30.776" is the first of
 * them.
 *
 * So it is the goals' history, in a debt's words. Same shape, same fold, same delete —
 * two screens that answer the same question should not answer it two ways.
 */
function MoveRow({ move, debt }: { move: LoanLine["movements"][number]; debt: LoanLine }) {
  const { fmt } = useMoney();
  const [error, setError] = useState<string | null>(null);
  /*
    The sign is read off the same rule the figure above it is.

    `weighLoanMove` says whether a movement pays the debt down, takes a payment back, or
    is the one that opened it — and printing a `+` where that says `-1` would be a row
    disagreeing with the total it is standing under. The opening movement is the reason
    this is three answers rather than two: real money moved, and none of it was
    repayment.
  */
  const weight = weighLoanMove(debt.direction, move.kind);
  const opening = weight === 0;
  const back = weight < 0;

  return (
    <div className="border-b border-line-soft py-1.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="mono shrink-0 text-[11px] text-faint">{move.on}</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">
          {move.title || move.account || "No account"}
          {move.title && move.account ? ` · ${move.account}` : ""}
          {move.recurring ? " · instalment" : ""}
          {opening ? " · opened it" : ""}
        </span>
        <span
          className={cn(
            "mono shrink-0 text-[12px] font-semibold",
            opening ? "text-faint" : back ? "text-muted" : "text-ink",
          )}
        >
          {/* The opening movement gets no sign at all, because it is neither. */}
          {opening ? "" : back ? "− " : "+ "}
          {fmt(move.amount)}
        </span>
        <DeleteButton
          compact
          label="Delete this movement"
          confirmText={`Remove ${fmt(move.amount)} of ${move.on} from ${debt.name}? The entry leaves the ledger and every balance — and what this debt says is left — is worked out without it.`}
          action={async () => {
            const result = await removeTransaction(move.id);
            if (result?.error) setError(result.error);
          }}
        />
      </div>
      {error && <p className="pb-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

/** How many movements a fold shows before it starts being a ledger of its own. */
const LIMIT = 8;

export function DebtHistory({ debt }: { debt: LoanLine }) {
  const { fmt } = useMoney();
  const [open, setOpen] = useState(false);
  const lent = debt.direction === "lent";

  /*
    A debt nobody has paid anything against still says where the payments will go.

    This used to return nothing at all, which reads as a missing feature rather than an
    empty one: a fresh credit with an instalment plan set up showed no history, no
    heading, no hint that a history is where payments will appear — so the first question
    it got was "where is the history". A line answers that, and a line rather than a fold,
    because a fold that opens onto nothing is a worse answer than the sentence.

    What it does *not* say is that nothing has been paid. It said that once, and on the
    Debts screen it landed directly under `Nothing paid against 123k yet' — two greys, one
    fact, stacked. The row above owns the fact; this owns the place.
  */
  if (debt.movements.length === 0)
    return (
      <p className="goal-history border-t border-line-soft px-5 py-2 text-[11.5px] text-faint">
        Every {lent ? "repayment" : "payment"} against this debt will be listed here.
      </p>
    );
  const shown = debt.movements.slice(0, LIMIT);

  return (
    <div className="goal-history border-t border-line-soft px-5 py-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="goal-history-trigger flex w-full items-center gap-1.5 text-left text-[11.5px] font-semibold text-muted transition-colors hover:text-ink"
      >
        <History className="h-3.25 w-3.25 shrink-0" aria-hidden />
        {debt.movements.length} {debt.movements.length === 1 ? "movement" : "movements"}
        {debt.settled > 0 && (
          <span className="text-faint">
            · {fmt(debt.settled)} {lent ? "collected" : "paid"}
          </span>
        )}
        <span className="ml-auto shrink-0">
          {open ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </span>
      </button>

      {open && (
        <div className="goal-history-content mt-1">
          {shown.map((move) => (
            <MoveRow key={move.id} move={move} debt={debt} />
          ))}
          <p className="pt-2 text-[11px] text-faint">
            {debt.movements.length > LIMIT
              ? `The last ${LIMIT} of ${debt.movements.length}. Every one of these is an entry in Money.`
              : "Every one of these is an entry in Money."}
          </p>
        </div>
      )}
    </div>
  );
}
