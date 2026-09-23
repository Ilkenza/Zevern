"use server";

import {
getAccountBalances,
getMoney,getRates
} from "@/lib/data/money";
import { isLoanKind, isTxKind, NEW_LOAN, rateFor } from "@/lib/money";
import { GOAL_MOVE_KINDS, goalKinds, movesToward } from "@/lib/money/goal-progress";
import { loanClosure } from "@/lib/money/loan-progress";
import { itemsArePriced,itemsTotal,parseItems,parseKeep } from "@/lib/money/items";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
currencyOf,
goalBalance,
loanOwed,
MAX_AMOUNT,
MoneyState,
num,
ownsMoneyRow,
PENNY,
refresh,
rememberItem,
stockUp,
today
} from "./shared";
import { unreadable } from "@/lib/data/must";
import { syncTransferFee } from "./fee";

/* ------------------------------------------------------------ transactions */

/**
 * What each debt this write touches had on it beforehand.
 *
 * Read before the entry is written, because afterwards the question cannot be asked any
 * more: the whole point is to compare. An edit can move a movement from one debt to
 * another, so both are read — the one being left can be reopened by the leaving just as
 * the one being joined can be closed by the joining.
 */
async function owedBefore(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  uid: string,
  loanIds: Iterable<string>,
): Promise<Map<string, number>> {
  const before = new Map<string, number>();
  for (const loanId of new Set(loanIds)) {
    const now = await loanOwed(supabase, uid, loanId);
    // A debt that could not be read counts as one that had money on it, so a failed read
    // can close a debt that is genuinely clear but can never reopen one that is not.
    before.set(loanId, now ? now.outstanding : Number.POSITIVE_INFINITY);
  }
  return before;
}

/**
 * And what the write did to it: closed it, opened it again, or neither.
 *
 * Quiet on failure, deliberately, and the precedent is `postRecurring`: the entry is
 * already written and the debt already reads as nought owed, so the worst case is a row
 * that wants closing by hand — which is where this started. Turning a saved entry into an
 * error message over it would be the larger fault.
 */
async function syncLoanClosure(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  uid: string,
  loanId: string,
  before: number,
  on: string,
): Promise<void> {
  const now = await loanOwed(supabase, uid, loanId);
  if (!now) return;
  const move = loanClosure({ before, after: now.outstanding, settled: now.settled });
  if (!move) return;
  const { error } = await supabase
    .from("money_loans")
    .update({ settled_on: move === "close" ? on : null })
    .eq("id", loanId)
    .eq("user_id", uid);
  if (error) console.error("syncLoanClosure:", error.message);
}

/**
 * Every kind that is allowed to name a goal at all. Which of them a *particular* goal
 * accepts is `goalKinds`, and it is the same function the Goals screen reads its figures
 * with — one rule, checked here and applied there, so the two cannot drift.
 */
const GOAL_KINDS = new Set<string>(GOAL_MOVE_KINDS);

export async function saveTransaction(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense");
  /*
    An empty amount is a real answer, not a missing one.

    You come back from the shop knowing what you bought and not what it cost. `null`
    means exactly that — happened, price not known yet — and nothing in the app counts it
    until a figure arrives. A typed `0` is left as `0` and refused below: a zero-dinar
    shop is a slip of the finger, not an unknown, and the two must not collapse into
    each other.
  */
  /*
    A priced list decides the amount.

    Otherwise the entry carries two figures for one fact — the sum of what is in the
    bag, and whatever was typed in the box above it — and nothing on any screen would
    say which of the two is the money. The form makes the field read-only while a list
    is priced; this is the half of that rule that cannot be bypassed by posting the
    form yourself.

    A list where some line has no figure decides nothing: it sums to something that
    reads like a receipt total and is not one, so the typed amount is used and the list
    is kept as the record of what was bought.
  */
  const items = parseItems(formData.get("items"));
  /*
    Only names this entry actually holds. `keep_items` is a form field, and a form field
    is whatever the browser was told to send — without this, a crafted post could write
    any row it liked onto this account's list.
  */
  const keep = parseKeep(formData.get("keep_items"), [
    ...items.map((i) => i.name),
    String(formData.get("title") ?? ""),
  ]);
  /*
    The fiscal receipt this entry came off, when one was scanned.

    Only ever a receipt number — the format the tax service prints, which is letters,
    digits and two hyphens and nothing else. It is here so that scanning the same slip a
    second time can be recognised, and it is filtered rather than trusted for the usual
    reason: this is a form field, and a form field is whatever the browser was told to
    send. Anything that is not shaped like a receipt number is stored as nothing.
  */
  const receiptRaw = String(formData.get("receipt_no") ?? "").trim().slice(0, 64);
  const receiptNo = /^[A-Za-z0-9-]{4,64}$/.test(receiptRaw) ? receiptRaw : null;
  const rawAmount = String(formData.get("amount") ?? "").trim();
  /*
    A typed figure wins; an empty one is filled in by the list.

    The list used to win outright, which meant a priced breakdown quietly discarded
    whatever had been typed above it — and the form had to take the field over and hold
    it read-only to stop the two disagreeing on screen. Both halves of that were wrong:
    a number somebody typed should not vanish, and a field should not start writing
    itself while they work in the one below it. So the rule is the ordinary one —
    what you put in is what is kept, and leaving it empty is how you ask the lines to
    add themselves up.
  */
  const amount =
    rawAmount === ""
      ? itemsArePriced(items)
        ? itemsTotal(items)
        : null
      : num(formData.get("amount"));
  const currency = currencyOf(formData.get("currency"));
  const accountId = String(formData.get("account_id") ?? "").trim() || null;
  const toAccountId = String(formData.get("to_account_id") ?? "").trim() || null;
  /*
    What the move cost, on top of what moved.

    A cash machine that is not your bank's takes a charge: ask it for 5.000 and the bank
    is debited 5.250. Those are two different facts and the transfer can only hold one of
    them — whatever leaves `account_id` arrives at `to_account_id`, by construction — so
    without this the trip had to be entered as one number, and either the cash was 250
    too high or the bank was.

    Read for every kind and used by one. A figure left in the box while the kind is
    changed away from `transfer` is not a charge on anything, and the pair below is
    removed rather than kept.
  */
  const fee = num(formData.get("fee"), 0);
  const categoryId = String(formData.get("category_id") ?? "").trim() || null;
  const goalId = String(formData.get("goal_id") ?? "").trim() || null;
  /*
    `__new` is the picker saying "this debt does not exist yet", not an id.

    It arrives in the same field as a real one because it is the same select, so it has to
    be read out here — before the ownership check, which would otherwise look for a debt
    called `__new` on the profile, fail to find it, and refuse the entry that was creating
    it. The name typed underneath is what the debt is made from, further down.
  */
  const loanChoice = String(formData.get("loan_id") ?? "").trim();
  const loanId = loanChoice === NEW_LOAN ? null : loanChoice || null;
  const loanName = String(formData.get("loan_name") ?? "").trim().slice(0, 80);
  const loanTotal = num(formData.get("loan_total"), 0);
  const note = String(formData.get("note") ?? "").trim() || null;
  // What the entry actually was — "Maxi, weekly shop", not just "Groceries". The full
  // form asks for it and will not submit without one; quick add offers it and lets you
  // skip, so null is a real answer here and the list falls back to the category name.
  const title = String(formData.get("title") ?? "").trim().slice(0, 80) || null;
  const occurredOn = String(formData.get("occurred_on") ?? "").trim() || today();
  /*
    The time of day, when there is one.

    Optional on purpose — quick add is two taps, and an entry typed from memory on Friday
    honestly has no time — so an empty box is a real answer and stores null rather than
    midnight. Midnight would be a lie that sorts first and reads as a fact.
  */
  const timeRaw = String(formData.get("occurred_at") ?? "").trim();
  const occurredAt = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(timeRaw) ? timeRaw : null;
  // Only an 'added only' budget can be chosen; checked below rather than trusted, since
  // this id arrives from a browser like every other.
  const budgetId = String(formData.get("budget_id") ?? "").trim() || null;
  const returnTo = String(formData.get("return_to") ?? "").trim();

  if (!isTxKind(kind)) return { error: "Unknown kind." };
  /*
    Only a purchase may arrive without a figure.

    Money coming in, money moving between accounts and money going to or from a goal all
    have a figure by the time you know they happened — the bank, the ATM and the goal
    arithmetic each supply one. `reserved` and `free` have no way to hold an unknown
    claim, so an unpriced saving would make every "free to spend" figure in the app a
    guess. And an entry with neither a price nor a name records nothing at all.
  */
  if (amount === null) {
    if (kind !== "expense")
      return { error: "Only a purchase can go in without a price — this one needs a figure." };
    // A list of what was bought is the name, and a better one than a single line.
    if (!title && items.length === 0)
      return { error: "Say what you bought. Without a price, the name is the entry." };
  } else if (!(amount > 0)) {
    return {
      error: "Amount has to be greater than zero — or leave it empty if you do not know it yet.",
    };
  }
  if (kind === "transfer" && (!accountId || !toAccountId || accountId === toAccountId))
    return { error: "A transfer needs two different accounts." };
  /*
    Refused rather than rounded away, because a charge is a figure somebody read off a
    screen and a figure that is quietly ignored is worse than one that is refused: the
    entry saves, looks right, and is wrong by exactly the amount they typed.
  */
  if (fee < 0 || !(fee < MAX_AMOUNT)) return { error: "That is not a fee." };
  if (kind === "saving" && !goalId) return { error: "Pick the goal this saving belongs to." };
  if (kind === "withdraw" && !goalId) return { error: "Pick the goal this money comes out of." };
  // Both directions name an account, because that is the account the money is being
  // held back from or handed back to. Without one, a goal would claim dinars that no
  // account has set aside, and the two screens would stop adding up.
  if (kind === "saving" && !accountId)
    return { error: "Pick the account this money is being set aside on." };
  if (kind === "withdraw" && !accountId)
    return { error: "Pick the account this money goes back to." };

  /*
    A loan movement always names both an account and a debt.

    Without the account the cash has nowhere to come from or land. Without the debt the
    entry is money leaving or arriving that counts as nothing anywhere, which on the
    screen is indistinguishable from an entry someone forgot to finish. The debt is
    what makes it temporary rather than missing.
  */
  if (isLoanKind(kind) && !accountId)
    return {
      error:
        kind === "loan_out"
          ? "Pick the account this money leaves."
          : "Pick the account this money lands on.",
    };
  /*
    Naming the control, because the way out of this refusal sits inside a shut dropdown.

    "…or name a new one" was true and unreachable: the new-debt field only exists once
    the picker has been opened and its ＋ row chosen, so somebody writing down money they
    lent a friend read an instruction pointing at a field that was not on the screen —
    and the field it *was* pointing at asked which of their debts this was, when the
    answer was none of them. An error nobody can act on is worse than no error.
  */
  if (isLoanKind(kind) && !loanId && !loanName)
    return {
      error:
        kind === "loan_out"
          ? "Open “Who is it with” and pick the person, or choose ＋ Somebody new to add them."
          : "Open “Which debt” and pick one, or choose ＋ A new debt to name it.",
    };

  // Errors quote figures, and a figure quoted in a currency the person does not read
  // in is a figure they have to convert before they can act on it.
  const { fmt } = await getMoney();
  const rates = await getRates();
  const manualRate = num(formData.get("rate"), 0);
  const rate = currency === "RSD" ? 1 : manualRate > 0 ? manualRate : rateFor(currency, rates);

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  // Only the links the kind actually keeps are worth checking — the rest are dropped.
  const toAccount = kind === "transfer" ? toAccountId : null;
  const category =
    kind === "expense" || kind === "income" || kind === "refund" ? categoryId : null;
  /*
    Four kinds may name a goal, and which four depends on the goal.

    A goal that collects is fed by `saving` and emptied by `withdraw`; a goal that
    clears is fed by `expense` and reversed by `income`. The pairing is checked below
    rather than trusted, because crossing it puts an entry into a total that is not
    measuring it — held money counted as paid off, or spent money still reserved.
  */
  const goal = GOAL_KINDS.has(kind) ? goalId : null;
  /*
    An expense keeps its loan link too, and that link is what an instalment is.

    A rate is an ordinary expense — it costs the month like any other — but it also has
    to pay the debt down, and the only way it can is by saying which debt it belongs
    to. So `loan_id` survives on the two loan kinds and on `expense`.

    And on `income`, which is the same argument pointing the other way: money the bank
    hands back off an instalment is income like any other, and it has to take the debt
    back up by the same amount. Without it the refund landed on the account and the debt
    went on saying it had been paid — see `weighLoanMove`, which is what decides that a
    given kind pays a debt down, takes a payment back, or is the entry that opened it.
  */
  const loan =
    isLoanKind(kind) || kind === "expense" || kind === "income" || kind === "refund"
      ? loanId
      : null;

  const [ownsAccount, ownsToAccount, ownsCategory, ownsGoal, ownsLoan] = await Promise.all([
    ownsMoneyRow(supabase, "money_accounts", accountId, uid),
    ownsMoneyRow(supabase, "money_accounts", toAccount, uid),
    ownsMoneyRow(supabase, "money_categories", category, uid),
    ownsMoneyRow(supabase, "money_goals", goal, uid),
    ownsMoneyRow(supabase, "money_loans", loan, uid),
  ]);
  if (!ownsAccount || !ownsToAccount) return { error: "That account is not on your profile." };
  if (!ownsCategory) return { error: "That category is not on your profile." };
  if (!ownsGoal) return { error: "That goal is not on your profile." };
  if (!ownsLoan) return { error: "That debt is not on your profile." };

  /*
    Which way the named goal runs, needed twice below — for the pairing check here and
    for the floor check further down, which only means anything on a goal that holds.
  */
  let goalPaying = false;
  if (goal) {
    // A closed goal has already handed its money back. Letting an entry land on one
    // would put dinars somewhere no account is reserving them.
    const { data: goalRow, error: goalRowError } = await supabase
      .from("money_goals")
      .select("completed_at, direction")
      .eq("id", goal)
      .eq("user_id", uid)
      .maybeSingle();
    if (goalRowError) return { error: unreadable("that goal") };
    if (goalRow?.completed_at)
      return { error: "That goal is closed. Reopen it before moving money in or out." };
    goalPaying = goalRow?.direction === "expense";
    if (!goalKinds(goalPaying).includes(kind))
      return {
        error: goalPaying
          ? "That goal is being paid off — put an expense towards it, or a refund to reverse one."
          : "That goal is being saved up — set money aside against it, or file income straight into it.",
      };
  }

  // amount_rsd is generated in the database as round(amount * rate, 2); worked out the
  // same way here so the check and the stored figure cannot disagree.
  const amountRsd = amount === null ? 0 : Math.round(amount * rate * 100) / 100;

  /*
    The purchase this refund undoes, when it names one.

    Optional — a bank reversing a charge refunds nothing anybody wrote down — and checked
    rather than trusted, like every other id that arrives from a browser. It has to be
    this profile's, and it has to be a purchase: a refund pointing at another refund
    would be money going round in a circle, and one pointing at a transfer would take
    spending off a category the transfer never touched.

    The ceiling is the second half. Nothing in the database stops ten refunds of 10.993
    against an order that cost 10.993, and the arithmetic would obey them — a category
    would go 100.000 into the negative and read as money earned by shopping. What has
    already come back is summed here and the entry being edited is left out of that sum,
    so raising a refund from 5.000 to 6.000 answers for the 6.000 and not for both.

    A purchase logged without a price has no ceiling to hold, and that is left alone: the
    figure that would be judged does not exist yet.
  */
  let refundOf: string | null = null;
  if (kind === "refund") {
    const wanted = String(formData.get("refund_of_id") ?? "").trim() || null;
    if (wanted) {
      const { data: bought, error: boughtError } = await supabase
        .from("money_transactions")
        .select("id, kind, amount_rsd")
        .eq("id", wanted)
        .eq("user_id", uid)
        .maybeSingle();
      if (boughtError) return { error: unreadable("the purchase this refunds") };
      if (!bought) return { error: "That purchase is not on your profile." };
      if (bought.kind !== "expense")
        return { error: "A refund can only be against a purchase." };
      refundOf = bought.id;

      const paid = Number(bought.amount_rsd) || 0;
      if (paid > 0) {
        const { data: already, error: alreadyError } = await supabase
          .from("money_transactions")
          .select("id, amount_rsd")
          .eq("user_id", uid)
          .eq("kind", "refund")
          .eq("refund_of_id", refundOf);
        if (alreadyError)
          return { error: unreadable("what has already come back off that purchase") };
        const back = (already ?? [])
          .filter((r) => r.id !== id)
          .reduce((sum, r) => sum + (Number(r.amount_rsd) || 0), 0);
        if (back + amountRsd > paid + PENNY) {
          const room = Math.max(0, Math.round((paid - back) * 100) / 100);
          return {
            error:
              room > 0
                ? `That purchase cost ${fmt(paid)} and ${fmt(back)} has already come back, so ${fmt(room)} is left to refund.`
                : `All ${fmt(paid)} of that purchase has already come back.`,
          };
        }
      }
    }
  }

  /*
    A deposit cannot reserve money the account does not have free.

    Setting aside does not move a dinar anywhere — it marks part of an account as
    spoken for. Nothing stopped that mark from covering more than the account held, and
    the moment it did every "free to spend" figure in the app was wrong by the
    difference, quietly, with no entry looking wrong on its own.

    `free` already nets off what other open goals claim. On an edit the entry's own old
    amount is part of that claim, so it is handed back before the comparison — raising
    a deposit from 5.000 to 6.000 has to answer for 1.000, not for 6.000.
  */
  if (kind === "saving" && accountId) {
    const balances = await getAccountBalances();
    const account = balances.find((a) => a.id === accountId);
    if (account) {
      let free = account.free;
      if (id) {
        const { data: previous, error: previousError } = await supabase
          .from("money_transactions")
          .select("kind, amount_rsd, account_id")
          .eq("id", id)
          .eq("user_id", uid)
          .maybeSingle();
        if (previousError) return { error: unreadable("what this entry was already setting aside") };
        if (previous?.kind === "saving" && previous.account_id === accountId) {
          free += Number(previous.amount_rsd) || 0;
        }
      }

      if (amountRsd > free + PENNY)
        return {
          error:
            free > 0
              ? `${account.name} only has ${fmt(free)} free — the rest is already set aside for another goal.`
              : `${account.name} has nothing free to set aside. Every dinar on it is already claimed by a goal.`,
        };
    }
  }

  /*
    A goal that holds money can never hold less than nothing: you cannot take out more
    than is there, and editing an old deposit downwards must not leave the withdrawals
    against it dangling. Either would turn `reserved` negative and hand the accounts free
    money that does not exist.

    Only for a goal being saved up. A goal being paid off reserves nothing — its money
    left the account when it was spent — so there is no floor to hold.
  */
  if (goal && !goalPaying) {
    const others = await goalBalance(supabase, uid, goal, id || null);
    if (others === null) return { error: "Could not read what that goal holds. Try again." };

    if (kind === "withdraw" && amountRsd > others + PENNY)
      return {
        error:
          others > 0
            ? `That goal only holds ${fmt(others)}.`
            : "That goal is empty — there is nothing to take out.",
      };

    // Income filed straight into a goal is a deposit like any other, and shrinking one
    // below what has since been taken out is the same hole either way.
    if (movesToward(kind, false) && others + amountRsd < -PENNY)
      return {
        error: `${fmt(-others)} has already been taken out of that goal, so this ${
          kind === "income" ? "income" : "deposit"
        } cannot be smaller than that.`,
      };
  }

  /*
    The debt a movement is starting, made here rather than on a screen of its own.

    Being sent somewhere else to declare a debt before you are allowed to record lending
    someone money is being asked to model your finances before describing them. The
    first movement already carries everything the debt needs: a name, a date, and an
    amount.

    The total falls back to the amount, which is right for every case but one. A credit
    is the exception — 550.000 arrives and 600.000 is repaid — so the field is offered
    and ignored when left empty. That keeps a tenner lent to a friend a one-field
    answer while still letting a credit be described properly.

    It is typed in the entry's currency, and that used to be lost: the figure went
    straight into `total_rsd`, so €5.000 lent to somebody became a debt of five thousand
    dinars while the entry took 586.000 off the account. The debt now carries the same
    three columns an entry does — what was said, in what, at what rate — and the dinar
    total is worked out from them, at the rate this very entry is being booked at.
  */
  let loanRef = loan;
  if (isLoanKind(kind) && !loanRef && loanName) {
    const agreed = loanTotal > 0 ? loanTotal : (amount ?? 0);
    const { data: created, error } = await supabase
      .from("money_loans")
      .insert({
        name: loanName,
        direction: kind === "loan_out" ? "lent" : "borrowed",
        total_amount: agreed,
        currency,
        rate,
        total_rsd: loanTotal > 0 ? Math.round(loanTotal * rate * 100) / 100 : amountRsd,
        opened_on: occurredOn,
      })
      .select("id")
      .maybeSingle();
    if (error) return { error: saveErrorMessage(error) };
    if (!created) return { error: "Could not create that debt. Try again." };
    loanRef = created.id;
  }

  if (budgetId) {
    const { data: budget, error: budgetError } = await supabase
      .from("money_budget_plans")
      .select("membership")
      .eq("id", budgetId)
      .eq("user_id", uid)
      .maybeSingle();
    if (budgetError) return { error: unreadable("that budget") };
    if (!budget) return { error: "That budget is not on your profile." };
    // An 'all transactions' budget decides for itself what belongs to it. Filing an
    // entry into one by hand would store a link nothing reads, and would quietly start
    // meaning something the day its type was changed.
    if (budget.membership !== "added")
      return { error: "That budget counts matching entries on its own — nothing is added to it." };
  }

  const payload = {
    kind,
    title,
    amount,
    budget_id: budgetId,
    currency,
    rate,
    account_id: accountId,
    to_account_id: toAccount,
    category_id: category,
    goal_id: goal,
    loan_id: loanRef,
    note,
    occurred_on: occurredOn,
    occurred_at: occurredAt,
    // `null` rather than `[]`, so "this entry has no list" is one value everywhere
    // instead of two that every read would have to treat the same.
    items: items.length > 0 ? items : null,
    receipt_no: receiptNo,
    /*
      Always written, including as `null`.

      Left out of the payload, an edit that turned a refund into an expense would keep
      the link — and the database refuses that outright, so the save would fail with a
      constraint name where an explanation belongs. Cleared here, the entry simply stops
      being a refund of anything.
    */
    refund_of_id: refundOf,
  };

  /*
    The debts this save is about to move, and what they owed a moment ago.

    The one it names now, and — on an edit — the one it may be walking away from, which
    is read off the stored row rather than trusted to the form: the form only knows where
    the entry is going.
  */
  const touched = new Set<string>();
  if (loanRef) touched.add(loanRef);
  /*
    Set when the entry being edited is a transfer's fee and is being turned into
    something that is not an expense. See where it is used, below.
  */
  let unhookFee = false;
  if (id) {
    const { data: was, error: wasError } = await supabase
      .from("money_transactions")
      .select("loan_id, fee_for_id")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    /*
      Not worth turning a good save into an error message. What it costs is one case: a
      debt this entry is walking away from keeps its closed date until the next thing
      touches it — and the entry itself, which is what was asked for, is written either
      way.
    */
    if (wasError) console.error("saveTransaction previous debt:", wasError.message);
    else {
      if (was?.loan_id) touched.add(was.loan_id);
      unhookFee = Boolean(was?.fee_for_id) && kind !== "expense";
    }
  }
  const owed = await owedBefore(supabase, uid, touched);

  let written: string | null = id || null;
  if (id) {
    /*
      The row comes back so the save can prove it touched one.

      Scoped by owner, an update of somebody else's id matches nothing and returns no
      error — which used to report success for a save that saved nothing. It matters
      more now: the id is what a transfer's fee is hung on, and an unproven one would let
      a forged form pin a charge to an entry on another profile.
    */
    /*
      A fee turned into anything but an expense stops being that transfer's fee. Left
      linked, the transfer would go on reading it as its charge — and the next save of
      the transfer would quietly turn it back into an expense, rewriting an entry the
      person had deliberately changed.
    */
    const { data: updated, error } = await supabase
      .from("money_transactions")
      .update(unhookFee ? { ...payload, fee_for_id: null } : payload)
      .eq("id", id)
      .eq("user_id", uid)
      .select("id")
      .maybeSingle();
    if (error) return { error: saveErrorMessage(error) };
    if (!updated) return { error: "That entry is not on your profile." };
  } else {
    // The id comes back so the food this entry bought can point at the shop trip it came
    // from — see `stockUp` below.
    const { data: made, error } = await supabase
      .from("money_transactions")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error) return { error: saveErrorMessage(error) };
    written = made?.id ?? null;
  }

  /*
    The charge the move cost, as an entry of its own.

    After the transfer rather than before it, because the fee points at the transfer and
    a new one has no id until it is written. An edit takes the same path: the pair is
    brought into line with whatever the form now says, including "no fee at all", which
    is how a charge typed by mistake goes away again.

    A failure here is reported rather than swallowed. Everywhere else in this function a
    convenience that fails is logged and the entry still saves, and that is right for a
    shopping list — but this one is money. Silently dropping it leaves the bank short by
    the fee with nothing on the screen to say why, which is the exact fault this whole
    column exists to fix.
  */
  if (written) {
    const feeError = await syncTransferFee(supabase, uid, {
      transferId: written,
      wanted: kind === "transfer" ? fee : 0,
      accountId,
      currency,
      rate,
      occurredOn,
      occurredAt,
      title,
    });
    if (feeError) {
      /*
        A brand-new transfer whose fee could not be written is removed again, so the
        error means what it says: nothing was saved. Left in place, the form would still
        be open with the same figures on it — and pressing Save again would add the move
        a second time, because a new entry has no id for the retry to find.

        An edit keeps its update. Its id is known, so the retry lands on the same row and
        brings the fee into line; there is nothing to duplicate.
      */
      if (!id) {
        const { error: undoError } = await supabase
          .from("money_transactions")
          .delete()
          .eq("id", written)
          .eq("user_id", uid);
        if (undoError) console.error("saveTransaction undo after fee:", undoError.message);
      }
      return { error: feeError };
    }
  }

  /*
    A debt paid down to nothing closes itself, and one that stops being paid opens again.

    `postRecurring` has done the first half for the instalment since it was written, with
    the reason spelled out beside it: a list that asks to be told what it can see is a
    list that stops being read. The same money entered by hand did nothing, so a debt
    collected in full sat in the open list at nought beside a `Collected' button — the
    identical fact recorded two ways giving two answers.

    Dated by the entry rather than by the clock, because a repayment written down on
    Thursday for money that came back on Monday closed the debt on Monday.
  */
  for (const loanId of touched) {
    await syncLoanClosure(supabase, uid, loanId, owed.get(loanId) ?? Number.POSITIVE_INFINITY, occurredOn);
  }

  /*
    The shopping list takes only what was marked for it.

    Two earlier rules both filed things nobody asked for. The first learned the entry's
    title and the entry's amount whatever the entry was — so on a receipt it saved the
    shop (`Maxi`) at the price of a weekly shop, and picking that later put a basket total
    into a box meant for the price of one thing. The second learned every line of every
    receipt instead, which fixed the arithmetic and made a new mess: twenty-three names on
    the list inside a few shops, not one of them chosen.

    A list is only worth opening if the person owns what is in it, so the entry now carries
    the names that were marked and nothing else. Awaited rather than fired and forgotten,
    so the picker is up to date on the very next screen; it fails silently on purpose,
    because the entry is written and a convenience behind it must never turn a saved entry
    into an error message.
  */
  if (kind === "expense" && keep.length > 0) {
    for (const name of keep) {
      /*
        A marked line brings the price of ONE of it, which is what the box holds and what
        the picker will fill in next time. A marked title has no line, so the entry's own
        amount is the price — which is right for the entry the title case describes: one
        thing bought once.
      */
      const line = items.find((i) => i.name.trim().toLowerCase() === name.toLowerCase());
      const price = line ? line.amount : (amount ?? 0);
      await rememberItem({
        supabase,
        uid,
        name,
        price: price > 0 ? price : null,
        currency,
        categoryId: category,
        on: occurredOn,
      });
    }
  }

  /*
    And the food goes in the house.

    After the shopping list rather than before it, so a thing being learned for the first
    time is on the list by the time this looks — though a brand new name is `other` until
    somebody says otherwise in Setup, so nothing is followed on the day it is first typed.
    Only on a new entry: see `stockUp`.
  */
  if (kind === "expense" && !id && items.length > 0) {
    await stockUp({ supabase, uid, items, transactionId: written, on: occurredOn });
  }

  refresh();
  if (returnTo) return { ok: true }; // stay on the page that asked (quick add, goals)
  redirect("/private/money");
}

/**
 * The other half of an unpriced entry: the receipt turns up.
 *
 * Deliberately not the edit form. Filling in a price is the one thing you will do to
 * these entries and you will do it to several at once, off a card statement or a
 * pocketful of receipts — a panel that opens, saves and closes per entry turns five
 * seconds of work into a minute of it. So this takes one figure and nothing else: the
 * currency and the rate the entry was logged under are the ones it keeps, because they
 * are the currency and rate of the day it happened, not of today.
 *
 * It refuses an entry that already has a price. Changing a figure that exists is an
 * edit, it belongs in the form where the rest of the entry can be seen, and letting it
 * happen here would mean a stray tap could silently rewrite a settled month.
 */
export async function priceTransaction(id: string, amount: number): Promise<MoneyState> {
  if (!(amount > 0)) return { error: "The price has to be greater than zero." };
  if (!(amount < MAX_AMOUNT)) return { error: "That is not a price." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { data: row, error: rowError } = await supabase
    .from("money_transactions")
    .select("id, amount")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (rowError) return { error: unreadable("that entry") };
  if (!row) return { error: "That entry is not on your profile." };
  if (row.amount !== null) return { error: "That entry already has a price. Edit it instead." };

  const { error } = await supabase
    .from("money_transactions")
    .update({ amount })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}


/**
 * The entry form's delete. Same removal as the row's, plus the trip back to the ledger.
 *
 * The refusal used to be logged and the redirect taken anyway, so a delete the database
 * turned down looked exactly like one it accepted — you landed on the ledger with the
 * entry still in it. `removeTransaction` already says what went wrong; this now passes
 * that on and stays where it is.
 */
export async function deleteTransaction(id: string): Promise<MoneyState> {
  const result = await removeTransaction(id);
  if (result?.error) return result;
  redirect("/private/money");
}

/** Same delete, but called from a row — no redirect, the caller refreshes in place. */
export async function removeTransaction(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { data: row, error: rowError } = await supabase
    .from("money_transactions")
    .select("kind, goal_id, amount_rsd, loan_id")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (rowError) return { error: unreadable("that entry") };

  /*
    Removing something that put money into a goal, when part of it has since been taken
    back out, would leave the goal holding less than nothing — and the accounts would
    count the difference as free.

    Two kinds put money in: `saving`, and income filed straight into the goal. Only on a
    goal that is being saved up; one being paid off holds nothing to go short of.
  */
  if (row?.goal_id && movesToward(row.kind, false)) {
    const { data: goalRow, error: goalRowError } = await supabase
      .from("money_goals")
      .select("direction")
      .eq("id", row.goal_id)
      .eq("user_id", uid)
      .maybeSingle();
    if (goalRowError) return { error: unreadable("that goal") };

    if (goalRow && goalRow.direction !== "expense") {
      const others = await goalBalance(supabase, uid, row.goal_id, id);
      if (others === null) return { error: "Could not read what that goal holds. Try again." };
      const { fmt } = await getMoney();
      if (others < -PENNY)
        return {
          error: `Take the ${fmt(-others)} out of that goal back first — without this there is nothing for it to have come out of.`,
        };
    }
  }

  /*
    What the debt behind it owed while the entry was still there — the same comparison the
    save makes, from the other side. Taking away the payment that cleared a debt has to
    take the closing with it, or the row goes on claiming to be collected while the ledger
    says the money never came.
  */
  const owed = row?.loan_id
    ? await owedBefore(supabase, uid, [row.loan_id])
    : new Map<string, number>();

  const { error } = await supabase
    .from("money_transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  if (row?.loan_id) {
    await syncLoanClosure(
      supabase,
      uid,
      row.loan_id,
      owed.get(row.loan_id) ?? Number.POSITIVE_INFINITY,
      today(),
    );
  }

  refresh();
  return { ok: true };
}
