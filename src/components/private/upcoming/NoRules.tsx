import Link from "next/link";
import { Repeat } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { NEW_RULE_HREF } from "./index";
import { caps } from "./ui";

/** Nothing recurring yet — so the panel has to explain what a rule is for on its own. */
export function NoRules() {
  const steps = [
    "Name it, say what it costs and when it next falls due.",
    "Fixed amounts book themselves the first time you open this after the date passes. Variable ones — electricity, water — wait for you to type the amount.",
    "Give it a number of payments or an end date and it stops on its own when it is done.",
  ];

  return (
    <>
      <EmptyState
        icon={Repeat}
        title="Nothing repeats yet"
        description="Hosting, domains, subscriptions, rent, a phone paid off in instalments — enter each one once and never type it again."
        action={
          <Link href={NEW_RULE_HREF} className={buttonClasses("primary", "money-premium-button")}>
            New recurring
          </Link>
        }
      />
      <div className="border-t border-line-soft px-5 py-4">
        <div className={caps}>How a rule works</div>
        <ol className="mt-2.5 space-y-2 text-[12.5px] text-muted">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-2.5">
              <span className="mono shrink-0 text-[11.5px] text-faint">{i + 1}</span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

