"use client";

import { useActionState, useEffect, useState } from "react";
import { Folder, Shapes, PiggyBank, ReceiptText } from "lucide-react";
import {
  saveBudgetPlan,
  deleteBudgetPlan,
  type MoneyState,
} from "@/app/(app)/private/actions";
import { Field } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { ChipPicker } from "@/components/ui/ChipPicker";
import { PeriodPicker, type PeriodUnit } from "@/components/ui/PeriodPicker";
import { CURRENCY_OPTIONS, type Currency } from "@/lib/money";
import { useDefaultCurrency, useMoney } from "@/lib/money/currency";
import { fromRsd } from "@/lib/money/display";
import { budgetWindow } from "@/lib/money/budget-periods";
import { todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  MoneyAccount,
  MoneyBudgetBoost,
  MoneyBudgetPlan,
  MoneyCategory,
} from "@/lib/types";
import { windowLabel } from "./plan-reading";

/**
 * Two choices decide what every other field on this form means, so they are made first
 * and made in words rather than in a dropdown.
 *
 * The wording is doing real work. "Expense" and "Savings" sound like a preference and
 * are not: they invert which direction is failure. "Added only" and "All transactions"
 * sound like a technicality and are the difference between a budget that gathers your
 * whole holiday and one that can never see it.
 */
const KINDS = [
  {
    value: "expense",
    label: "Expense budget",
    icon: ReceiptText,
    blurb: "A ceiling. Keep spending under it.",
  },
  {
    value: "savings",
    label: "Savings budget",
    icon: PiggyBank,
    blurb: "A floor. Keep income minus spending above it.",
  },
] as const;

const MEMBERSHIPS = [
  {
    value: "all",
    label: "All transactions",
    icon: Shapes,
    blurb: "Everything in the categories and accounts you pick.",
    example: "Monthly spending",
  },
  {
    value: "added",
    label: "Added only",
    icon: Folder,
    blurb: "Only what you file into it by hand.",
    example: "Holiday",
  },
] as const;

function Choice({
  active,
  onClick,
  icon: Icon,
  label,
  blurb,
  example,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Folder;
  label: string;
  blurb: string;
  example?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "zv-choice zv-press rounded-card border p-3 text-left transition-colors",
        active ? "is-on border-gold/45" : "border-line hover:border-line-soft",
      )}
    >
      {/* The dot, not a tick in a box: the card is already the control. */}
      {active && <span className="zv-choice-tick" aria-hidden />}
      <span className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", active ? "text-gold" : "text-muted")} />
        <span className={cn("text-[13.5px] font-bold", active ? "text-gold" : "text-ink")}>
          {label}
        </span>
      </span>
      <span className="mt-1 block text-[12px] leading-[1.5] text-muted">{blurb}</span>
      {example && <span className="mt-0.5 block text-[11.5px] text-faint">e.g. “{example}”</span>}
    </button>
  );
}

/**
 * One band of the form.
 *
 * The panel used to be a single column of controls with three different kinds of label
 * in it — small caps over the chips, sentence case over the fields, and nothing at all
 * over the two rows of cards that decide what every other control means. A form reads as
 * assembled rather than designed exactly when its labels disagree like that. One heading
 * shape, one hint shape, and a hairline where one thought ends and the next begins.
 */
function Sec({
  title,
  hint,
  children,
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="zv-formsec">
      {title && <h3 className="zv-formsec-h">{title}</h3>}
      {hint && <p className="zv-formsec-hint">{hint}</p>}
      {children}
    </section>
  );
}

/** A repeating budget this one can raise, and what it normally allows. */
export type Raisable = { id: string; name: string; baseRsd: number };

export function BudgetPlanForm({
  plan,
  categoryIds = [],
  accountIds = [],
  categories,
  accounts,
  raisable = [],
  boosts = [],
  raisers = [],
  raisedBy = [],
  onSaved,
}: {
  plan?: MoneyBudgetPlan;
  categoryIds?: string[];
  accountIds?: string[];
  categories: MoneyCategory[];
  accounts: MoneyAccount[];
  raisable?: Raisable[];
  boosts?: MoneyBudgetBoost[];
  /** Dated budgets that could raise this one — the other end of `raisable`. */
  raisers?: Raisable[];
  /** Raises already pointed at this budget. */
  raisedBy?: MoneyBudgetBoost[];
  onSaved?: () => void;
}) {
  const { fmt, display } = useMoney();
  const fallback = useDefaultCurrency();
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(
    saveBudgetPlan,
    undefined,
  );

  const [kind, setKind] = useState<string>(plan?.kind ?? "expense");
  const [membership, setMembership] = useState<string>(plan?.membership ?? "all");
  const [period, setPeriod] = useState<string>(plan?.period ?? "month");
  const [count, setCount] = useState<number>(plan?.period_count ?? 1);
  const [startsOn, setStartsOn] = useState(plan?.starts_on ?? todayISO());
  const [endsOn, setEndsOn] = useState(plan?.ends_on ?? "");
  const [cats, setCats] = useState<string[]>(categoryIds);
  const [accs, setAccs] = useState<string[]>(accountIds);
  const [currency, setCurrency] = useState<Currency>(fallback);
  // Limits live in dinars and are typed in whatever the screen is read in — the same
  // conversion the category limits have always done, on the way in and on the way out.
  const [amount, setAmount] = useState(
    plan ? String(Math.round(fromRsd(Number(plan.amount_rsd) || 0, display))) : "",
  );

  /*
    What this budget raises while it is on, kept as a list rather than a map so two
    half-filled rows can exist side by side without one silently replacing the other.
    Empty rows are dropped on save.
  */
  const [grants, setGrants] = useState<{ target: string; amount: string }[]>(() =>
    boosts.map((b) => ({
      target: b.target_budget_id,
      amount: String(Math.round(fromRsd(Number(b.amount_rsd) || 0, display))),
    })),
  );

  /*
    What raises this budget, edited from this side.

    The same rows as `grants`, read the other way round, and the reason for both is where
    you are standing when you notice. You find out that a limit needs to be bigger while
    looking at the limit — Eating out red, 14.437 over, a trip you are in the middle of —
    and until now the only control lived on the trip's card, with nothing here to say so.
    What that produced was the obvious move instead: open Eating out, find one Limit
    field, and type a bigger number — which raises it for every month of the year, not
    the one the trip is in.

    So the relationship is editable from both ends and stores one row either way.
  */
  const [raises, setRaises] = useState<{ source: string; amount: string }[]>(() =>
    raisedBy.map((b) => ({
      source: b.source_budget_id,
      amount: String(Math.round(fromRsd(Number(b.amount_rsd) || 0, display))),
    })),
  );

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  // The window as it will actually be, shown while you are still deciding — a budget
  // anchored to the 15th running 15th to 14th is a surprise worth having before saving,
  // not after.
  const preview =
    period === "custom" && !endsOn
      ? null
      : budgetWindow(
          {
            period: period as "custom" | "day" | "week" | "month" | "year",
            period_count: count,
            starts_on: startsOn,
            ends_on: period === "custom" ? endsOn : null,
          },
          todayISO(),
        );

  const relevantCategories = categories.filter((c) =>
    kind === "savings" ? true : c.kind === "expense",
  );

  /*
    `min-h-full`, not `h-full`.

    A sticky element can only travel inside its own containing block, and `h-full`
    resolved this wrapper to exactly one panel height while its content ran to three — so
    the footer stuck for the first screen and then scrolled away with everything else,
    which is the one thing it exists not to do.
  */
  return (
    <div className="flex min-h-full flex-col">
      <form id="budget-plan-form" action={formAction} className="flex-1">
        {plan && <input type="hidden" name="id" value={plan.id} />}
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="membership" value={membership} />

        <Sec title="What kind of budget">
          <div className="grid gap-2 sm:grid-cols-2">
            {KINDS.map((k) => (
              <Choice
                key={k.value}
                active={kind === k.value}
                onClick={() => setKind(k.value)}
                icon={k.icon}
                label={k.label}
                blurb={k.blurb}
              />
            ))}
          </div>
        </Sec>

        <Sec>
          <Field label="Name" name="name" defaultValue={plan?.name ?? ""} maxLength={60} required
            placeholder={kind === "savings" ? "What you are saving towards" : "Groceries, Holiday…"} />

          <div className="grid grid-cols-[1fr_110px] gap-2">
          <MoneyField
            label={kind === "savings" ? "Target" : "Limit"}
            name="amount"
            value={amount}
            onValueChange={setAmount}
            placeholder="0"
            required
          />
          <Select
            label="Currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
              options={CURRENCY_OPTIONS}
            />
          </div>
        </Sec>

        {/* The clock. Custom is one fixed window; everything else repeats from the anchor. */}
        <Sec title="How often it resets">
        <div className="mb-3.25 flex gap-1.5">
          <button
            type="button"
            onClick={() => setPeriod("month")}
            aria-pressed={period !== "custom"}
            className={cn(
              "zv-press rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              period !== "custom"
                ? "border-gold/40 bg-active-bg text-gold"
                : "border-line text-muted hover:text-ink",
            )}
          >
            Repeating
          </button>
          <button
            type="button"
            onClick={() => setPeriod("custom")}
            aria-pressed={period === "custom"}
            className={cn(
              "zv-press rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              period === "custom"
                ? "border-gold/40 bg-active-bg text-gold"
                : "border-line text-muted hover:text-ink",
            )}
          >
            Fixed dates
          </button>
        </div>

        {period === "custom" ? (
          <>
            <input type="hidden" name="period" value="custom" />
            <input type="hidden" name="period_count" value={1} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="From" name="starts_on" type="date" value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)} />
              <Field label="To" name="ends_on" type="date" value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)} required />
            </div>
          </>
        ) : (
          <>
            <PeriodPicker
              unit={period as PeriodUnit}
              count={count}
              onChange={(u, c) => {
                setPeriod(u);
                setCount(c);
              }}
            />
            <Field
              label="Beginning"
              name="starts_on"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              help="Pick the 15th and the month runs 15th to 14th."
            />
          </>
        )}

        {preview && (
          <p className="zv-formsec-note mono">Current period: {windowLabel(preview)}</p>
        )}
        </Sec>

        <Sec title="What lands in it">
        <div className="mb-3.25 grid gap-2 sm:grid-cols-2">
          {MEMBERSHIPS.map((m) => (
            <Choice
              key={m.value}
              active={membership === m.value}
              onClick={() => setMembership(m.value)}
              icon={m.icon}
              label={m.label}
              blurb={m.blurb}
              example={m.example}
            />
          ))}
        </div>

        {membership === "all" ? (
          <>
            <ChipPicker
              label="Categories"
              name="category_ids"
              multiple
              chips={relevantCategories.map((c) => ({
                value: c.id,
                label: c.name,
                color: c.color,
              }))}
              selected={cats}
              onChange={setCats}
              emptyLabel="Every category"
              emptyMeans="Nothing picked — every category counts."
            />
            <ChipPicker
              label="Accounts"
              name="account_ids"
              multiple
              chips={accounts.map((a) => ({ value: a.id, label: a.name }))}
              selected={accs}
              onChange={setAccs}
              emptyLabel="Every account"
              emptyMeans="Nothing picked — every account counts."
            />
          </>
        ) : (
          <p className="mb-3.25 rounded-ctrl border border-line bg-white/[0.025] px-3 py-2.5 text-[12px] leading-[1.55] text-muted">
            Nothing lands here on its own — you pick this budget on an entry, whatever
            category it was on.
          </p>
        )}
        </Sec>

        {/*
          What this budget lets the monthly limits get away with, in the months it lands in.

          Only offered for a budget with fixed dates, because only such a budget lands in
          some months and not others — that is the whole idea. A monthly budget raising
          another monthly budget would raise it every month, which is just a bigger number
          typed in the wrong place, and the database refuses it.

          And only for a spending budget. A savings target is a floor on what is left over;
          it grants nobody room to spend, and offering the control on it invites setting up
          a raise that means nothing — "keep 150.000 by December, and therefore Groceries
          may cost 5.000 more" is not a sentence.

          The point people miss, so the hint says it: entries you file into this budget are
          already kept out of the monthly limits. This is for the rest of the trip — the
          fuel, the shopping before you go, the things that stayed ordinary expenses.
        */}
        {period === "custom" && kind === "expense" && raisable.length > 0 && (
          <Sec
            title="While this runs, allow more"
            hint="Raises another budget's limit, for the months these dates touch."
          >

            {grants.map((grant, i) => (
              <div key={i} className="zv-grantrow">
                <Select
                  label=""
                  name="boost_target"
                  className="zv-grantrow-who mb-0"
                  value={grant.target}
                  /*
                    Enter picks the budget; it does not save the form.

                    A closed `select` inside a form submits it on Enter, which is exactly
                    the key you press to confirm a choice in the dropdown you just opened.
                    So choosing "Eating out" from the keyboard saved the budget, closed the
                    panel, and wrote no raise at all — the amount had not been typed yet.
                    No error, no trace, and the limit did not move: the failure looked
                    precisely like the feature not working.
                  */
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  onChange={(e) =>
                    setGrants((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, target: e.target.value } : r)),
                    )
                  }
                  placeholder="Which budget"
                  options={raisable.map((r) => ({
                    value: r.id,
                    label: `${r.name} · ${fmt(r.baseRsd)}`,
                  }))}
                />
                <MoneyField
                  label=""
                  name="boost_amount"
                  className="zv-grantrow-much mb-0"
                  value={grant.amount}
                  onValueChange={(v) =>
                    setGrants((rows) => rows.map((r, j) => (j === i ? { ...r, amount: v } : r)))
                  }
                  placeholder={`+ ${currency}`}
                  aria-label="Extra amount"
                  /* Same reason as the select beside it: the row is not finished on Enter. */
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                />
                <button
                  type="button"
                  onClick={() => setGrants((rows) => rows.filter((_, j) => j !== i))}
                  aria-label="Remove"
                  className="zv-rowctrl zv-grantrow-off shrink-0"
                >
                  &times;
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setGrants((rows) => [...rows, { target: "", amount: "" }])}
              className="zv-addrow"
            >
              {grants.length ? "Add another" : "Raise a limit"}
            </button>
          </Sec>
        )}

        {/*
          What raises this budget while a dated one is running — the same relationship as
          "While this runs, allow more", edited from the limit rather than from the trip.
        */}
        {period !== "custom" && kind === "expense" && raisers.length > 0 && (
          <Sec
            title="Raised while something is running"
            hint="Only for the months that trip runs. The limit above applies to every month."
          >

            {raises.map((raise, i) => (
              <div key={i} className="zv-grantrow">
                <Select
                  label=""
                  name="raise_source"
                  className="zv-grantrow-who mb-0"
                  value={raise.source}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  onChange={(e) =>
                    setRaises((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, source: e.target.value } : r)),
                    )
                  }
                  placeholder="Which one"
                  options={raisers.map((r) => ({ value: r.id, label: r.name }))}
                />
                <MoneyField
                  label=""
                  name="raise_amount"
                  className="zv-grantrow-much mb-0"
                  value={raise.amount}
                  onValueChange={(v) =>
                    setRaises((rows) => rows.map((r, j) => (j === i ? { ...r, amount: v } : r)))
                  }
                  placeholder={`+ ${currency}`}
                  aria-label="Extra amount"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                />
                <button
                  type="button"
                  onClick={() => setRaises((rows) => rows.filter((_, j) => j !== i))}
                  aria-label="Remove"
                  className="zv-rowctrl zv-grantrow-off shrink-0"
                >
                  &times;
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setRaises((rows) => [...rows, { source: "", amount: "" }])}
              className="zv-addrow"
            >
              {raises.length ? "Add another" : "Raise it for a trip"}
            </button>
          </Sec>
        )}

      </form>

      {/*
        The one place anything is actually done, pinned to the bottom of the panel.

        The form is taller than the panel on every screen and always was, so the button
        that saves it sat below the fold from the moment it opened — you filled the thing
        in, and then went looking for how to keep it. Sticky, it is where the eye already
        looks for a decision, and the sentence above it says what pressing it will do,
        rewriting itself as the fields change. The button is outside the form and reaches
        it by `form=`, which is what lets the delete stand beside it without nesting one
        form inside another.
      */}
      <footer className="zv-formfoot">
        {state?.error && <p className="zv-formfoot-err">{state.error}</p>}

        {amount && (
          <p className="zv-formfoot-say">
            {kind === "savings" ? "Keeping" : "Spending up to"}{" "}
            <b>{fmt(Number(amount.replace(",", ".")) || 0)}</b>{" "}
            {period === "custom"
              ? preview
                ? `over ${windowLabel(preview)}`
                : "over those dates"
              : `every ${count === 1 ? period : `${count} ${period}s`}`}
          </p>
        )}

        <Button
          type="submit"
          form="budget-plan-form"
          variant="primary"
          className="w-full"
          disabled={pending}
        >
          {pending ? "Saving…" : plan ? "Save changes" : "Add budget"}
        </Button>

        {plan && (
          <DeleteButton
            action={async () => {
              await deleteBudgetPlan(plan.id);
              onSaved?.();
            }}
            label="Delete budget"
            confirmText="Delete this budget? The entries it counted stay in the ledger."
            variant="ghost"
            className="w-full text-danger"
          />
        )}
      </footer>
    </div>
  );
}






