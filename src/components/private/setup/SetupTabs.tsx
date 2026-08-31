"use client";

import {
  CalendarClock,
  Coins,
  HardDriveDownload,
  Landmark,
  ShoppingBasket,
  Tag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Foundation, StepKey } from "./foundation";

/** The one pane that is not a setup step — see the note beside the tab below. */
export const DATA_PANE = "setup-data";

const ICON: Record<StepKey, LucideIcon> = {
  accounts: Wallet,
  expense: Tag,
  income: Coins,
  earning: TrendingUp,
  things: ShoppingBasket,
  rates: Landmark,
  calendar: CalendarClock,
};

/*
  Shorter names, for a strip rather than a list.

  In a column `Expense categories` is a heading and reads as one. Across a row it is two
  words doing the work of one, six times over, and the strip stops fitting on a laptop.
  The section itself still carries the full name at the top of the pane, one line lower,
  so nothing is actually shortened — it is said once in each of the two voices the two
  places want.
*/
const SHORT: Record<StepKey, string> = {
  accounts: "Accounts",
  expense: "Expenses",
  income: "Income",
  earning: "What comes in",
  things: "Things you buy",
  rates: "Rates",
  calendar: "Calendar",
};

/**
 * The six areas of Setup, across the top.
 *
 * It was a 320px card down the left: a kicker, the word `Ready`, a sentence saying the
 * same thing again, a four-segment progress bar with every segment filled, six rows each
 * with a green tick, and the total balance. Four hundred pixels of chrome to hold six
 * links — and every part of it in the state it will be in for the rest of the app's life,
 * because setup is done once. A checklist where everything is permanently ticked is not a
 * checklist; it is a picture of one.
 *
 * What is actually needed here is navigation, and navigation across the top costs a row.
 * The width it hands back is not spare: the pane holds a table of eight accounts and a
 * grid of fifty-eight categories, and both were being read through a letterbox.
 *
 * The checklist is not gone — it appears under the strip when something is genuinely
 * missing, which is the only condition under which it has ever had anything to say. A dot
 * on the tab says which one, so the strip carries the alarm and the page carries the
 * detail.
 */
export function SetupTabs({ foundation, active }: { foundation: Foundation; active: string }) {
  const missing = foundation.steps.filter((s) => s.required && !s.done);

  return (
    <div className="setup-tabs-wrap">
      <nav className="setup-tabs" aria-label="Setup sections">
        {/*
          `What comes in` is not one of these, and it never was.

          It is a check rather than a place: its pane held one figure and a button reading
          `Manage them in Upcoming` — a tab whose whole content is a door to another
          screen. It stays in the foundation, because a profile with no income on file
          reads every month as a pure loss and that is worth being told; it is told in the
          line under this strip, where the other missing things are said, with the door on
          the words instead of on a tab of its own.
        */}
        {foundation.steps
          .filter((s) => s.key !== "earning")
          .map((step) => {
          const Icon = ICON[step.key];
          const on = active === step.id;
          const todo = step.required && !step.done;
          return (
            <a
              key={step.key}
              href={`#${step.id}`}
              aria-current={on ? "page" : undefined}
              className={cn("setup-tab", on && "is-on", todo && "is-todo")}
            >
              <Icon className="setup-tab-icon h-4 w-4" aria-hidden />
              <span className="setup-tab-label">{SHORT[step.key]}</span>
              {step.count != null && step.count > 0 && (
                <span className="mono setup-tab-count">{step.count}</span>
              )}
              {todo && <span className="setup-tab-dot" aria-hidden />}
              {todo && <span className="sr-only">needs you</span>}
              </a>
            );
          })}

        {/*
          Not one of the foundation's steps, and it never becomes done.

          Everything to its left is something to put in place once; this is a door, and it
          is here because it had no door on this side of the app at all. Export lives on
          the Freelance settings screen, which from Private meant switching workspaces to
          reach — and a `Settings` line in the Private sidebar, which is what was tried
          first, threw the whole sidebar over to the other workspace when pressed.

          Last, and without a count or a dot, so it reads as the end of the strip rather
          than as one more thing waiting to be filled in.
        */}
        <a
          href={`#${DATA_PANE}`}
          aria-current={active === DATA_PANE ? "page" : undefined}
          className={cn("setup-tab", active === DATA_PANE && "is-on")}
        >
          <HardDriveDownload className="setup-tab-icon h-4 w-4" aria-hidden />
          <span className="setup-tab-label">Your data</span>
        </a>
      </nav>

      {/*
        Only while something is missing, and it says which. `2 of 4` on its own is a score;
        the sentence after it is the thing that can be acted on.
      */}
      {missing.length > 0 && (
        <p className="setup-todo">
          <b className="mono">
            {foundation.done} of {foundation.total}
          </b>{" "}
          in place — {missing.map((s) => s.todo).join(" · ")}
        </p>
      )}
    </div>
  );
}
