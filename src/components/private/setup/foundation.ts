/**
 * What Setup is actually asking you to do, and how far through it you are.
 *
 * The page used to be five identical panels in a column: everything looked equally
 * important, nothing said what was missing, and a half-built model looked exactly like
 * a finished one. These are the same five things, ranked — and the three that the rest
 * of the app cannot work without are marked as such.
 *
 * Income categories are in the required set on purpose. Without one there is no way to
 * record money coming in, so every month reads as pure loss and the net figure on Money
 * is negative forever. That is not a limit anyone chooses; it is one they fall into.
 */

export type StepKey = "accounts" | "expense" | "income" | "rates" | "calendar";

export type Step = {
  key: StepKey;
  /** The anchor on the page, so the sidebar can jump to it. */
  id: string;
  label: string;
  done: boolean;
  /** The figure beside the label — how many of the thing there are. */
  count: number | null;
  /** False for the two that are a matter of taste rather than a prerequisite. */
  required: boolean;
  /** What is missing, said in one line. Only shown while it is undone. */
  todo: string;
};

export type Foundation = {
  steps: Step[];
  /** Required steps completed, and how many there are. */
  done: number;
  total: number;
  ready: boolean;
};

export function foundationOf({
  accounts,
  expense,
  income,
  ratesUpdatedOn,
  calendarToken,
}: {
  accounts: number;
  expense: number;
  income: number;
  ratesUpdatedOn: string | null;
  calendarToken: string | null;
}): Foundation {
  const steps: Step[] = [
    {
      key: "accounts",
      id: "setup-accounts",
      label: "Accounts",
      done: accounts > 0,
      count: accounts,
      required: true,
      todo: "Every entry has to land somewhere — add the account your money sits in.",
    },
    {
      key: "expense",
      id: "setup-expense",
      label: "Expense categories",
      done: expense > 0,
      count: expense,
      required: true,
      todo: "Without these, spending cannot be grouped anywhere in the app.",
    },
    {
      key: "income",
      id: "setup-income",
      label: "Income categories",
      done: income > 0,
      count: income,
      required: true,
      todo: "Without one there is no way to log money coming in, and every month reads as a loss.",
    },
    {
      key: "rates",
      id: "setup-rates",
      label: "Exchange rates",
      done: ratesUpdatedOn != null,
      count: null,
      required: false,
      todo: "Only matters once something is held in euros or dollars.",
    },
    {
      key: "calendar",
      id: "setup-calendar",
      label: "Calendar feed",
      done: calendarToken != null,
      count: null,
      required: false,
      todo: "Optional — puts what falls due into the calendar on your phone.",
    },
  ];

  const required = steps.filter((s) => s.required);

  return {
    steps,
    done: required.filter((s) => s.done).length,
    total: required.length,
    ready: required.every((s) => s.done),
  };
}
