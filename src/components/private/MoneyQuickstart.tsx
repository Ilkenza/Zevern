"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Plus, Trash2, Wallet } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { MoneyField } from "@/components/ui/MoneyField";
import { Button, buttonClasses } from "@/components/ui/Button";
import {
  hideMoneyOnboarding,
  saveStartingAccounts,
  saveStartingRecurring,
} from "@/app/(app)/private/actions/quickstart";
import type { MoneyState } from "@/app/(app)/private/actions/shared";
import type { MoneyQuickstart as MoneyQuickstartData } from "@/lib/data/quickstart";
import { cn } from "@/lib/utils";

/**
 * The three questions the private side asks before it can say anything true.
 *
 * Same shape as the run on the work side and the same rule behind it: each question has to
 * build something. What it builds here is the thing that makes every other screen work —
 * somewhere for money to sit, and the handful of charges that happen every month whether
 * anybody does anything or not. A forecast with nothing on it forecasts nothing, and a
 * balance with no account is not a number at all.
 *
 * Only the first question holds the card open. The other two have an honest answer that
 * builds nothing — money that arrives whenever an invoice is paid is not a monthly rule —
 * and a card that waits for those would nag forever for work that does not exist.
 */

type Step = "accounts" | "income" | "outgoings";

const ORDER: Step[] = ["accounts", "income", "outgoings"];

/** A row being typed, whether it is an account or a monthly charge. */
type Row = { key: number; name: string; amount: string; day: string; kind: string };

let nextKey = 0;
const blank = (kind = "bank"): Row => ({ key: ++nextKey, name: "", amount: "", day: "", kind });

/** The places money sits, named the way somebody would say them out loud. */
const PLACES: { kind: string; label: string; name: string }[] = [
  { kind: "cash", label: "Cash", name: "Cash" },
  { kind: "bank", label: "Bank account", name: "Bank" },
  { kind: "card", label: "Card", name: "Card" },
  { kind: "savings", label: "Savings", name: "Savings" },
];

/** The charges that turn up on nearly everybody's month. */
const OUTGOINGS = ["Rent", "Electricity", "Phone", "Internet", "Streaming", "Gym", "Loan payment"];

export function MoneyQuickstart({ data }: { data: MoneyQuickstartData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("accounts");
  const [dismissing, startDismiss] = useTransition();

  const close = () => {
    setOpen(false);
    router.refresh();
  };

  /*
    Nothing to ask and nothing in progress — so nothing on screen at all.

    `hidden` goes true the instant the first answer is saved, which is in the middle of
    the run. The card goes then; the panel stays until the run is finished or closed.
  */
  if (data.hidden && !open) return null;

  return (
    <>
      {!data.hidden && (
        <div className="qs-card">
          <div className="qs-card-mark" aria-hidden="true">
            <Wallet className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="qs-card-title">Tell Zevern where your money is</p>
            <p className="qs-card-detail">
              Three questions: where you keep it, what comes in, and what goes out on its own.
              Nothing here works until the first one is answered.
            </p>
          </div>

          <div className="qs-card-actions">
            <button
              type="button"
              onClick={() => {
                setStep("accounts");
                setOpen(true);
              }}
              className={buttonClasses("primary")}
            >
              Start
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={dismissing}
              onClick={() =>
                startDismiss(async () => {
                  await hideMoneyOnboarding();
                  router.refresh();
                })
              }
              className="qs-card-skip"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <SlideOver open={open} onClose={close} title="Set up the money side">
        <div className="qs-flow">
          <ol className="qs-progress" aria-label="Setup progress">
            {ORDER.map((key, i) => {
              const at = ORDER.indexOf(step);
              return (
                <li
                  key={key}
                  className={cn("qs-progress-step", i < at && "is-past", i === at && "is-now")}
                >
                  <span aria-hidden="true">{i < at ? <Check className="h-3 w-3" /> : i + 1}</span>
                </li>
              );
            })}
          </ol>

          {step === "accounts" && <Accounts currency={data.currency} onDone={() => setStep("income")} />}
          {step === "income" && <Income currency={data.currency} onDone={() => setStep("outgoings")} />}
          {step === "outgoings" && <Outgoings currency={data.currency} onDone={close} />}
        </div>
      </SlideOver>
    </>
  );
}

/* ------------------------------------------------------------------------- the questions */

function Accounts({ currency, onDone }: { currency: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<MoneyState, FormData>(saveStartingAccounts, undefined);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  const add = (place?: (typeof PLACES)[number]) =>
    setRows((was) => [
      ...was,
      place ? { ...blank(place.kind), name: place.name } : blank("other"),
    ]);

  const patch = (key: number, part: Partial<Row>) =>
    setRows((was) => was.map((r) => (r.key === key ? { ...r, ...part } : r)));

  const named = rows.filter((r) => r.name.trim() !== "");

  return (
    <section className="qs-step">
      <h2 className="qs-question">Where do you keep your money?</h2>
      <p className="qs-hint">
        One line for each place it sits, and roughly what is in it now. A guess is fine — the
        figure is on the account afterwards, and correcting it takes a second.
      </p>

      <div className="qs-trades" role="group" aria-label="Add a place">
        {PLACES.map((place) => (
          <button key={place.kind} type="button" onClick={() => add(place)} className="qs-trade">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {place.label}
          </button>
        ))}
      </div>

      <form action={action}>
        {rows.length === 0 ? (
          <p className="qs-blank">Pick one above, or write your own below.</p>
        ) : (
          <div className="qs-rows">
            {rows.map((row) => (
              <div key={row.key} className="qs-row">
                <input
                  value={row.name}
                  onChange={(e) => patch(row.key, { name: e.target.value })}
                  placeholder="What you call it"
                  maxLength={80}
                  className="qs-row-label"
                  aria-label="Account name"
                />
                {/* Grouped as it is typed, like every amount in the app — 150.000 is not 150. */}
                <MoneyField
                  name={`balance-${row.key}`}
                  value={row.amount}
                  onValueChange={(plain) => patch(row.key, { amount: plain })}
                  placeholder="0"
                  inputClassName="mono qs-row-price"
                  aria-label={`Balance in ${currency}`}
                />
                <button
                  type="button"
                  onClick={() => setRows((was) => was.filter((r) => r.key !== row.key))}
                  className="qs-row-drop"
                  aria-label="Remove this line"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={() => add()} className="qs-add">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Somewhere else
        </button>

        <input
          type="hidden"
          name="accounts"
          value={JSON.stringify(
            named.map((r) => ({ name: r.name.trim(), kind: r.kind, balance: r.amount })),
          )}
        />

        {state?.error && <p className="qs-error">{state.error}</p>}

        <div className="qs-finish">
          <Button type="submit" variant="primary" disabled={pending || named.length === 0}>
            {pending ? "Saving…" : "Save and carry on"}
          </Button>
          <span className="qs-note">Amounts are in {currency}.</span>
        </div>
      </form>
    </section>
  );
}

/**
 * What arrives, and whether it arrives on a day.
 *
 * The freelance answer is the one worth getting right: money that turns up whenever an
 * invoice is paid has no monthly rule to describe, and pretending otherwise would put a
 * figure on the forecast that nothing supports. So that answer builds nothing and says so,
 * rather than being a dead end somebody has to guess their way out of.
 */
function Income({ currency, onDone }: { currency: string; onDone: () => void }) {
  const [regular, setRegular] = useState<boolean | null>(null);

  if (regular === null) {
    return (
      <section className="qs-step">
        <h2 className="qs-question">What comes in, and how?</h2>
        <p className="qs-hint">This is what puts anything on the forecast at all.</p>

        <div className="qs-choices">
          <button type="button" onClick={() => setRegular(true)} className="qs-choice">
            <span className="qs-choice-title">Something lands on about the same day</span>
            <span className="qs-choice-detail">
              A salary, a retainer, a rent you collect. Tell Zevern roughly when and how much.
            </span>
          </button>

          <button type="button" onClick={() => onDone()} className="qs-choice">
            <span className="qs-choice-title">Whenever an invoice is paid</span>
            <span className="qs-choice-detail">
              Nothing to set up — there is no monthly figure to promise. Record each payment
              as income on the day it lands.
            </span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <Repeating
      kind="income"
      currency={currency}
      title="What lands, and roughly when?"
      hint="The day matters more than the figure — it is what puts the arrival on the timeline."
      suggestions={["Salary", "Retainer", "Rent I collect"]}
      onDone={onDone}
    />
  );
}

function Outgoings({ currency, onDone }: { currency: string; onDone: () => void }) {
  return (
    <Repeating
      kind="expense"
      currency={currency}
      title="What goes out every month on its own?"
      hint="Standing charges — the ones that happen whether you do anything or not. Leave the amount empty for the ones that change every month, like electricity."
      suggestions={OUTGOINGS}
      onDone={onDone}
      last
    />
  );
}

/**
 * The shared half of the last two questions.
 *
 * What arrives and what leaves are the same fact with the sign flipped, and writing them
 * twice would be two screens to keep in step forever — which is how one of them quietly
 * stops accepting an empty amount and nobody notices for a month.
 */
function Repeating({
  kind,
  currency,
  title,
  hint,
  suggestions,
  onDone,
  last = false,
}: {
  kind: "income" | "expense";
  currency: string;
  title: string;
  hint: string;
  suggestions: string[];
  onDone: () => void;
  last?: boolean;
}) {
  const [state, action, pending] = useActionState<MoneyState, FormData>(saveStartingRecurring, undefined);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  const patch = (key: number, part: Partial<Row>) =>
    setRows((was) => was.map((r) => (r.key === key ? { ...r, ...part } : r)));

  const named = rows.filter((r) => r.name.trim() !== "");

  return (
    <section className="qs-step">
      <h2 className="qs-question">{title}</h2>
      <p className="qs-hint">{hint}</p>

      <div className="qs-trades" role="group" aria-label="Add one">
        {suggestions.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setRows((was) => [...was, { ...blank(), name: label }])}
            className="qs-trade"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <form action={action}>
        <input type="hidden" name="kind" value={kind} />

        {rows.length === 0 ? (
          <p className="qs-blank">Pick one above, or add your own.</p>
        ) : (
          <>
            <div className="qs-heads" aria-hidden="true">
              <span>What it is</span>
              <span>{currency}</span>
              <span>Day</span>
              <span />
            </div>
            <div className="qs-rows">
              {rows.map((row) => (
                <div key={row.key} className="qs-row is-dated">
                  <input
                    value={row.name}
                    onChange={(e) => patch(row.key, { name: e.target.value })}
                    placeholder={kind === "income" ? "What lands" : "What goes out"}
                    maxLength={80}
                    className="qs-row-label"
                    aria-label="Name"
                  />
                  <MoneyField
                    name={`amount-${row.key}`}
                    value={row.amount}
                    onValueChange={(plain) => patch(row.key, { amount: plain })}
                    placeholder="changes"
                    inputClassName="mono qs-row-price"
                    aria-label={`Amount in ${currency}`}
                  />
                  <input
                    value={row.day}
                    onChange={(e) => patch(row.key, { day: e.target.value })}
                    placeholder="1"
                    inputMode="numeric"
                    maxLength={2}
                    className="mono qs-row-day"
                    aria-label="Day of the month"
                  />
                  <button
                    type="button"
                    onClick={() => setRows((was) => was.filter((r) => r.key !== row.key))}
                    className="qs-row-drop"
                    aria-label="Remove this line"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setRows((was) => [...was, blank()])}
          className="qs-add"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add another
        </button>

        <input
          type="hidden"
          name="items"
          value={JSON.stringify(
            named.map((r) => ({ name: r.name.trim(), amount: r.amount, day: r.day })),
          )}
        />

        {state?.error && <p className="qs-error">{state.error}</p>}

        <div className="qs-finish">
          {/*
            Save is off with nothing typed, so an empty list has one way forward and not
            two. It would have gone through — the action takes no rows as an answer — but
            then two buttons side by side would do exactly the same thing under different
            names, and the one that reads as the important one would be the one that
            saved nothing.
          */}
          <Button type="submit" variant="primary" disabled={pending || named.length === 0}>
            {pending ? "Saving…" : last ? "Save and finish" : "Save and carry on"}
          </Button>
          <button type="button" onClick={onDone} className="qs-card-skip">
            {named.length === 0 ? "Nothing like that" : "Skip this"}
          </button>
        </div>
      </form>
    </section>
  );
}
