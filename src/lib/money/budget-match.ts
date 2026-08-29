/**
 * Whether one entry counts toward one budget, and for how much.
 *
 * Three rules that have to agree, pulled out of the query so they can be read in one
 * place and tested without a database. Getting any of them wrong is not a visible
 * failure — it is a figure that is quietly too big on a screen whose entire job is to be
 * believed.
 */

export type BudgetMatchPlan = {
  id: string;
  /** "all" sweeps up matching entries; "added" counts only what carries its id. */
  membership: string;
  /** "expense" is a ceiling on what goes out; "savings" measures what is left over. */
  kind: string;
};

export type BudgetMatchRow = {
  kind: string;
  amount_rsd: number | string | null;
  category_id: string | null;
  account_id: string | null;
  budget_id: string | null;
};

/**
 * What `row` adds to `plan`, or `null` when it does not belong to it at all.
 *
 * The sign is the interesting part. An expense budget only ever counts money going out,
 * so everything it takes is positive and the target is a ceiling. A savings budget
 * counts what is left over — income less spending — so the same row arrives negative
 * there, and a month where more went out than came in honestly reports a negative.
 */
export function contributionOf(
  plan: BudgetMatchPlan,
  row: BudgetMatchRow,
  categories?: Set<string>,
  accounts?: Set<string>,
): number | null {
  if (plan.membership === "added") {
    /*
      You chose these by hand, so no filter gets a say — that is the entire point of a
      budget you add to. A holiday's flights, hotel and dinners live in three different
      categories, and no filter would ever gather exactly those and nothing else.
    */
    if (row.budget_id !== plan.id) return null;
  } else {
    /*
      An entry counts everywhere it belongs, and being filed by hand takes it out of
      nothing.

      This used to work the other way: an entry carrying a budget id was excluded from
      every sweeping budget, on the reasoning that two ceilings over one dinar are the
      same question asked twice. It is a coherent rule and it is not the one the person
      typing means. "I made it an expense, I put Eating out, and I put the budget to na
      moru — so it should count for Eating out and for na moru" is the whole of it: the
      category says what the money was, the budget says which plan it came out of, and
      those are two facts about one entry rather than a choice between them.

      What the old rule actually produced was a screen saying he had spent nothing on
      eating out in a month he spent 54.895 on it — every dinar of the category filed
      into a trip and therefore invisible to the category. An absence that large is not a
      clean abstraction, it is a lie with a rationale.

      The double count is real and is handled where it can be seen instead of by hiding
      half of it: `filed` on each line carries how much of the figure is already inside a
      hand-kept budget, and the card says so under the bar. Two numbers that add up, with
      the overlap named, beat one number that quietly does not.
    */

    // Empty means "everything on this axis". A budget with no categories named watches
    // them all, which is what somebody typing "Monthly spending" means.
    if (categories && categories.size > 0 && (!row.category_id || !categories.has(row.category_id)))
      return null;
    if (accounts && accounts.size > 0 && (!row.account_id || !accounts.has(row.account_id)))
      return null;
  }

  /*
    Only money going out or coming in. A transfer between your own accounts, a deposit
    into a goal, a loan repaid — none of those are spending or earning, and a savings
    budget used to take them as spending because the branch below asks only "is this
    income?". The query above this function happens to fetch nothing else, so it never
    showed on a screen; it would have the first time anyone passed it a wider set.
  */
  if (row.kind !== "expense" && row.kind !== "income") return null;

  const value = Number(row.amount_rsd) || 0;

  if (plan.kind === "savings") return row.kind === "income" ? value : -value;
  return row.kind === "expense" ? value : null;
}

/**
 * Whether an entry of this kind could ever count toward a budget of this kind.
 *
 * The picker on the entry form and `contributionOf` above have to agree, and until now
 * only one of them knew the rule. The form filtered the budgets it offered by their
 * dates — on the stated principle that "offering a budget whose window the entry falls
 * outside would be offering to file something where it will never be counted" — and then
 * offered every kind of budget to every kind of entry.
 *
 * Which is the same fault with a different filter. File a salary into a holiday and
 * `contributionOf` returns null for it, so the holiday never sees it; and because an
 * entry carrying a budget id is deliberately excluded from every 'all transactions'
 * budget, the salary is then counted by nothing at all. Two taps, no error, no trace —
 * a figure quietly too small on a screen whose whole job is to be believed.
 *
 * So the rule lives beside the one it has to agree with. A savings budget measures income
 * less spending, so both kinds of entry move it. An expense budget is a ceiling on money
 * going out, so income has nothing to say to it. Everything else — transfers, deposits
 * into a goal, lending — is not spending or earning at all, and no budget reads it.
 */
export function canFileInto(rowKind: string, planKind: string): boolean {
  if (rowKind !== "expense" && rowKind !== "income") return false;
  if (planKind === "savings") return true;
  return rowKind === "expense";
}




