"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  moveBetweenGoals,
  saveTransaction,
  type MoneyState,
} from "@/app/(app)/private/actions";
import { Button } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";

import { useMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import type { AccountBalance } from "@/lib/data/money";
import type { GoalLine } from "@/lib/types";
import { caps, field } from "./shared";
import { firstStepFor } from "./reading";
import { toRsd } from "@/lib/money";
import { fromRsd } from "@/lib/money/display";

/**
 * The one deliberate act on this screen: money moving between an account and a goal.
 * It gets its own footer, its own caption and its own ground, so it never reads as one
 * more box in a row.
 *
 * Both directions live here, because taking money back out is the same decision made
 * the other way round — and hiding it somewhere else is what left a goal claiming
 * dinars that had already been spent.
 */
export function MoveMoney({
  goal,
  accounts,
  siblings,
  done,
}: {
  goal: GoalLine;
  accounts: AccountBalance[];
  /** The other open goals — where an overshoot can go instead of coming back out. */
  siblings: GoalLine[];
  done: boolean;
}) {
  const { fmt, code, display } = useMoney();
  const router = useRouter();
  const [state, setState] = useState<MoneyState>();
  const [pending, startTransition] = useTransition();
  /*
    Three things can happen to money here, not two. Overshooting a goal is ordinary —
    a round number, a standing order that kept running — and the answer was to take it
    out and put it into the other goal by hand, two entries with the money reading as
    free to spend in between. "Move" does both at once.
  */
  const [mode, setMode] = useState<"in" | "out" | "move">("in");

  /*
    Submitting through a transition rather than `useActionState`, so the field can be
    emptied the moment the deposit lands. An uncontrolled input cleared itself, but the
    amount has to be readable while it is being typed — that is what the two warnings
    below are reading — and a controlled field only empties if something empties it.
  */
  const submit = (formData: FormData) => {
    startTransition(async () => {
      const next = moving
        ? await moveBetweenGoals(undefined, formData)
        : await saveTransaction(undefined, formData);
      setState(next);
      if (!next?.ok) return;
      setAmount("");
      router.refresh();
    });
  };

  const canTakeOut = goal.saved > 0;
  const canMove = canTakeOut && siblings.length > 0;
  const taking = mode === "out" && canTakeOut;
  const moving = mode === "move" && canMove;
  // The account this goal used last is the one it will almost certainly use again.
  const preferred = goal.lastAccountId ?? accounts[0]?.id ?? "";
  const only = accounts.length === 1 ? accounts[0] : null;

  /*
    Two things this screen used to let you do without a word.

    You could set aside more than the account had free — the goal would claim dinars
    that were not there, and every "free money" figure in the app would be wrong by
    that much. And you could pour money into a goal long past its target with nothing
    saying so. The first is a mistake and the server refuses it; the second is only
    ever a surprise, so it is said out loud and then allowed.
  */
  const [amount, setAmount] = useState("");
  const [chosen, setChosen] = useState(preferred);
  const account = accounts.find((a) => a.id === (only?.id ?? chosen)) ?? null;
  /*
    Typed in the currency being read, measured in dinars.

    The account balance, the goal's target and everything `goalBalance` knows are dinar
    figures, so a euro typed here becomes dinars before it is compared to any of them —
    at the same rate the rest of the screen is being converted with. The entry itself
    keeps the currency it was typed in, exactly like an ordinary entry does.
  */
  const typed = toRsd(Number(amount) || 0, code, display.rates);
  const target = Math.max(Number(goal.target_rsd) || 0, 0);
  const needs = target > 0 ? Math.max(target - goal.saved, 0) : null;

  // A move nets to nothing on the account — the same dinars leave one goal and land on
  // another — so neither warning applies to it.
  const beyondAccount = !taking && !moving && account !== null && typed > account.free + 0.5;
  const beyondTarget =
    !taking && !moving && !beyondAccount && needs !== null && typed > needs + 0.5 && typed > 0;

  /*
    The first deposit, offered.

    An empty goal asks an open question — "how much?" — at the exact moment there is no
    information to answer it with, and an open question at zero progress is where goals
    are abandoned. A round tenth of the target is small enough to say yes to and large
    enough to move the bar off nothing, which is the whole job of the first one: turn
    0% into a number, because the second deposit is never the hard one.
  */
  // Same figure the collapsed card offers, from the same function.
  const firstStep = taking || moving ? 0 : firstStepFor(target, goal.saved);
  /** What this goal is holding above its own target — the obvious thing to move. */
  const excess = needs !== null ? Math.max(goal.saved - target, 0) : 0;

  // The amount is left uncontrolled on purpose: React empties an uncontrolled field
  // once its form action settles, so the box clears itself and the same figure cannot
  // go in twice by accident. Holding it in state was what kept the old amount sitting
  // there after a save.
  return (
    <form
      action={submit}
      className="goal-move-panel border-t border-line-soft bg-white/[0.02] py-4 pr-4 pl-5"
    >
      {moving ? (
        <input type="hidden" name="from_goal_id" value={goal.id} />
      ) : (
        <>
          <input type="hidden" name="kind" value={taking ? "withdraw" : "saving"} />
          <input type="hidden" name="goal_id" value={goal.id} />
          <input type="hidden" name="currency" value={code} />
          <input type="hidden" name="return_to" value="stay" />
        </>
      )}

      <div className="mb-3 flex items-center justify-between gap-2">
        {/* With nothing in the goal yet there is only one thing to do here, so the
            caption stays a caption rather than pretending to be a choice. */}
        {canTakeOut ? (
          <div
            className="goal-move-tabs flex min-w-0 items-center gap-1"
            role="group"
            aria-label={`What happens to money on ${goal.name}`}
          >
            {(
              [
                { key: "in", label: "Put aside", on: !taking && !moving },
                { key: "out", label: "Take out", on: taking },
                ...(canMove ? [{ key: "move", label: "Move", on: moving }] : []),
              ] as { key: "in" | "out" | "move"; label: string; on: boolean }[]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setMode(tab.key);
                  // The overshoot is what you came to move, so it is already typed in.
                  if (tab.key === "move" && !amount && excess > 0) setAmount(String(excess));
                }}
                aria-pressed={tab.on}
                /*
                  A segmented control rather than three pills in a rounded trough.

                  The old set announced itself: uppercase, letter-spaced, a border around
                  the group and a filled pill on the active one — four devices to say
                  which of three words is current. It read louder than the amount field
                  under it, which is the control people actually came for.

                  Now the group is flat, the words are sentence case at reading size, and
                  the only mark of state is a hairline under the active one. Same job,
                  one device instead of four.
                */
                className={cn("goal-move-tab", tab.on && "is-on")}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 shrink-0 text-gold" />
            <span className={cn(caps, "truncate")}>{done ? "Add more" : "Put money aside"}</span>
          </span>
        )}

        {only ? (
          <span className="min-w-0 truncate text-[11px] text-faint">
            {taking ? "back to" : "from"} {only.name}
          </span>
        ) : accounts.length === 0 ? (
          <span className="text-[11px] text-faint">no account yet</span>
        ) : null}
      </div>

      {/*
        Amount, account and the button on one line.

        They were three stacked blocks, and that stack was most of why an open card ran
        two hundred pixels taller than a shut one — which is the whole reason the card
        beside it was left with space nobody could fill. Laid out across instead of down,
        opening a card costs roughly ninety pixels, and at that size the raggedness in
        the row stops being something to design around.

        The grid collapses to one column under 480px, where three controls across would
        each be too narrow to use.
      */}
      <div className="goal-move-controls">
        {/* The amount and its currency are one control — the dinars are not a second question. */}
        <div className="flex min-w-0 items-center rounded-ctrl border border-line bg-white/[0.035] focus-within:border-gold focus-within:shadow-ring">
          <MoneyField
            className="contents"
            name="amount"
            value={amount}
            onValueChange={setAmount}
            placeholder="0"
            aria-label={taking ? `Take money out of ${goal.name}` : `Add money to ${goal.name}`}
            inputClassName="mono min-w-0 flex-1 bg-transparent px-2.5 py-2 text-right text-[14px] text-ink placeholder:text-faint focus:outline-none"
          />
          <span className="mono border-l border-line-soft px-2 py-2 text-[11.5px] font-semibold text-muted">
            {code}
          </span>
        </div>
        {only || accounts.length === 0 ? (
          <input type="hidden" name="account_id" value={only?.id ?? ""} />
        ) : (
          <select
            name="account_id"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            aria-label={taking ? "Account the money goes back to" : "Account the money comes off"}
            className={cn(field, "w-full min-w-0 scheme-dark")}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id} className="bg-surface">
                {taking ? "Back to" : "From"} {a.name}
              </option>
            ))}
          </select>
        )}

        {/* Fixed width so "Saving…" does not shrink the control mid-submit. */}
        <Button
          type="submit"
          variant="secondary"
          className="money-premium-button goal-move-submit w-24 shrink-0 px-2 text-[12.5px]"
          disabled={pending || beyondAccount}
        >
          {pending ? "Saving…" : moving ? "Move" : taking ? "Take out" : "Put aside"}
        </Button>
      </div>

      {/* Only Move has a destination, and it takes the line under the controls. */}
      {moving && (
        <select
          name="to_goal_id"
          defaultValue={siblings[0]?.id ?? ""}
          aria-label={`Goal the money from ${goal.name} is moving to`}
          className={cn(field, "mt-2 w-full scheme-dark")}
        >
          {siblings.map((g) => (
            <option key={g.id} value={g.id} className="bg-surface">
              To {g.name}
            </option>
          ))}
        </select>
      )}

      {taking && (
        <p className="mt-2 text-[11px] text-faint">
          Holds {fmt(goal.saved)}. Taking it out frees it to spend again.
        </p>
      )}

      {/*
        One line instead of three. The long version explained that the money never
        becomes spendable in transit — true, and the same sentence is already on the
        panel at the top of this screen. Repeating it inside every card is what made
        this mode tall.
      */}
      {moving && (
        <p className="mt-2 text-[11px] text-faint">
          Holds {fmt(goal.saved)}
          {excess > 0 && <>, {fmt(excess)} above target</>} · moves the same day, never
          becoming free to spend.
        </p>
      )}

      {firstStep > 0 && !amount && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Nothing in yet.{" "}
          <button type="button" onClick={() => setAmount(String(Math.round(fromRsd(firstStep, display))))} className="goal-first-step">
            Start with {fmt(firstStep)}
          </button>{" "}
          — that is {Math.round((firstStep / target) * 100)}% of the way.
        </p>
      )}

      {beyondAccount && account && (
        <p className="mt-2 text-[11px] leading-relaxed text-danger">
          {account.name} only has {fmt(account.free)} free — the rest of what is on it is
          already claimed by another goal. Put aside more than that and this goal would be
          holding money that is not there.
        </p>
      )}

      {beyondTarget && needs !== null && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          That is {fmt(typed - needs)} more than this goal still needs
          {needs > 0 ? <> — {fmt(needs)} finishes it</> : " — it is already at its target"}.
          It will go in anyway if that is what you meant.
        </p>
      )}

      {state?.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

