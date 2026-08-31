"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, HandCoins, Pencil, Plus, RotateCcw } from "lucide-react";
import { deleteLoan, settleLoan } from "@/app/(app)/private/actions";
import { buttonClasses } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListBar } from "@/components/ui/ListBar";
import { Panel } from "@/components/ui/Panel";
import { SlideOver } from "@/components/ui/SlideOver";
import { useMoney } from "@/lib/money/currency";
import { fold } from "@/lib/money/entry-search";
import { cn } from "@/lib/utils";
import type { LoanLine } from "@/lib/types";
import { DebtForm } from "./DebtForm";

export type DebtsPanel = { mode: "new" } | { mode: "edit"; debt: LoanLine } | null;

/** How a debt can be ordered. `asc` is the order as it is named. */
const SORTS = [
  { value: "size", label: "Biggest outstanding", reverse: "Smallest outstanding" },
  { value: "opened", label: "Newest", reverse: "Oldest" },
  { value: "name", label: "A to Z", reverse: "Z to A" },
];

/**
 * Every debt, in both directions, in one place.
 *
 * The Money screen carries a panel of the six biggest, and that is a summary: it answers
 * "how much do I owe" on the way past. This answers the other questions — which ones are
 * nearly paid off, what happened on that credit last year, what did I actually call this,
 * is that name right — and it is the only place a debt can be corrected at all.
 *
 * Not in the sidebar. Seven items is already a full rail, and a debt is not a place
 * somebody starts their day; it is somewhere you go from the figure that made you ask.
 * Both doors say what they open: the panel header on Money, and the two totals on the
 * overview's headline.
 */
export function DebtsView({ debts, panel }: { debts: LoanLine[]; panel: DebtsPanel }) {
  const { fmt, fmtShort } = useMoney();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [ways, setWays] = useState<string[]>([]);
  const [status, setStatus] = useState("open");
  const [sort, setSort] = useState("size");
  const [way, setWay] = useState<"asc" | "desc">("asc");
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const close = () => router.push("/private/debts");

  const settle = (id: string, done: boolean) =>
    startTransition(async () => {
      const result = await settleLoan(id, done);
      if (result?.error) setError(result.error);
      else {
        setError(null);
        router.refresh();
      }
    });

  const open = debts.filter((d) => d.settled_on == null);
  const closed = debts.filter((d) => d.settled_on != null);

  /*
    The two totals, apart rather than netted off. Being owed 10.000 by a friend does not
    pay a 450.000 credit, and one figure reading −440.000 would describe a situation
    nobody is in.
  */
  const owedToYou = open
    .filter((d) => d.direction === "lent")
    .reduce((s, d) => s + d.outstanding, 0);
  const youOwe = open
    .filter((d) => d.direction === "borrowed")
    .reduce((s, d) => s + d.outstanding, 0);

  const shown = useMemo(() => {
    const words = fold(query.trim()).split(/\s+/).filter(Boolean);
    const pool = status === "settled" ? closed : status === "all" ? debts : open;
    const kept = pool.filter((d) => {
      if (ways.length > 0 && !ways.includes(d.direction)) return false;
      if (words.length === 0) return true;
      const hay = fold(`${d.name} ${d.note ?? ""} ${d.opened_on}`);
      return words.every((w) => hay.includes(w));
    });

    const by = (a: LoanLine, b: LoanLine) => {
      if (sort === "name") return a.name.localeCompare(b.name, "sr");
      if (sort === "opened") return a.opened_on < b.opened_on ? 1 : -1;
      return b.outstanding - a.outstanding;
    };
    const sorted = [...kept].sort(by);
    return way === "desc" ? sorted.reverse() : sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debts, query, ways, status, sort, way]);

  const narrowed = query.trim() !== "" || ways.length > 0 || status !== "open";

  return (
    <div className="money-premium mx-auto max-w-300 space-y-5">
      <div className="money-page-head flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="money-page-kicker">Private wealth</span>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1.2px] text-ink sm:text-[38px]">
            Loans &amp; debts
          </h1>
          {/*
            The one sentence this page can write that no other page can. Debts sit outside
            every figure in the app except the account balance, and that is the fact people
            get wrong — money borrowed looks like income on a bank statement.
          */}
          <p className="mt-1 max-w-md text-[13px] leading-5 text-muted">
            Money lent is still yours; money borrowed is on the account but is not. Neither
            counts as income or spending anywhere in Zevern.
          </p>
        </div>
        <Link
          href="/private/debts?new=1"
          className={buttonClasses("primary", "money-premium-button")}
        >
          <Plus className="h-4 w-4" /> New debt
        </Link>
      </div>

      <div className="debt-totals">
        <div className="debt-total">
          <span className="debt-total-label">Owed to you</span>
          <span className="mono debt-total-value text-ok" title={fmt(owedToYou)}>
            {fmt(owedToYou)}
          </span>
          <span className="debt-total-count">
            {open.filter((d) => d.direction === "lent").length} open
          </span>
        </div>
        <div className="debt-total">
          <span className="debt-total-label">You owe</span>
          <span className="mono debt-total-value text-gold-hi" title={fmt(youOwe)}>
            {fmt(youOwe)}
          </span>
          <span className="debt-total-count">
            {open.filter((d) => d.direction === "borrowed").length} open
          </span>
        </div>
      </div>

      {error && <p className="text-[12px] text-danger">{error}</p>}

      <Panel
        title="Every debt"
        action={
          <span className="text-[11.5px] font-semibold whitespace-nowrap text-muted">
            {shown.length} of {debts.length}
          </span>
        }
      >
        <ListBar
          inPanel
          flush={false}
          query={query}
          onQuery={setQuery}
          searchLabel="Search debts…"
          filters={[
            {
              value: ways[0] ?? "",
              onChange: (next) => setWays(next ? [next] : []),
              values: ways,
              onValues: setWays,
              many: "directions",
              label: "Which way it runs",
              all: "Both directions",
              options: [
                { value: "lent", label: `Owed to you (${debts.filter((d) => d.direction === "lent").length})` },
                { value: "borrowed", label: `You owe (${debts.filter((d) => d.direction === "borrowed").length})` },
              ],
            },
            {
              value: status,
              onChange: setStatus,
              label: "Open or settled",
              all: "Open only",
              always: true,
              options: [
                { value: "settled", label: `Settled (${closed.length})` },
                { value: "all", label: `All ${debts.length}` },
              ],
            },
          ]}
          sort={{
            value: sort,
            onChange: setSort,
            label: "Order",
            options: SORTS,
            direction: way,
            onDirection: setWay,
          }}
          shown={shown.length}
          total={debts.length}
          alwaysClear={narrowed}
          onClear={() => {
            setQuery("");
            setWays([]);
            setStatus("open");
          }}
        />

        {debts.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No debts on file"
            description="Lend somebody money or take a credit, and it goes here. Nothing you record as a debt ever counts as income or spending."
          />
        ) : shown.length === 0 ? (
          <p className="px-4 py-6 text-[12.5px] text-muted">
            Nothing matches. All {debts.length} are still here — the search or the filter is
            hiding them.
          </p>
        ) : (
          <div className="debt-list">
            {shown.map((debt) => {
              const lent = debt.direction === "lent";
              const total = Number(debt.total_rsd) || 0;
              const share = total > 0 ? Math.min(debt.settled / total, 1) : 0;
              const done = debt.settled_on != null;
              const showing = openHistory === debt.id;

              return (
                <div key={debt.id} className={cn("debt-row", done && "is-done")}>
                  <div className="debt-row-head">
                    <span className="min-w-0">
                      <span className="debt-row-name">{debt.name}</span>
                      <span className="debt-row-sub">
                        {lent ? "Owed to you" : "You owe"}
                        {" · since "}
                        <span className="mono">{debt.opened_on}</span>
                        {debt.instalment && debt.instalmentsLeft != null && (
                          <>
                            {" · "}
                            {fmt(debt.instalment)} × {debt.instalmentsLeft} left
                          </>
                        )}
                        {done && (
                          <>
                            {" · settled "}
                            <span className="mono">{debt.settled_on}</span>
                          </>
                        )}
                      </span>
                    </span>

                    <span
                      className={cn("mono debt-row-amount", lent ? "text-ok" : "text-gold-hi")}
                      title={fmt(debt.outstanding)}
                    >
                      {fmt(debt.outstanding)}
                    </span>

                    <span className="debt-row-do">
                      <Link
                        href={`/private/debts?edit=${debt.id}`}
                        aria-label={`Edit ${debt.name}`}
                        title="Edit"
                        className="zv-rowctrl zv-rowctrl-sm"
                      >
                        <Pencil className="h-3.25 w-3.25" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => settle(debt.id, !done)}
                        disabled={pending}
                        className={buttonClasses(
                          "secondary",
                          "shrink-0 px-2.5 py-1 text-[11.5px] disabled:opacity-50",
                        )}
                      >
                        {done ? (
                          <>
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reopen
                          </>
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5" aria-hidden />
                            {lent ? "Collected" : "Settled"}
                          </>
                        )}
                      </button>
                      {/*
                        Deleting forgets the debt and keeps the movements: `loan_id` is
                        `on delete set null`, so what is lost is the fact that they
                        belonged together, not the fact that money moved.
                      */}
                      <DeleteButton
                        compact
                        label={`Delete ${debt.name}`}
                        confirmText="Forget this debt? The entries against it stay in the ledger — they just stop belonging to anything."
                        action={async () => {
                          const result = await deleteLoan(debt.id);
                          if (result?.error) setError(result.error);
                          else router.refresh();
                        }}
                      />
                    </span>
                  </div>

                  <div className="debt-bar" aria-hidden="true">
                    <span className="debt-bar-fill" style={{ width: `${share * 100}%` }} />
                  </div>

                  <div className="debt-row-foot">
                    <span>
                      {debt.settled > 0
                        ? `${fmt(debt.settled)} of ${fmt(total)} settled`
                        : `Nothing paid against ${fmtShort(total)} yet`}
                    </span>
                    {debt.movements.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOpenHistory(showing ? null : debt.id)}
                        aria-expanded={showing}
                        className="debt-row-more"
                      >
                        {showing
                          ? "Hide the movements"
                          : `${debt.movements.length} ${debt.movements.length === 1 ? "movement" : "movements"}`}
                      </button>
                    )}
                  </div>

                  {debt.note && <p className="debt-row-note">{debt.note}</p>}

                  {showing && (
                    <div className="debt-moves">
                      {debt.movements.map((m) => (
                        <div key={m.id} className="debt-move">
                          <span className="mono debt-move-on">{m.on}</span>
                          <span className="min-w-0 flex-1 truncate">{m.title ?? "—"}</span>
                          <span className="mono">{fmt(m.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.mode === "edit" ? "Edit debt" : "New debt"}
      >
        <DebtForm debt={panel?.mode === "edit" ? panel.debt : undefined} onDone={close} />
      </SlideOver>
    </div>
  );
}
