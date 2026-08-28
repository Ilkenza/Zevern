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
import { ColorPicker } from "@/components/ui/ColorPicker";
import { CURRENCY_OPTIONS, type Currency } from "@/lib/money";
import { useDefaultCurrency, useMoney } from "@/lib/money/currency";
import { fromRsd } from "@/lib/money/display";
import { budgetWindow } from "@/lib/money/budget-periods";
import { todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MoneyAccount, MoneyCategory, MoneyBudgetPlan } from "@/lib/types";
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
    blurb: "A ceiling. Track what goes out and keep it under the number.",
  },
  {
    value: "savings",
    label: "Savings budget",
    icon: PiggyBank,
    blurb: "A floor. Track what is left over — income less spending — and reach the number.",
  },
] as const;

const MEMBERSHIPS = [
  {
    value: "all",
    label: "All transactions",
    icon: Shapes,
    blurb: "Everything in the categories and accounts you pick. For something standing.",
    example: "Monthly spending",
  },
  {
    value: "added",
    label: "Added only",
    icon: Folder,
    blurb: "Only entries you put in it by hand. For one thing spread across categories.",
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
        "zv-press rounded-card border p-3 text-left transition-colors",
        active ? "border-gold/45 bg-active-bg" : "border-line hover:border-line-soft",
      )}
    >
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

export function BudgetPlanForm({
  plan,
  categoryIds = [],
  accountIds = [],
  categories,
  accounts,
  onSaved,
}: {
  plan?: MoneyBudgetPlan;
  categoryIds?: string[];
  accountIds?: string[];
  categories: MoneyCategory[];
  accounts: MoneyAccount[];
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

  return (
    <div className="flex h-full flex-col">
      <form action={formAction} className="flex-1">
        {plan && <input type="hidden" name="id" value={plan.id} />}
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="membership" value={membership} />

        <div className="mb-3.25 grid gap-2 sm:grid-cols-2">
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

        {/* The clock. Custom is one fixed window; everything else repeats from the anchor. */}
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
              help="Every period is measured from this day — pick the 15th and the month runs 15th to 14th."
            />
          </>
        )}

        {preview && (
          <p className="mono mb-3.25 text-[12px] text-muted">
            Current period: {windowLabel(preview)}
          </p>
        )}

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
              emptyMeans="Nothing picked, so every category counts."
            />
            <ChipPicker
              label="Accounts"
              name="account_ids"
              multiple
              chips={accounts.map((a) => ({ value: a.id, label: a.name }))}
              selected={accs}
              onChange={setAccs}
              emptyLabel="Every account"
              emptyMeans="Nothing picked, so every account counts."
            />
          </>
        ) : (
          <p className="mb-3.25 rounded-ctrl border border-line bg-white/[0.025] px-3 py-2.5 text-[12px] leading-[1.55] text-muted">
            Nothing lands here on its own. Every entry form gets this budget in its list,
            and what you put in it is what it counts — whatever category or account it
            was on.
          </p>
        )}

        <ColorPicker name="color" value={plan?.color ?? null} />

        {state?.error && (
          <p className="mb-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {state.error}
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Saving…" : plan ? "Save changes" : "Add budget"}
        </Button>

        {!plan && amount && (
          <p className="mt-2 text-center text-[11.5px] text-muted">
            {kind === "savings" ? "Keeping" : "Spending up to"}{" "}
            {fmt(Number(amount.replace(",", ".")) || 0)}{" "}
            {period === "custom" ? "over those dates" : `every ${count === 1 ? period : `${count} ${period}s`}`}
          </p>
        )}
      </form>

      {plan && (
        <div className="mt-4 border-t border-line pt-4">
          <DeleteButton
            action={async () => {
              await deleteBudgetPlan(plan.id);
              onSaved?.();
            }}
            label="Delete budget"
            confirmText="Delete this budget? The entries it counted stay in the ledger."
          />
        </div>
      )}
    </div>
  );
}
