"use client";

import { useActionState, useEffect, useState } from "react";
import { saveTransaction, deleteTransaction, type MoneyState } from "@/app/(app)/private/actions";
import { Field } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { TxItems } from "@/components/private/TxItems";
import { ReceiptScan } from "@/components/private/ReceiptScan";
import type { ScannedReceipt } from "@/lib/money/receipt";
import { itemsArePriced, itemsTotal, parseItems } from "@/lib/money/items";
import { fillFromPick, fillFromTyping, type Fill } from "@/lib/money/known";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { canFileInto, CURRENCY_OPTIONS, isGoalKind, isLoanKind, isPayingKind, NEW_LOAN, rateFor, TX_KIND_ALL, TX_KIND_OPTIONS, type Rates } from "@/lib/money";
import { cn } from "@/lib/utils";
import type {
  LoanLine,
  MoneyAccount,
  MoneyBudgetPlan,
  MoneyCategory,
  MoneyGoal,
  MoneyItem,
  TransactionRow,
} from "@/lib/types";
import { ChipPicker } from "@/components/ui/ChipPicker";
import { ItemPicker } from "@/components/ui/ItemPicker";
import { formatDate, todayISO } from "@/lib/format";
import { useDefaultCurrency, useMoney } from "@/lib/money/currency";

export type TxFormData = {
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  goals: MoneyGoal[];
  /** The 'added only' budgets whose period covers today — see `getAddableBudgets`. */
  budgets?: MoneyBudgetPlan[];
  /** Open debts, so a movement can say which one it belongs to. */
  loans: LoanLine[];
  /**
   * The things already bought, so a purchase can be picked instead of retyped.
   *
   * Optional: the form opens on screens that have no reason to read the list — a goal's
   * deposit, a debt movement — and an empty list simply makes the name field an ordinary
   * name field, which is what it was before.
   */
  items?: MoneyItem[];
  rates: Rates;
};

/**
 * What the name field asks for depends on what the entry is. "Name" is accurate and
 * says nothing; "What did you buy?" gets a real answer typed into it.
 */
/** The value the debt picker uses to mean "none of these — make one". */


const TITLE_LABEL: Record<string, string> = {
  expense: "What did you buy?",
  income: "Where is it from?",
  transfer: "What is this move?",
  saving: "What is this for?",
  withdraw: "What is it going on?",
  loan_out: "Who is it for?",
  loan_in: "Who is it from?",
};

/**
 * And what a good answer looks like.
 *
 * The label asks the question, the hint shows the shape of the reply — which on a loan
 * is a person. `Shop, bill, ticket…` sat under "Who is it for?" on the lending form:
 * the purchase form's wording left standing on a screen with no shop in it, telling
 * somebody about to write down money lent to a friend that the app wanted a receipt.
 *
 * Kinds left out fall through to the purchase hint, which is what they showed before.
 */
const TITLE_HINT: Record<string, string> = {
  expense: "Shop, bill, ticket…",
  income: "Client, invoice, gift…",
  loan_out: "Marko, Ana, the neighbour…",
  loan_in: "Marko, Ana, the bank…",
};

export function TransactionForm({
  tx,
  data,
  defaultKind = "expense",
  presetLoanId,
  returnTo,
  onSaved,
}: {
  tx?: TransactionRow;
  data: TxFormData;
  defaultKind?: string;
  /** A debt chosen before the form opened — a debt row links straight in to pay it. */
  presetLoanId?: string;
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
  /*
    The category is held rather than defaulted, so picking a thing off the shopping list
    can fill it. Keyed off the entry being edited, like every other default here.
  */
  const [categoryId, setCategoryId] = useState(tx?.category_id ?? "");
  const [budgetId, setBudgetId] = useState<string[]>(tx?.budget_id ? [tx.budget_id] : []);
  const [currency, setCurrency] = useState(tx?.currency ?? fallback);
  // `tx.amount` is null on an entry logged without a price, and `String(null)` is the
  // word "null" — which is what the field would have opened with.
  const [amount, setAmount] = useState(tx?.amount == null ? "" : String(tx.amount));

  /*
    What the shopping list is allowed to change. Which fields those are is decided in
    `@/lib/money/known` and tested there; here it is only the setting of them, and an
    absent key means a field nobody is touching.
  */
  /**
   * A receipt the server has read, poured into the form — and nothing more than that.
   *
   * Every field it touches stays editable, and the one it is least sure of it does not
   * touch at all: the category. A receipt says where the money went and not what it was
   * for, and the same shop is Groceries one trip and Work meals the next — so that stays
   * the one answer the person gives, which is also the answer the shopping list has
   * already been filling in by name.
   */
  const takeReceipt = (receipt: ScannedReceipt, seenOn: string | null) => {
    // A count and not a clock: the stamp only has to differ from the last one, and a
    // reading of the time taken during render is a value React is entitled to distrust.
    setScan((was) => ({ receipt, seenOn, stamp: (was?.stamp ?? 0) + 1 }));
    // Fiscal receipts are in dinars by definition; an entry opened in euros is not.
    setCurrency("RSD");
    setAmount(String(receipt.total));
    setTitle(receipt.store);
    if (receipt.items.length > 0) {
      setMany(true);
      setItemsSum(itemsTotal(receipt.items));
      setItemCount(receipt.items.length);
      setFromItems(itemsArePriced(receipt.items));
    }
  };

  const apply = (fill: Fill) => {
    if (fill.categoryId !== undefined) setCategoryId(fill.categoryId);
    if (fill.amount !== undefined) setAmount(fill.amount);
    if (fill.currency !== undefined) setCurrency(fill.currency);
  };

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
  /*
    The receipt that filled this form, when one did.

    Held whole rather than poured straight into the fields, for three reasons: the lines
    have to be handed to `TxItems` as its starting rows, the receipt number has to travel
    with the entry so the same slip can be recognised next time, and what was read has to
    be *shown* — a form that silently rearranges itself is a form you have to re-check
    field by field, which is more work than typing it.

    `stamp` is what makes a second scan replace the first. The date field and the item
    rows are uncontrolled, as they have always been, so changing a default is not enough
    to move them; keyed on this, they are built again from the new receipt.
  */
  const [scan, setScan] = useState<{
    receipt: ScannedReceipt;
    seenOn: string | null;
    stamp: number;
  } | null>(null);
  /* The rows the list starts from: the scanned ones once there are any. */
  const scannedRows = scan?.receipt.items ?? initialItems;
  const [many, setMany] = useState(() => initialItems.length > 0);
  /*
    One purchase, one name — which is the only entry the shopping list has anything to say
    about. A receipt with six things on it has its own list two fields down, and every
    other kind is a movement rather than a thing bought.
  */
  const shopping = kind === "expense" && !many;
  /*
    The name as it stands, only so the mark under it can answer for the right one.

    A one-thing purchase has no line to mark, so the entry's own name is what the shopping
    list would learn — and the same rule applies as on a receipt line: nothing goes on the
    list unless somebody says so, and `null` means nobody has said yet, so the name answers
    for itself.
  */
  const [title, setTitle] = useState(tx?.title ?? "");
  const [keepTitle, setKeepTitle] = useState<boolean | null>(null);
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
  /*
    Which debt this entry pays.

    `presetLoanId` is how a debt row opens this form already pointing at itself: paying a
    rate is the thing you do to a debt every month, and making you find it again in a
    list on the way is the kind of small friction that ends with the payment written down
    as an ordinary expense belonging to nothing.
  */
  const [loanChoice, setLoanChoice] = useState<string>(tx?.loan_id ?? presetLoanId ?? "");
  /*
    And what the new debt is called, which on a loan out is the name already typed.

    "Who is it for?" and "Who is it?" are one question asked twice — the form knew the
    answer at the top of the screen and asked for it again at the bottom, which is how
    `Zoran` above and `Zoan` below end up as two different people, one of them on the
    debts screen forever.

    `null` is nobody has typed here yet, so the field follows the name above. The first
    keystroke pins it — including one that empties it, because a field somebody cleared
    on purpose refilling itself is the same rudeness in the other direction. On a
    borrowing the two are genuinely different questions (`Raiffeisen` is not `Car
    credit`), so there it starts empty and the hint stays readable.
  */
  const [loanName, setLoanName] = useState<string | null>(null);

  const { accounts, categories, goals, loans, rates, budgets = [], items: known = [] } = data;

  /*
    The debt now named on a `loan_in`, when it is one running towards you.
    Only then does the sentence under the picker have something to correct.
  */
  const backToYou =
    kind === "loan_in" ? (loans.find((l) => l.id === loanChoice && l.direction === "lent") ?? null) : null;

  /* Folded: `money_items` holds one row per name whatever its case, so this must too. */
  const titleKey = title.trim().toLowerCase();
  const titleOnList =
    titleKey !== "" && known.some((i) => i.name.trim().toLowerCase() === titleKey);
  const keepingTitle = keepTitle ?? titleOnList;

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

    A goal being saved up holds money that is still on the account; one being paid off is
    fed by money that has already gone. Offering both lists to every kind would let an
    instalment land on a savings pot, where it would read as money still held — so the
    list is narrowed here, and the pairing is checked again on the server.

    Income is the one kind that can name either, and it is not a loophole — it is the
    same word meaning two things that are both true. Into a goal being saved up it is
    money that arrived and was kept: the balance rises, the claim rises with it, and
    `free to spend` does not move. Against a goal being paid off it is that payment
    coming back. Which one it is comes from the goal, not from the form, so there is
    nothing here for anybody to get wrong.
  */
  const payingGoals = goals.filter((g) => g.direction === "expense");
  const savingGoals = goals.filter((g) => g.direction !== "expense");
  const goalPool =
    kind === "income" ? goals : kind === "expense" ? payingGoals : savingGoals;
  /*
    With both kinds of goal in one list the name alone stops being enough — `Letovanje
    2027` and `Laptop instalments` look identical in a dropdown and do opposite things to
    the figure. The tag is added only when the list actually holds both.
  */
  const mixedGoals = payingGoals.length > 0 && savingGoals.length > 0 && kind === "income";
  // A goal that has since been closed is no longer offered, but an entry already
  // pointing at one still has to be able to name it — otherwise editing that entry
  // would quietly move the money to whatever sat at the top of the list.
  const goalOptions = goalPool.map((g) => ({
    value: g.id,
    label: mixedGoals
      ? `${g.name} — ${g.direction === "expense" ? "paying off" : "saving up"}`
      : g.name,
  }));
  const loanOptions = loans
    .filter((l) => l.settled_on == null)
    .map((l) => ({
      value: l.id,
      label: `${l.name} — ${l.direction === "lent" ? "owed to you" : "you owe"}`,
    }));
  /*
    On `loan_out` this always makes a debt running *towards* you — see the insert in
    `saveTransaction`, which reads the kind and writes `lent`. So the option says so.
    "＋ A new debt" was true about the row it creates and wrong about whose it is, and
    it is the only line on the screen offering to file money you have just handed over.
  */
  if (isLoanKind(kind))
    loanOptions.push({ value: NEW_LOAN, label: kind === "loan_out" ? "＋ Somebody new" : "＋ A new debt" });
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
        {/* Which paper receipt this entry came off, so scanning it twice can be noticed. */}
        <input type="hidden" name="receipt_no" value={scan?.receipt.number ?? tx?.receipt_no ?? ""} />
        {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
        <input type="hidden" name="kind" value={kind} />
        {/*
          A filing the current kind cannot use is cleared on the way out rather than left
          in state, so switching kind and saving cannot post an id the form stopped showing.
        */}
        {!budgetOffered && <input type="hidden" name="budget_id" value="" />}

        {/*
          Kind — one tap, no dropdown. Three to a row until there is room for all five.

          It is `zv-seg`, which is the control this app already uses for a row of choices:
          the workspace switch above every screen, `Is this one thing or several?` eight
          lines below this one, and `Which way does this goal run?` on the goal form. This
          row had its own answer — a flat gold slab under black text — which made the most
          used control on the busiest panel the one place the app spoke differently. The
          chosen half is tinted and gold-lettered here like everywhere else.
        */}
        <div className="zv-seg is-kinds" role="group" aria-label="What kind of entry is this?">
          {kindOptions.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={cn(kind === k.value && "is-on")}
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
          The paper, read instead of typed.

          Offered above the question it answers, because it answers it: a receipt with six
          things on it turns the form into the list version by itself. Purchases only —
          nothing else in this app comes with a receipt.

          What it fills is shown underneath rather than left to be noticed. Four fields
          move at once, and a form that rearranges itself in silence is one that has to be
          re-read from the top; a line saying which shop, which day and how much is the
          difference between checking a figure and auditing a screen.
        */}
        {kind === "expense" && (
          <div className="tx-scan">
            <ReceiptScan onRead={takeReceipt} />

            {scan && (
              <div className="tx-scan-read" role="status">
                <p className="tx-scan-line">
                  <span className="tx-scan-shop">{scan.receipt.store}</span>
                  <span className="tx-scan-dot">·</span>
                  {formatDate(scan.receipt.boughtOn)}
                  <span className="tx-scan-dot">·</span>
                  <span className="mono">{fmt(scan.receipt.total)}</span>
                </p>
                <p className="tx-scan-sub">
                  {scan.receipt.items.length > 0
                    ? `${scan.receipt.items.length} ${scan.receipt.items.length === 1 ? "stavka" : "stavki"} popunjeno — izmeni šta hoćeš pre nego što sačuvaš.`
                    : "Iznos i datum popunjeni — stavke nisu pročitane."}
                </p>
                {/*
                  A warning, never a refusal. One trip to the shop is often two entries
                  here — the week's food and the food that goes to work are different
                  categories out of the same bag — so the second one is something a
                  person does on purpose.
                */}
                {scan.seenOn && (
                  <p className="tx-scan-warn">
                    Ovaj račun je već unet {formatDate(scan.seenOn)}. Ako deliš račun na dva unosa, nastavi.
                  </p>
                )}
                {scan.receipt.notes.map((note) => (
                  <p key={note} className="tx-scan-warn">
                    {note}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

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
                setItemsSum(itemsTotal(scannedRows));
                setItemCount(scannedRows.length);
                setFromItems(itemsArePriced(scannedRows));
              }}
              aria-pressed={many}
              className={many ? "is-on" : undefined}
            >
              Several things
            </button>
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
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
        {shopping ? (
          /*
            On a purchase the name field is also the list of things already bought — see
            `ItemPicker`. Everywhere else it stays an ordinary field: a transfer has no
            product in it, and offering a shopping list on one would be the form answering
            a question nobody asked.
          */
          <>
          <ItemPicker
            name="title"
            label={TITLE_LABEL[kind] ?? "Name"}
            items={known}
            key={`title-${scan?.stamp ?? 0}`}
            defaultValue={scan?.receipt.store ?? tx?.title ?? ""}
            placeholder="Shop, bill, ticket…"
            onValueChange={setTitle}
            help={
              known.length > 0
                ? "Press the arrow for what you have bought before, with its last price."
                : undefined
            }
            onPick={(item) => apply(fillFromPick(item))}
            /*
              A name that has been filed before files itself.

              Say once that `Maxi` is Groceries and every later entry called `Maxi`
              opens with Groceries already chosen — which is half of what filling this
              form ever was. The pairing is not asked for anywhere: it is what the last
              entry with this name was filed as, kept by `rememberItem` on save.

              Only into fields still empty, and that limit is the whole of the trust
              here. Overwriting a category somebody just chose, because of a name typed
              after it, would be the form arguing — and a form that quietly changes an
              answer is one you have to re-read every time, which costs more than it
              ever saved. Empty stays fillable; answered stays answered.
            */
            onExact={(item) => apply(fillFromTyping(item, { categoryId, amount }))}
          />
          {/*
            Whether this name is worth keeping — asked, not assumed.

            The list used to answer this itself: a name earned a place the second time it
            was typed, and every line of a receipt earned one outright, so within a few
            shops it held twenty-three names nobody had chosen. A list you did not choose
            is one you stop opening, so the choice is here, spelled out, and off by default.

            Only once there is a name to keep. An empty box asking whether to remember
            nothing is furniture.
          */}
          {title.trim() !== "" && (
            <label className="tx-keep-title">
              <input
                type="checkbox"
                checked={keepingTitle}
                onChange={(e) => setKeepTitle(e.target.checked)}
                className="h-4 w-4 accent-gold"
              />
              <span>
                {titleOnList
                  ? `Keep “${title.trim()}” on your list, with this price`
                  : `Add “${title.trim()}” to the things you buy`}
              </span>
            </label>
          )}
          {/*
            One name, sent the same way a receipt sends its marked lines — so the server
            reads one field and does not have to know which shape of form it came from.
          */}
          <input
            type="hidden"
            name="keep_items"
            value={JSON.stringify(keepingTitle && title.trim() ? [title.trim()] : [])}
          />
          </>
        ) : (
          <Field
            label={many ? "Where from? (optional)" : (TITLE_LABEL[kind] ?? "Name")}
            name="title"
            /*
              Held as it is typed, the same as the purchase field and the amount hold it.

              It was the one field on this form left uncontrolled, and the only reason
              that never showed is that nothing read it: React empties a form once its
              action has run — refusals included — so a save the server turned back used
              to blank this box and leave every other field standing. Now the debt's name
              follows it, which is also the end of asking for the same name twice.
            */
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder={many ? "Maxi, pijaca, apoteka…" : (TITLE_HINT[kind] ?? "Shop, bill, ticket…")}
            required={!many}
          />
        )}

        {/*
          Purchases only, for now.

          A transfer between two accounts has no contents, and a deposit into a goal is
          one movement of money that is already yours. The receipt with several things
          on it is a thing you buy, so that is where the list is offered — anywhere else
          it would be an empty box asking a question with no answer.
        */}
        {kind === "expense" && many && (
          <TxItems
            key={`items-${scan?.stamp ?? 0}`}
            initial={scannedRows}
            currency={currency}
            known={known}
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
            /*
              Held rather than defaulted, because picking a thing off the list fills this
              too — it gets filed where it was filed last time. Still a plain select: the
              filling is a suggestion and changing it is one click.
            */
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
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
          Which goal this belongs to — offered, never required, and only once there is one
          to name.

          The same shape as the debt picker below it: an entry that also moves something
          has to be able to say what, and one that moves nothing must not be made to
          answer a question about it. So the field appears with the first goal and starts
          on nothing.

          On an expense that means the goals being paid off. On income it means all of
          them, because income is the one entry that can either fill a goal or reverse a
          payment against one — see the pool above.
        */}
        {isPayingKind(kind) && goalPool.length > 0 && (
          <Select
            label={kind === "income" ? "Goal" : "Towards"}
            name="goal_id"
            defaultValue={tx?.goal_id ?? ""}
            placeholder={kind === "income" ? "Not tied to a goal" : "Not towards a goal"}
            options={goalOptions}
            help={
              kind === "income"
                ? "A goal being saved up keeps this money — the balance rises and free to spend does not. A goal being paid off reads it as that payment coming back."
                : undefined
            }
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

          And on an income, which is the mirror and was missing. `saveTransaction` has
          always kept a `loan_id` on an income — the reader counts it as a repayment —
          and the Debts screen has always linked here to record one. The field it linked
          to was never drawn, so the debt arrived in the address, sat in state, and was
          not among the things the form posted: the money landed, the debt did not move,
          and nothing said so. The same silence swallowed an edit — reopening an income
          that already named a debt would save it having quietly forgotten which.

          Only when there is a debt, though. It used to sit on every purchase, so a
          coffee asked which loan it was paying off — a question with one possible
          answer, on the form people fill in most often. A field whose only honest reply
          is "nothing" is not a question, it is furniture.
        */}
        {(isLoanKind(kind) ||
          ((kind === "expense" || kind === "income") && loanOptions.length > 0)) && (
          <Select
            /*
              "Which debt" asked the wrong man a fair question.

              Lend somebody 2.000 and the entry is not one of *your* debts — it is money
              that comes back — so the honest reading of "Which debt" there is "none of
              them", which is the one answer the form will not take. The word is right on
              `loan_in`, where what lands on the account is borrowed, and on the
              instalment, which pays a debt down. It is the direction that has to be said
              out loud on `loan_out`, not the noun that has to go.

              And the placeholder now names the way out. The ＋ row was always in the
              list; nothing on the closed picker said so, which is how a required field
              that looks empty turns into a refusal nobody can act on.
            */
            label={
              kind === "expense"
                ? "Pays off"
                : kind === "income"
                  ? "Repays"
                  : kind === "loan_out"
                    ? "Who is it with"
                    : "Which debt"
            }
            name="loan_id"
            value={loanChoice}
            onChange={(e) => setLoanChoice(e.target.value)}
            placeholder={
              kind === "expense"
                ? "Nothing — an ordinary expense"
                : kind === "income"
                  ? "Nothing — ordinary income"
                  : kind === "loan_out"
                    ? "Pick who, or add somebody new"
                    : "Pick one, or add a new one"
            }
            options={loanOptions}
            help={
              kind === "expense"
                ? "Set this on an instalment and the debt falls by itself."
                : kind === "income"
                  ? "Somebody paying you back, or a payment of yours that came back."
                  : kind === "loan_out"
                    ? "The money leaves the account, but it is not spending — it comes back. Somebody new? Pick ＋ Somebody new and name them below."
                    : /*
                        Once the debt is named, the form can say which of the two things
                        this tab does. `Borrowed` is the honest name for opening one and
                        the wrong name for closing one, and the second is what somebody
                        handing your money back is — so the sentence says it out loud
                        rather than leaving the tab to be read as a claim about who owes
                        whom.
                      */
                      backToYou
                      ? `${backToYou.name} paying you back. It lands on the account and is not income — it was already yours.`
                      : "The money lands on the account, but it is not income. Nothing on the list yet? Pick ＋ A new debt and name it below."
            }
          />
        )}

        {isLoanKind(kind) && loanChoice === NEW_LOAN && (
          <>
            <Field
              /*
                Same word, same reason: on a loan out the row being made is somebody who
                owes you, and asking that person's name what the *debt* is called is the
                confusion above repeated one field lower.
              */
              label={kind === "loan_out" ? "Who is it?" : "What is the debt called?"}
              name="loan_name"
              maxLength={80}
              value={loanName ?? (kind === "loan_out" ? title : "")}
              onChange={(e) => setLoanName(e.target.value)}
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
        <div className="grid grid-cols-[minmax(0,1fr)_130px] gap-2">
          <Field
            key={`date-${scan?.stamp ?? 0}`}
            label="Date"
            name="occurred_on"
            type="date"
            defaultValue={scan?.receipt.boughtOn || tx?.occurred_on || todayISO()}
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


