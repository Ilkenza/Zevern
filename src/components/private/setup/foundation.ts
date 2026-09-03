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
 *
 * And that fix stopped one step short, which is why `earning` exists. A category only
 * guarantees you *can* record income; it does not mean any has been recorded. The page
 * would say three of three done, every screen would still read as pure loss, and the
 * thing standing between the two was a step nobody had been asked to take.
 */

export type StepKey =
  | "accounts"
  | "expense"
  | "income"
  | "earning"
  | "things"
  | "rates"
  | "calendar";

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
  earning,
  ratesUpdatedOn,
  calendarToken,
  things = 0,
}: {
  accounts: number;
  expense: number;
  income: number;
  /** True once anything is on file as income — a booking or a standing rule. */
  earning: boolean;
  ratesUpdatedOn: string | null;
  calendarToken: string | null;
  /** How many things are on the shopping list. */
  things?: number;
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
      key: "earning",
      id: "setup-earning",
      label: "What comes in",
      done: earning,
      count: null,
      required: true,
      todo: "A category says income can be recorded. This is recording it — the pay, and the day it lands.",
    },
    /*
      The shopping list. Optional, and built by hand — a name goes on it when it is marked
      on an entry, never on its own. It filled itself once and the result was twenty-three
      names nobody had chosen, which is why the mark exists.
    */
    {
      key: "things",
      id: "setup-things",
      label: "Things you buy",
      done: things > 0,
      count: things,
      required: false,
      todo: "Nothing on the list yet — mark a name on an entry to keep it, or add one here.",
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
