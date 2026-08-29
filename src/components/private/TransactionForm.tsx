"use client";

import { useActionState, useEffect, useState } from "react";
import { saveTransaction, deleteTransaction, type MoneyState } from "@/app/(app)/private/actions";
import { Field } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { TxItems } from "@/components/private/TxItems";
import { itemsArePriced, itemsTotal, parseItems } from "@/lib/money/items";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import {
  CURRENCY_OPTIONS,
  TX_KIND_ALL,
  TX_KIND_OPTIONS,
  canFileInto,
  isGoalKind,
  isPayingKind,
  isLoanKind,
  rateFor,
  type Rates,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import type {
  LoanLine,
  MoneyAccount,
  MoneyBudgetPlan,
  MoneyCategory,
  MoneyGoal,
  TransactionRow,
} from "@/lib/types";
import { ChipPicker } from "@/components/ui/ChipPicker";
import { todayISO } from "@/lib/format";
import { useDefaultCurrency, useMoney } from "@/lib/money/currency";

export type TxFormData = {
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  goals: MoneyGoal[];
  /** The 'added only' budgets whose period covers today — see `getAddableBudgets`. */
  budgets?: MoneyBudgetPlan[];
  /** Open debts, so a movement can say which one it belongs to. */
  loans: LoanLine[];
  rates: Rates;
};

/**
 * What the name field asks for depends on what the entry is. "Name" is accurate and
 * says nothing; "What did you buy?" gets a real answer typed into it.
 */
/** The value the debt picker uses to mean "none of these — make one". */
const NEW_LOAN = "__new";

const TITLE_LABEL: Record<string, string> = {
  expense: "What did you buy?",
  income: "Where is it from?",
  transfer: "What is this move?",
  saving: "What is this for?",
  withdraw: "What is it going on?",
  loan_out: "Who is it for?",
  loan_in: "Who is it from?",
};

export function TransactionForm({
  tx,
  data,
  defaultKind = "expense",
  returnTo,
  onSaved,
}: {
  tx?: TransactionRow;
  data: TxFormData;
  defaultKind?: string;
  returnTo?: "quick";
  onSaved?: () => void;
}) {
  const { fmt } = useMoney();
  const fallback = useDefaultCurrency();
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(
    saveTransaction,
    undefined,
  );
  const [kind, setKind] = useState(tx?.kind ?? defaultKind);
  const [budgetId, setBudgetId] = useState<string[]>(tx?.budget_id ? [tx.budget_id] : []);
  const [currency, setCurrency] = useState(tx?.currency ?? fallback);
  // `tx.amount` is null on an entry logged without a price, and `String(null)` is the
  // word "null" — which is what the field would have opened with.
  const [amount, setAmount] = useState(tx?.amount == null ? "" : String(tx.amount));

  /*
    The list, and the figure it makes.

    Read once on mount rather than on every render: the entry does not change under the
    form, and re-parsing would hand `TxItems` a new array each pass and reset the rows
    somebody is typing into.
  */
  /*
    One thing, or several.

    Both were on screen at once — a "What did you buy?" field and an item list under
    it — which is the form asking the same question twice in two shapes and letting you
    answer both. Most entries are one coffee; some are a receipt with six lines. Those
    want different forms, so the form asks which it is first and then becomes that one.

    An entry that already has a list opens on the list. Nothing else could be right:
    the answer is already there.
  */
  const [initialItems] = useState(() => parseItems(tx?.items));
  const [many, setMany] = useState(() => initialItems.length > 0);
  const [itemsSum, setItemsSum] = useState(() => itemsTotal(initialItems));
  const [itemCount, setItemCount] = useState(initialItems.length);
  /* Only a list where every line carries a figure can stand in for the amount. */
  const [fromItems, setFromItems] = useState(() => itemsArePriced(initialItems));
  /*
    A debt can be created from the movement that starts it.

    Sending someone to a separate screen to declare a debt before they can record
    lending them money is asking them to model their finances before describing them.
    The first movement is the debt: its name, its date and — for anything but a credit —
    its total are all already being typed.
  */
  const [loanChoice, setLoanChoice] = useState<string>(tx?.loan_id ?? "");

  const { accounts, categories, goals, loans, rates, budgets = [] } = data;

  /*
    The row offers five, plus whatever this entry already is.

    An entry put aside on the goals screen still has to be editable from the ledger, and
    a kind the row cannot show is one the form would silently rewrite the moment
    anything else was saved. Computed from the props rather than from the live `kind`,
    so the extra button does not vanish from under the pointer when another is pressed.
  */
  const opened = tx?.kind ?? defaultKind;
  /*
    A transfer needs somewhere to go, and with one account there is nowhere.

    The server has always refused it — "A transfer needs two different accounts" — so
    the button could only ever be pressed to be told no. Offering an action whose only
    outcome is an error is worse than not offering it: it costs a tap, a read and a
    correction to teach what the row could have said by staying quiet.
  */
  const offered = TX_KIND_OPTIONS.filter((k) => k.value !== "transfer" || accounts.length > 1);
  const kindOptions = offered.some((k) => k.value === opened)
    ? offered
    : [...offered, ...TX_KIND_ALL.filter((k) => k.value === opened)];
  const rate = currency === "RSD" ? 1 : rateFor(currency, rates);
  const parsed = Number(String(amount).replace(",", ".")) || 0;

  /*
    The budgets this entry could actually land in, recomputed as the kind is switched.

    Switching a saved entry from spending to income has to take its budget with it, or the
    form would carry a hidden id the new kind cannot use — the control would be gone from
    the screen and the filing would still be posted.
  */
  const filableBudgets = budgets.filter((b) => canFileInto(kind, b.kind));
  const budgetOffered = filableBudgets.some((b) => b.id === budgetId[0]);

  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }));
  /*
    A transfer is nearly always one movement: money off a card or out of the bank, into
    a pocket. Money out of an ATM is not spending — it is the same dinars in a different
    place — and the app has always been able to say so; what it could not do was say it
    quickly. Defaulting the two ends to bank-out, cash-in makes "withdraw cash" a matter
    of typing the figure, and every other transfer is still two dropdowns away.
  */
  const cashAccount = accounts.find((a) => a.kind === "cash");
  const fromDefault =
    kind === "transfer"
      ? (accounts.find((a) => a.kind !== "cash")?.id ?? accounts[0]?.id ?? "")
      : (accounts[0]?.id ?? "");
  const categoryOptions = categories
    .filter((c) => (kind === "income" ? c.kind === "income" : c.kind === "expense"))
    .map((c) => ({ value: c.id, label: c.name }));
  /*
    Only the goals this kind can belong to.

    A goal that collects is fed by money set aside; one being paid off is fed by an
    ordinary expense. Offering both lists to both kinds would let an instalment land on
    a savings pot, where it would read as money still held — so the list is narrowed
    here, and the pairing is checked again on the server.
  */
  const payingGoals = goals.filter((g) => g.direction === "expense");
  const goalPool = isPayingKind(kind)
    ? payingGoals
    : goals.filter((g) => g.direction !== "expense");
  // A goal that has since been closed is no longer offered, but an entry already
  // pointing at one still has to be able to name it — otherwise editing that entry
  // would quietly move the money to whatever sat at the top of the list.
  const goalOptions = goalPool.map((g) => ({ value: g.id, label: g.name }));
  const loanOptions = loans
    .filter((l) => l.settled_on == null)
    .map((l) => ({
      value: l.id,
      label: `${l.name} — ${l.direction === "lent" ? "owed to you" : "you owe"}`,
    }));
  if (isLoanKind(kind)) loanOptions.push({ value: NEW_LOAN, label: "＋ A new debt" });
  if (tx?.goal_id && !goalPool.some((g) => g.id === tx.goal_id)) {
    goalOptions.unshift({ value: tx.goal_id, label: `${tx.goal?.name ?? "Goal"} (closed)` });
  }
  /*
    Same rule for a debt that has since been settled. It drops out of the list above,
    and an entry pointing at it would otherwise reopen showing whatever sits at the top
    — quietly moving an instalment onto somebody else's loan.
  */
  if (tx?.loan_id && !loanOptions.some((o) => o.value === tx.loan_id)) {
    loanOptions.unshift({ value: tx.loan_id, label: "That debt (settled)" });
  }

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  return (
    <div className="flex h-full flex-col">
      <form action={formAction} className="flex-1">
        {tx && <input type="hidden" name="id" value={tx.id} />}
        {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
        <input type="hidden" name="kind" value={kind} />
        {/*
          A filing the current kind cannot use is cleared on the way out rather than left
          in state, so switching kind and saving cannot post an id the form stopped showing.
        */}
        {!budgetOffered && <input type="hidden" name="budget_id" value="" />}

        {/* Kind — one tap, no dropdown. Three to a row until there is room for all five. */}
        <div className="mb-3.25 grid grid-cols-3 gap-1 rounded-ctrl border border-line bg-white/[0.03] p-1 min-[400px]:grid-cols-5">
          {kindOptions.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={cn(
                "rounded-[6px] px-1 py-2 text-[12px] font-bold transition-colors",
                kind === k.value ? "bg-gold text-on-gold" : "text-muted hover:bg-white/4 hover:text-ink",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>

        {/*
          The amount is optional on a purchase and required on everything else.

          You leave a shop knowing what you bought and not always what it cost, and the
          old form's only answer to that was to make something up — a figure that reads
          exactly like a real one a month later. Everything else here has a figure by the
          time you know it happened: the bank states income, the ATM states a transfer,
          and a goal's `reserved` cannot hold an unknown claim without every "free to
          spend" number in the app becoming a guess.
        */}
        {/*
          Asked before anything is typed, because it decides what the rest of the form
          is. Switching back to one thing drops the list — which is the point: the two
          are alternatives, not layers, and an entry carrying both would have two
          answers to "what was this".
        */}
        {kind === "expense" && (
          <div className="zv-seg" role="group" aria-label="Is this one thing or several?">
            <button
              type="button"
              onClick={() => {
                setMany(false);
                setItemsSum(0);
                setItemCount(0);
                setFromItems(false);
              }}
              aria-pressed={!many}
              className={many ? undefined : "is-on"}
            >
              One thing
            </button>
            <button
              type="button"
              onClick={() => {
                setMany(true);
                setItemsSum(itemsTotal(initialItems));
                setItemCount(initialItems.length);
                setFromItems(itemsArePriced(initialItems));
              }}
              aria-pressed={many}
              className={many ? "is-on" : undefined}
            >
              Several things
            </button>
          </div>
        )}

        <div className="grid grid-cols-[1fr_110px] gap-2">
          {/*
            The field is yours; the list only offers.

            It used to take itself over the moment a priced list existed — read-only,
            printing the sum, rewriting itself while you were still typing a price two
            fields below. Which is the app filling in a form over your shoulder, and it
            is startling even when the figure it writes is right.

            Now nothing is written for you. The list says what it adds up to underneath,
            and if you leave the field empty that sum is what gets saved. Type something
            and yours is kept — the two are allowed to differ, because sometimes a
            receipt total really is not the sum of the lines you bothered to write down.
          */}
          <MoneyField
            label={kind === "expense" ? "Amount (optional)" : "Amount"}
            name="amount"
            value={amount}
            onValueChange={setAmount}
            placeholder={kind === "expense" ? "Leave empty if you do not know" : "0"}
            autoFocus
            required={kind !== "expense" && !fromItems}
            help={
              fromItems
                ? `${itemCount} ${itemCount === 1 ? "item" : "items"} below add up to ${fmt(itemsSum)} — leave this empty to use it`
                : kind === "expense"
                  /*
                    One line, not three.

                    The long version explained where an unpriced entry goes and what
                    picks it up later, which is worth knowing once and is then a
                    paragraph under the field you type in most often. The panel it sits
                    on has eight fields; every one of them spending three lines on help
                    is how a form becomes a page.
                  */
                  ? "No price yet? Leave it empty."
                  : undefined
            }
          />
          <Select
            label="Currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={CURRENCY_OPTIONS}
          />
        </div>

        {/*
          Directly under the amount, because the amount is what you came to type and
          this is the next thing you know. Required: an entry with no name is the row
          you cannot account for three weeks later.
        */}
        {/*
          The question changes once there is a list.

          "What did you buy?" is the right question on an entry that is one thing. The
          moment six things are itemised below, it is a question that has already been
          answered at length — and asking it again, in a field that will not let you
          submit until you fill it, reads as the form not having noticed. So it becomes
          the one thing the list does not say: where.

          Optional then, too. The list is the record; a shop name is useful and not
          worth blocking a save over.
        */}
        <Field
          label={many ? "Where from? (optional)" : (TITLE_LABEL[kind] ?? "Name")}
          name="title"
          defaultValue={tx?.title ?? ""}
          maxLength={80}
          placeholder={
            many
              ? "Maxi, pijaca, apoteka…"
              : kind === "income"
                ? "Client, invoice, gift…"
                : "Shop, bill, ticket…"
          }
          required={!many}
        />

        {/*
          Purchases only, for now.

          A transfer between two accounts has no contents, and a deposit into a goal is
          one movement of money that is already yours. The receipt with several things
          on it is a thing you buy, so that is where the list is offered — anywhere else
          it would be an empty box asking a question with no answer.
        */}
        {kind === "expense" && many && (
          <TxItems
            initial={initialItems}
            currency={currency}
            onTotalChange={(total, count, priced) => {
              setItemsSum(total);
              setItemCount(count);
              setFromItems(priced);
            }}
          />
        )}

        {currency !== "RSD" && (
          <Field
            label={`Rate (1 ${currency} in RSD)`}
            name="rate"
            inputMode="decimal"
            defaultValue={tx ? String(tx.rate) : String(rate)}
            help={parsed > 0 ? `≈ ${fmt(parsed * rate)} at the saved rate` : "From Setup — change it only for this entry."}
          />
        )}

        <Select
          // Remounted when the kind changes so the default above can actually take —
          // an uncontrolled select keeps whatever it was given on mount otherwise, and
          // switching to Transfer would leave the cash account sitting on both ends.
          key={`account-${kind}`}
          label={
            kind === "transfer"
              ? "From account"
              : kind === "saving"
                ? "Set aside on"
                : kind === "withdraw"
                  ? "Back to account"
                  : kind === "loan_out"
                    ? "Out of account"
                    : kind === "loan_in"
                      ? "Lands on"
                      : "Account"
          }
          name="account_id"
          defaultValue={tx?.account_id ?? fromDefault}
          placeholder={accountOptions.length ? "No account" : "No accounts yet"}
          options={accountOptions}
          help={
            isGoalKind(kind)
              ? kind === "saving"
                ? "The money stays here. It only stops counting as free to spend."
                : "The goal lets this money go and it is free to spend again."
              : undefined
          }
        />

        {kind === "transfer" && (
          <Select
            key={`to-account-${kind}`}
            label="To account"
            name="to_account_id"
            defaultValue={tx?.to_account_id ?? cashAccount?.id ?? ""}
            placeholder="Pick an account"
            options={accountOptions}
            /*
              The button for this kind is hidden with one account, but the form is still
              reachable at `?new=transfer` — from the Withdraw cash shortcut, a bookmark,
              or a link written before the second account was gone. Saying it here
              catches all of those; hiding the button only catches the row.
            */
            error={accounts.length < 2}
            help={
              accounts.length < 2
                ? "A transfer needs somewhere to go. Add a second account in Setup — cash, for instance."
                : cashAccount && !tx
                  ? "Money out of an ATM lands here. It is not spending — the dinars just moved."
                  : undefined
            }
          />
        )}

        {(kind === "expense" || kind === "income") && (
          <Select
            label="Category"
            name="category_id"
            defaultValue={tx?.category_id ?? ""}
            placeholder={categoryOptions.length ? "No category" : "No categories yet"}
            options={categoryOptions}
          />
        )}

        {isGoalKind(kind) && (
          <Select
            label={kind === "withdraw" ? "Out of goal" : "Goal"}
            name="goal_id"
            defaultValue={tx?.goal_id ?? goalPool[0]?.id ?? ""}
            placeholder={goalOptions.length ? "Pick a goal" : "No goals yet"}
            options={goalOptions}
          />
        )}

        {/*
          Which goal this pays down — offered, never required, and only once there is
          one to name.

          The same shape as the debt picker below it: an ordinary expense that also
          clears something has to be able to say what, and an expense that clears
          nothing must not be made to answer a question about it. So the field appears
          with the first paying-off goal and starts on nothing.
        */}
        {isPayingKind(kind) && payingGoals.length > 0 && (
          <Select
            label={kind === "income" ? "Refund on" : "Towards"}
            name="goal_id"
            defaultValue={tx?.goal_id ?? ""}
            placeholder={kind === "income" ? "Not a refund" : "Not towards a goal"}
            options={goalOptions}
          />
        )}

        {/*
          Which debt this belongs to.

          Required on the two loan kinds, because a movement that counts as neither
          spending nor income and belongs to nothing is indistinguishable from an entry
          somebody abandoned half-finished.

          Offered on an expense, and that is the instalment. A rate is a real cost of
          the month and stays an ordinary expense — but naming the debt is what makes it
          pay that debt down instead of just leaving the account.

          Only when there is a debt, though. It used to sit on every purchase, so a
          coffee asked which loan it was paying off — a question with one possible
          answer, on the form people fill in most often. A field whose only honest reply
          is "nothing" is not a question, it is furniture.
        */}
        {(isLoanKind(kind) || (kind === "expense" && loanOptions.length > 0)) && (
          <Select
            label={kind === "expense" ? "Pays off" : "Which debt"}
            name="loan_id"
            value={loanChoice}
            onChange={(e) => setLoanChoice(e.target.value)}
            placeholder={kind === "expense" ? "Nothing — an ordinary expense" : "Pick a debt"}
            options={loanOptions}
            help={
              kind === "expense"
                ? "Set this on an instalment and the debt falls by itself."
                : kind === "loan_out"
                  ? "The money leaves the account, but it is not spending."
                  : "The money lands on the account, but it is not income."
            }
          />
        )}

        {isLoanKind(kind) && loanChoice === NEW_LOAN && (
          <>
            <Field
              label="What is the debt called?"
              name="loan_name"
              maxLength={80}
              placeholder={kind === "loan_out" ? "Marko" : "Car credit"}
              required
            />
            {/*
              Left empty this is the amount above, which is right for everything except
              a credit: 550.000 arrives and 600.000 is repaid, and it is the repayment
              figure the debt has to be measured against. Asking for it always would
              make a tenner lent to a friend a two-field form.
            */}
            <MoneyField
              label="Total to settle"
              name="loan_total"
              placeholder={amount || "same as above"}
              help="Only different for a credit — what you repay in the end, interest included."
            />
          </>
        )}

        {/*
          Date and time, with the time plainly optional.

          It is here rather than in quick add because quick add is two taps and stays
          two taps. In the full form it costs one field and buys the only ordering that
          can tell three coffees on the same afternoon apart — and, a year from now, the
          answer to when the money actually goes.
        */}
        <div className="grid grid-cols-[1fr_130px] gap-2">
          <Field
            label="Date"
            name="occurred_on"
            type="date"
            defaultValue={tx?.occurred_on ?? todayISO()}
          />
          <Field
            label="Time"
            name="occurred_at"
            type="time"
            defaultValue={tx?.occurred_at ? String(tx.occurred_at).slice(0, 5) : ""}
          />
        </div>

        {/*
          Putting an entry in a budget you keep by hand.

          Only the 'added only' budgets are offered, and only the ones whose current
          period covers today: filing a dinner into a holiday that ended in July would
          look like it worked and would be counted by nothing. The 'all transactions'
          budgets are deliberately absent — they decide for themselves what belongs to
          them, and a control that appeared to let you overrule that would be lying.

          And only the ones this kind of entry can actually reach. That filter was missing
          and it was the same fault as the date one: a salary offered a holiday would file
          itself into a budget that counts no income, and — because an entry carrying a
          budget id is then deliberately excluded from every sweeping budget — would be
          counted by nothing anywhere. `canFileInto` sits beside the function that does the
          counting, so the offer and the arithmetic cannot drift apart.
        */}
        {filableBudgets.length > 0 && (
          <ChipPicker
            label="Add to a budget"
            name="budget_id"
            chips={filableBudgets.map((b) => ({ value: b.id, label: b.name, color: b.color }))}
            selected={budgetId}
            onChange={setBudgetId}
            emptyLabel="No budget"
            emptyMeans="Counted by your standing budgets in the usual way."
          />
        )}

        <Field
          label="Note"
          name="note"
          defaultValue={tx?.note ?? ""}
          placeholder="Anything the name does not say"
        />

        {/*
          The button that finishes the job stays where you can reach it.

          This form has grown — a kind picker, an amount, a name, a list of what was in
          the bag, an account, a category, a date — and Save sat at the bottom of all of
          it. On a phone that is two screens of scrolling away from the field you were
          typing in, and the one thing you are certain you want to do next.

          Sticky inside the panel's own scroll rather than a fixed bar bolted to the
          panel: it stays with the form it belongs to, so scrolling past the form to the
          delete control below releases it, which is right — Save is not an action that
          applies down there.
        */}
        <div className="zv-form-actions">
          {state?.error && (
            <p className="mb-2.5 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
              {state.error}
            </p>
          )}

          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending ? "Saving…" : tx ? "Save changes" : "Save"}
          </Button>
        </div>
      </form>

      {tx && (
        <div className="mt-4 border-t border-line pt-4">
          <DeleteButton
            action={deleteTransaction.bind(null, tx.id)}
            label="Delete entry"
            confirmText="Delete this entry?"
          />
        </div>
      )}
    </div>
  );
}

