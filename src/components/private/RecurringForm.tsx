"use client";

import { useActionState, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, PiggyBank } from "lucide-react";
import { saveRecurring, deleteRecurring, type MoneyState } from "@/app/(app)/private/actions";
import { Field } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { ChipPicker } from "@/components/ui/ChipPicker";
import { PeriodPicker, type PeriodUnit } from "@/components/ui/PeriodPicker";
import { CURRENCY_OPTIONS, anchorDayFor, nextDate } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { LoanLine, MoneyAccount, MoneyCategory, MoneyGoal, MoneyRecurring } from "@/lib/types";
import { todayISO } from "@/lib/format";
import { useDefaultCurrency } from "@/lib/money/currency";

/** A quiet rule with a word on it — the panel's only structure, and it costs one line. */
function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 mb-3 flex items-center gap-2.5 first:mt-0">
      <span className="text-[10.5px] font-bold tracking-[0.6px] text-faint uppercase">
        {children}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/**
 * What kind of thing repeats.
 *
 * Three selects used to answer this between them — a goal picker whose empty option read
 * "Nothing — this is a bill", a type dropdown, and a loan picker — and you had to read
 * all three to know what you were looking at. They are one question: does money leave,
 * arrive, or move aside. Answering it in one tap is also what lets the rest of the panel
 * show only the fields that answer means anything for.
 */
const MODES = [
  { value: "expense", label: "Bill", icon: ArrowUpRight, hint: "Money leaves" },
  { value: "income", label: "Income", icon: ArrowDownLeft, hint: "Money arrives" },
  { value: "goal", label: "Into a goal", icon: PiggyBank, hint: "Set aside" },
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}`;
}

export function RecurringForm({
  item,
  accounts,
  categories,
  goals,
  loans,
}: {
  item?: MoneyRecurring;
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  goals: MoneyGoal[];
  /** Open debts, so a rule can be declared the instalment plan of one. */
  loans: LoanLine[];
}) {
  const fallback = useDefaultCurrency();
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(
    saveRecurring,
    undefined,
  );
  const [variable, setVariable] = useState(item?.variable ?? false);
  const [goalId, setGoalId] = useState(item?.goal_id ?? "");
  const [mode, setMode] = useState<string>(item?.goal_id ? "goal" : (item?.kind ?? "expense"));
  const [every, setEvery] = useState<PeriodUnit>((item?.every as PeriodUnit) ?? "month");
  const [everyCount, setEveryCount] = useState(item?.every_count ?? 1);
  const [endsWhen, setEndsWhen] = useState(item?.ends_when ?? "never");
  const [nextOn, setNextOn] = useState(item?.next_on ?? todayISO());
  const [accountIds, setAccountIds] = useState<string[]>(
    item?.account_id ? [item.account_id] : accounts[0] ? [accounts[0].id] : [],
  );

  // A standing order into a goal is not a bill: it has no category, it is never income,
  // and its amount is decided by you rather than by a meter reading.
  const toGoal = mode === "goal";
  const kind = toGoal ? "expense" : mode;

  const categoryOptions = categories
    .filter((c) => c.kind === kind)
    .map((c) => ({ value: c.id, label: c.name }));
  const goalOptions = goals.map((g) => ({ value: g.id, label: g.name }));
  // Only the ones you owe. A rule that repeats cannot collect a debt from a friend —
  // that is one movement whenever it happens, not a standing arrangement.
  const loanOptions = loans
    .filter((l) => l.settled_on == null && l.direction === "borrowed")
    .map((l) => ({ value: l.id, label: l.name }));

  /*
    The next three dates, walked with the same function that will actually book them.

    A cadence is the one field here you cannot check by reading it back: "every 3 months
    from the 31st" is four words that could mean several things, and the way to find out
    used to be to save it and wait until February. Three dates settle it before you
    commit — and because they come out of `nextDate` rather than out of a rule of thumb,
    what is shown is what will happen.
  */
  const preview = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextOn)) return [];
    const anchor = anchorDayFor(nextOn, every);
    const out = [nextOn];
    let on = nextOn;
    for (let i = 0; i < 2; i++) {
      on = nextDate(on, every, anchor, everyCount);
      out.push(on);
    }
    return out;
  }, [nextOn, every, everyCount]);

  return (
    <div className="flex h-full flex-col">
      <form action={formAction} className="flex-1">
        {item && <input type="hidden" name="id" value={item.id} />}
        <input type="hidden" name="kind" value={kind} />
        {toGoal && <input type="hidden" name="goal_id" value={goalId} />}

        <Divider>What repeats</Divider>

        <Field
          label="Name"
          name="name"
          defaultValue={item?.name ?? ""}
          placeholder={toGoal ? "Rent fund" : "Claude subscription"}
          autoFocus
          required
        />

        <div className="mb-3.25 grid grid-cols-3 gap-1.5">
          {MODES.map((m) => {
            const on = mode === m.value;
            const usable = m.value !== "goal" || goalOptions.length > 0;
            return (
              <button
                key={m.value}
                type="button"
                disabled={!usable}
                onClick={() => {
                  setMode(m.value);
                  if (m.value !== "goal") setGoalId("");
                  else if (!goalId) setGoalId(goalOptions[0]?.value ?? "");
                }}
                aria-pressed={on}
                className={cn(
                  "zv-press rounded-ctrl border px-2 py-2.5 text-center transition-colors",
                  !usable && "cursor-not-allowed opacity-40",
                  on ? "border-gold/45 bg-active-bg" : "border-line hover:border-line-soft",
                )}
              >
                <m.icon
                  className={cn("mx-auto h-4 w-4", on ? "text-gold" : "text-muted")}
                  aria-hidden
                />
                <span
                  className={cn("mt-1 block text-[12.5px] font-bold", on ? "text-gold" : "text-ink")}
                >
                  {m.label}
                </span>
                <span className="block text-[10.5px] text-faint">{m.hint}</span>
              </button>
            );
          })}
        </div>

        {toGoal && (
          <Select
            label="Which goal"
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            options={goalOptions}
            placeholder="Pick a goal"
            help="Every booking sets that much aside on the account below. It stays on the account; it just stops counting as free to spend."
          />
        )}

        {!toGoal && loanOptions.length > 0 && (
          <Select
            label="Pays off"
            name="loan_id"
            defaultValue={item?.loan_id ?? ""}
            placeholder="Nothing — an ordinary bill"
            options={loanOptions}
            help="Set this and every booking pays the debt down by itself."
          />
        )}

        <Divider>How much</Divider>

        {!toGoal && (
          <button
            type="button"
            onClick={() => setVariable(!variable)}
            aria-pressed={variable}
            className={cn(
              "zv-press mb-2.5 flex w-full items-center gap-2.5 rounded-ctrl border px-3 py-2.5 text-left transition-colors",
              variable ? "border-gold/45 bg-active-bg" : "border-line hover:border-line-soft",
            )}
          >
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                variable ? "border-gold bg-gold text-on-gold" : "border-line",
              )}
              aria-hidden
            >
              {variable && (
                <svg
                  viewBox="0 0 12 12"
                  className="h-2.5 w-2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M2 6.5 4.6 9 10 3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="text-[13px] text-ink">
              Amount changes every time
              <span className="block text-[11.5px] text-faint">
                Electricity, water — you type the figure when the bill lands
              </span>
            </span>
            {variable && <input type="hidden" name="variable" value="on" />}
          </button>
        )}

        <div className="grid grid-cols-[1fr_110px] gap-2">
          {(!variable || toGoal) && (
            <MoneyField
              label="Amount"
              name="amount"
              defaultValue={item?.amount ?? ""}
              placeholder="0"
            />
          )}
          <Select
            label="Currency"
            name="currency"
            defaultValue={item?.currency ?? fallback}
            options={CURRENCY_OPTIONS}
            className={variable && !toGoal ? "col-span-2" : undefined}
          />
        </div>

        {/*
          Billed in one currency, read in another.

          "Currency" above is what the biller charges — the fact. This is what the row in
          the register says it in, for the rules you think about in their own money: a
          subscription is remembered as "$27 a month", not as whatever that came to in
          euros this week. Left on the default it follows the profile, including later
          when the profile changes.
        */}
        <Select
          label="Show it as"
          name="display_currency"
          defaultValue={item?.display_currency ?? ""}
          options={[{ value: "", label: `Default (${fallback})` }, ...CURRENCY_OPTIONS]}
          help="Only changes how this one is displayed, never what is charged."
        />

        <Divider>When</Divider>

        <PeriodPicker
          unit={every}
          count={everyCount}
          onChange={(u, c) => {
            setEvery(u);
            setEveryCount(c);
          }}
          unitName="every"
          countName="every_count"
        >
          <div className="mt-3 grid grid-cols-2 items-end gap-2 border-t border-line pt-3">
            <Field
              label="First one"
              name="next_on"
              type="date"
              value={nextOn}
              onChange={(e) => setNextOn(e.target.value)}
              className="mb-0"
            />
            {preview.length === 3 && (
              <p className="mono pb-2.5 text-[11.5px] text-muted">
                then {shortDate(preview[1])} · {shortDate(preview[2])} …
              </p>
            )}
          </div>

          {/*
            When it stops, chosen rather than inferred.

            Two empty boxes used to mean "forever", one filled meant a count, the other a
            date, and both filled meant whichever the reading code checked first. Saying
            it in a word makes the rule readable at a glance months later, and lets the
            one condition that cannot be a box exist at all: a standing order that stops
            when its goal is full, on a date only the ledger knows.
          */}
          <input type="hidden" name="ends_when" value={endsWhen} />
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
              <span className="text-[12.5px] font-semibold text-muted">Until</span>
              {[
                { value: "never", label: "forever" },
                { value: "date", label: "a date" },
                { value: "installments", label: "a number of payments" },
                ...(toGoal ? [{ value: "goal", label: "the goal is full" }] : []),
              ].map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setEndsWhen(o.value)}
                  aria-pressed={endsWhen === o.value}
                  className={cn(
                    "text-[12.5px] font-semibold underline-offset-4 transition-colors",
                    endsWhen === o.value
                      ? "text-gold underline decoration-gold/50"
                      : "text-faint hover:text-ink hover:underline hover:decoration-dotted",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {endsWhen === "date" && (
              <Field
                label="Stops after"
                name="ends_on"
                type="date"
                defaultValue={item?.ends_on ?? ""}
                required
                className="mt-2.5 mb-0"
              />
            )}

            {endsWhen === "installments" && (
              <Field
                label="How many payments"
                name="installments_total"
                inputMode="numeric"
                defaultValue={item?.installments_total ? String(item.installments_total) : ""}
                placeholder="12"
                required
                className="mt-2.5 mb-0"
                help={
                  item && (item.installments_done ?? 0) > 0
                    ? `Booked so far: ${item.installments_done}${item.installments_total ? ` of ${item.installments_total}` : ""}.`
                    : undefined
                }
              />
            )}

            {endsWhen === "goal" && (
              <p className="mt-2.5 text-center text-[11.5px] leading-[1.55] text-muted">
                Stops the moment the goal is full, counting whatever you put in by hand
                along the way — so paying extra brings the finish forward, and the last
                payment is trimmed to what is left.
              </p>
            )}
          </div>
        </PeriodPicker>

        <Divider>Where it lands</Divider>

        {/*
          Chips for accounts because there are two of them and there always will be a
          handful; a dropdown to choose between two visible things is a tap to reveal
          what you already knew. Categories stay a list — there can be dozens, and forty
          chips is a wall rather than a choice.
        */}
        <ChipPicker
          label={toGoal ? "Set aside on" : "Account"}
          name="account_id"
          chips={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))}
          selected={accountIds}
          onChange={setAccountIds}
          emptyLabel={toGoal ? undefined : "No account"}
          help={toGoal ? "A goal rule needs one — it is where the money is held back." : undefined}
        />

        {!toGoal && (
          <Select
            label="Category"
            name="category_id"
            defaultValue={item?.category_id ?? ""}
            placeholder={categoryOptions.length ? "No category" : "No categories yet"}
            options={categoryOptions}
          />
        )}

        {state?.error && (
          <p className="mb-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {state.error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2.5">
          <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-ctrl border border-line px-3 py-2.5 text-[12.5px] text-ink hover:border-line-soft">
            <input
              type="checkbox"
              name="active"
              defaultChecked={item?.active ?? true}
              className="h-4 w-4 accent-gold"
            />
            Active
          </label>
          <Button type="submit" variant="primary" className="flex-1" disabled={pending}>
            {pending ? "Saving…" : item ? "Save changes" : "Create"}
          </Button>
        </div>
      </form>

      {item && (
        <div className="mt-4 border-t border-line pt-4">
          <DeleteButton
            action={deleteRecurring.bind(null, item.id)}
            label="Delete"
            confirmText={`Delete "${item.name}"? Entries already booked stay.`}
          />
        </div>
      )}
    </div>
  );
}
