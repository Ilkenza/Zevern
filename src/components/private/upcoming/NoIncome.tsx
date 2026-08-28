import Link from "next/link";
import { Info } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

/**
 * What this screen says when only one side of the arithmetic has been entered.
 *
 * The forecast adds income and subtracts bills, savings and everyday spending. With no
 * repeating income on file the sum can only ever fall, and the day the line crosses zero
 * is arithmetic over half the picture — so the red `You run out of free money on …`
 * banner is not a finding, it is a symptom of an empty table. Shown as a warning it is
 * worse than useless: it is the app being confidently wrong about the one thing it
 * volunteers an opinion on.
 *
 * The same rule the zeroes on the other screens follow: a display has to distinguish
 * *measured* from *not entered*. This is that distinction at the most expensive place in
 * the app.
 *
 * So the curve stays — money going out over ninety days is a real and useful thing to
 * see — but it is labelled as what it actually is, and the way to make it a forecast is
 * one click away.
 */
export function NoIncome() {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13.5px] font-bold text-ink">
            No income on file — this counts only what goes out
          </h2>
          <p className="mt-1.5 max-w-prose text-[12.5px] leading-relaxed text-muted">
            The line below is your bills, savings and everyday spending drawn against
            what is on the accounts today. It has to fall, because nothing has been
            entered on the other side — so the day it reaches zero is not a prediction
            yet. Add what comes in and this turns into a real forecast.
          </p>
          <Link
            href="/private/recurring?new=1"
            className={buttonClasses("primary", "money-premium-button mt-3")}
          >
            Add income
          </Link>
        </div>
      </div>
    </section>
  );
}
