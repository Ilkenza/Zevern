"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Plus, Trash2, Wand2, X } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { MoneyField } from "@/components/ui/MoneyField";
import { Button, buttonClasses } from "@/components/ui/Button";
import { hideOnboarding } from "@/app/(app)/actions";
import {
  chooseWorkspaces,
  savePaperwork,
  saveServices,
  type QuickstartState,
} from "@/app/(app)/actions/quickstart";
import { CURRENCY_OPTIONS } from "@/lib/money";
import type { Quickstart as QuickstartData } from "@/lib/data/quickstart";
import { cn } from "@/lib/utils";

/**
 * Three questions, asked once, that leave the app set up instead of empty.
 *
 * The checklist beside this one lists work a person has to go and do. This asks for the
 * handful of answers the app can act on itself, and acts on them: which halves of the
 * product they want, whose name goes on a quote, and what they sell. After it, a quote is
 * picking from a list; before it, a quote is a blank page with an email address where the
 * sender should be.
 *
 * Each answer is saved as it is given, so the run is worth leaving half-done. The card
 * comes back at exactly the question that is still unanswered, because what is answered is
 * read from the data rather than from a stored position — close the tab on the price list
 * and the name is still on the paperwork.
 *
 * Every question offers answers and a field to write your own. That is the owner's own
 * rule for being asked things, and it is the right one: a list of options is a guess at
 * what somebody does for a living, and the ones it guesses wrong are exactly the people
 * who most need the app to fit them.
 */

type Step = "halves" | "paperwork" | "services";

/** A line on the price list while it is being typed. */
type ServiceRow = { key: number; label: string; price: string };

let nextKey = 0;
const blankService = (): ServiceRow => ({ key: ++nextKey, label: "", price: "" });

/**
 * Trades to offer as a starting price list.
 *
 * Deliberately not a taxonomy. These are the jobs the app is sold to, written the way the
 * person doing them would say it, and each carries the two or three lines that trade
 * actually quotes — so the common case is one tap and a number, and the uncommon case is
 * the empty rows underneath, which are always there.
 */
const TRADES: { key: string; label: string; services: string[] }[] = [
  { key: "web", label: "Websites", services: ["Landing page", "Multi-page website", "Website redesign"] },
  { key: "design", label: "Design", services: ["Logo and brand kit", "Social media set", "Print design"] },
  { key: "dev", label: "Development", services: ["Front-end build", "Integration or API work", "Bug fixing, hourly"] },
  { key: "content", label: "Content & SEO", services: ["SEO audit", "Article or blog post", "Monthly content"] },
  { key: "care", label: "Maintenance", services: ["Monthly care plan", "Hosting and domain", "Emergency fix"] },
];

export function Quickstart({ data }: { data: QuickstartData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /* Opens on the first thing still missing, so a half-finished run is not walked again. */
  const [step, setStep] = useState<Step>("halves");
  const [dismissing, startDismiss] = useTransition();

  /*
    `Carry on` opens on the first thing still missing, which is what the card promises.

    Only a run with nothing built starts at the top. Once a name or a price list exists,
    the first question has been through at least once — and it is the ordinary module
    switch in Settings, so walking it again on every return adds a step and no answer.
  */
  const begin = () => {
    setStep(
      data.done === 0
        ? "halves"
        : !data.answers.businessName
          ? "paperwork"
          : data.answers.services === 0
            ? "services"
            : "halves",
    );
    setOpen(true);
  };

  const onward = (from: Step) => {
    if (from === "halves") {
      setStep(data.answers.businessName ? "services" : "paperwork");
      return;
    }
    if (from === "paperwork" && data.answers.services === 0) {
      setStep("services");
      return;
    }
    close();
  };

  const close = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <div className="qs-card">
        <div className="qs-card-mark" aria-hidden="true">
          <Wand2 className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="qs-card-title">Answer three things and Zevern sets itself up</p>
          <p className="qs-card-detail">
            {data.done === 0
              ? "Which half of the app you want, whose name goes on a quote, and what you sell. About two minutes."
              : "You are part way through. Pick up where you stopped — nothing you answered was lost."}
          </p>
        </div>

        <div className="qs-card-actions">
          <button type="button" onClick={begin} className={buttonClasses("primary")}>
            {data.done === 0 ? "Start" : "Carry on"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={dismissing}
            onClick={() => startDismiss(async () => {
              await hideOnboarding();
              router.refresh();
            })}
            className="qs-card-skip"
          >
            Not now
          </button>
        </div>
      </div>

      <SlideOver open={open} onClose={close} title="Set up Zevern">
        <div className="qs-flow">
          <Progress step={step} />

          {step === "halves" && (
            <Halves answer={data.answers.wantsPrivate} onDone={() => onward("halves")} />
          )}
          {step === "paperwork" && (
            <Paperwork data={data} onDone={() => onward("paperwork")} />
          )}
          {step === "services" && <Services onDone={close} />}
        </div>
      </SlideOver>
    </>
  );
}

/* --------------------------------------------------------------------------- the steps */

const ORDER: Step[] = ["halves", "paperwork", "services"];

function Progress({ step }: { step: Step }) {
  const at = ORDER.indexOf(step);
  return (
    <ol className="qs-progress" aria-label="Setup progress">
      {ORDER.map((key, i) => (
        <li key={key} className={cn("qs-progress-step", i < at && "is-past", i === at && "is-now")}>
          <span aria-hidden="true">{i < at ? <Check className="h-3 w-3" /> : i + 1}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The first question, and the only one that is about the product rather than the person.
 *
 * Asked first because it decides how much of the rest of the app they ever see, and
 * because a buyer who wanted an invoicing tool should not have to work out what the second
 * half of the sidebar is for before they have sent anything.
 */
function Halves({ answer, onDone }: { answer: boolean; onDone: () => void }) {
  const [saving, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const answerWith = (wantsPrivate: boolean) =>
    start(async () => {
      const state = await chooseWorkspaces(wantsPrivate);
      if (state?.error) {
        setError(state.error);
        return;
      }
      onDone();
    });

  return (
    <section className="qs-step">
      <h2 className="qs-question">What do you want Zevern for?</h2>
      <p className="qs-hint">You can change this later in Settings, under Modules.</p>

      <div className="qs-choices">
        <button type="button" disabled={saving} onClick={() => answerWith(false)} className="qs-choice">
          <span className="qs-choice-title">Just the work</span>
          <span className="qs-choice-detail">
            Leads, clients, quotes, projects and invoices. The private side stays out of the way.
          </span>
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => answerWith(true)}
          className={cn("qs-choice", answer && "is-on")}
        >
          <span className="qs-choice-title">The work and my own money</span>
          <span className="qs-choice-detail">
            Everything above, plus the private half: your own budget, bills, debts and goals.
          </span>
        </button>
      </div>

      {error && <p className="qs-error">{error}</p>}
    </section>
  );
}

/**
 * Whose name a document goes out under.
 *
 * The one required field is the name, because that is the one whose absence is visible to
 * a client: without it a quote is signed with an email address. Everything else on this
 * screen improves a document rather than rescuing it, so none of it blocks the answer.
 */
function Paperwork({ data, onDone }: { data: QuickstartData; onDone: () => void }) {
  const [state, action, pending] = useActionState<QuickstartState, FormData>(savePaperwork, undefined);

  /*
    Moving on is a consequence of the save, not part of drawing the screen. Calling the
    parent back while rendering asks React to change one component in the middle of
    another's render, which is the shape of bug that shows up as a stray warning months
    later — and the form beside this one has always done it from an effect.
  */
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <section className="qs-step">
      <h2 className="qs-question">Who does the work go out under?</h2>
      <p className="qs-hint">
        This is what a client reads at the top of a quote or an invoice. Your own name is a
        perfectly good answer.
      </p>

      <form action={action}>
        <Field
          label="Name on the paperwork"
          name="business_name"
          defaultValue={data.answers.businessName}
          placeholder="Ilija Korodić, or your company name"
          maxLength={160}
          required
          autoFocus
        />

        <Field
          label="Email a client should reply to (optional)"
          name="business_email"
          type="email"
          defaultValue={data.answers.businessEmail}
          placeholder="you@yourdomain.com"
          maxLength={160}
        />

        <Field
          label="Address (optional)"
          name="business_address"
          defaultValue={data.answers.businessAddress}
          placeholder="Street, town"
          maxLength={300}
        />

        <div className="grid grid-cols-[minmax(0,1fr)_130px] gap-2">
          <Field
            label="Tax or company number (optional)"
            name="vat_id"
            defaultValue={data.answers.vatId}
            placeholder="PIB, VAT, or nothing"
            maxLength={40}
            help="Leave it empty if you are not registered."
          />
          <Select
            label="You price in"
            name="currency"
            defaultValue={data.answers.currency}
            options={CURRENCY_OPTIONS}
          />
        </div>

        {state?.error && <p className="qs-error">{state.error}</p>}

        <Button type="submit" variant="primary" disabled={pending} className="w-full">
          {pending ? "Saving…" : "Save and carry on"}
        </Button>
      </form>
    </section>
  );
}

/**
 * What they sell, which is the answer that pays for the whole run.
 *
 * Offered as trades rather than as an empty table, because "what do you sell" is a hard
 * question to answer into a blank field and an easy one to answer by correcting somebody
 * else's guess. Tapping a trade fills three rows with the lines that trade quotes; every
 * one of them can be renamed, repriced or deleted, and the empty row at the bottom is
 * always there for the work nobody guessed.
 */
function Services({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState<QuickstartState, FormData>(saveServices, undefined);
  const [rows, setRows] = useState<ServiceRow[]>([blankService(), blankService(), blankService()]);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  const fillFrom = (trade: (typeof TRADES)[number]) =>
    setRows((was) => {
      // Whatever has been typed stays; the suggestions land in the rows still empty.
      const typed = was.filter((r) => r.label.trim() !== "");
      const suggested = trade.services.map((label) => ({ ...blankService(), label }));
      return [...typed, ...suggested, blankService()];
    });

  const patch = (key: number, part: Partial<ServiceRow>) =>
    setRows((was) => was.map((r) => (r.key === key ? { ...r, ...part } : r)));

  const named = rows.filter((r) => r.label.trim() !== "");

  return (
    <section className="qs-step">
      <h2 className="qs-question">What do you sell, and for how much?</h2>
      <p className="qs-hint">
        A quote is built by picking from this list, so it is the one answer that saves real
        typing later. Rough prices are fine — a quote can change them.
      </p>

      <div className="qs-trades" role="group" aria-label="Start from a trade">
        {TRADES.map((trade) => (
          <button key={trade.key} type="button" onClick={() => fillFrom(trade)} className="qs-trade">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {trade.label}
          </button>
        ))}
      </div>

      <form action={action}>
        <div className="qs-rows">
          {rows.map((row) => (
            <div key={row.key} className="qs-row">
              <input
                value={row.label}
                onChange={(e) => patch(row.key, { label: e.target.value })}
                placeholder="Something you sell"
                maxLength={120}
                className="qs-row-label"
                aria-label="Service"
              />
              {/*
                The same field every other amount in the app uses, so 60.000 is sixty
                thousand here too. A plain box read "60.000" as sixty — the dot is a
                thousands mark to anybody typing in dinars — and the row keeps the plain
                figure the field hands back, which is what goes to the server.
              */}
              <MoneyField
                name={`service-price-${row.key}`}
                value={row.price}
                onValueChange={(plain) => patch(row.key, { price: plain })}
                placeholder="0"
                inputClassName="mono qs-row-price"
                aria-label="Price"
              />
              <button
                type="button"
                onClick={() => setRows((was) => (was.length > 1 ? was.filter((r) => r.key !== row.key) : was))}
                className="qs-row-drop"
                aria-label="Remove this line"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRows((was) => [...was, blankService()])}
          className="qs-add"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add another
        </button>

        <input
          type="hidden"
          name="services"
          value={JSON.stringify(named.map((r) => ({ label: r.label.trim(), price: r.price })))}
        />

        {state?.error && <p className="qs-error">{state.error}</p>}

        <div className="qs-finish">
          <Button type="submit" variant="primary" disabled={pending || named.length === 0}>
            {pending ? "Saving…" : `Save ${named.length || ""} and finish`.trim()}
          </Button>
          <button type="button" onClick={onDone} className="qs-card-skip">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Skip this
          </button>
        </div>
      </form>
    </section>
  );
}
