import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";

export type OnboardingStep = {
  key: string;
  /** What the person gets out of doing it, not what the app does. */
  title: string;
  detail: string;
  href: string;
  cta: string;
  done: boolean;
};

export type Onboarding = {
  steps: OnboardingStep[];
  done: number;
  total: number;
  /** True once every step is ticked — the checklist then congratulates and retires itself. */
  complete: boolean;
  hidden: boolean;
};

/** Cheap existence check: no rows come back, only the count. */
async function has(table: string, uid: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid);
  return (count ?? 0) > 0;
}

/**
 * The getting-started checklist, answered from the data rather than from a stored
 * flag. Order matters: it walks the same chain the work does — say who you are,
 * find someone, price it, do it, get paid.
 */
export async function getOnboarding(): Promise<Onboarding> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) {
    return { steps: [], done: 0, total: 0, complete: false, hidden: true };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, onboarding_hidden")
    .eq("id", uid)
    .maybeSingle();

  const [lead, client, quote, project, invoice] = await Promise.all([
    has("leads", uid),
    has("clients", uid),
    has("quotes", uid),
    has("projects", uid),
    has("invoices", uid),
  ]);

  const steps: OnboardingStep[] = [
    {
      key: "business",
      title: "Put your name on your paperwork",
      detail: "Without business details, a quote or invoice goes out with your email address as the sender.",
      href: "/settings",
      cta: "Fill in details",
      done: Boolean(profile?.business_name),
    },
    {
      key: "lead",
      title: "Save someone worth contacting",
      detail: "Add a lead by hand, import a CSV, or grab one from Instagram with the extension.",
      href: "/leads?new=1",
      cta: "Add a lead",
      done: lead,
    },
    {
      key: "client",
      title: "Turn one into a client",
      detail: "A won lead becomes a client and a draft project in a single click.",
      href: "/clients?new=1",
      cta: "Add a client",
      done: client,
    },
    {
      key: "quote",
      title: "Price the work",
      detail: "Build a quote from your service catalog and send the printable version.",
      href: "/quotes/new",
      cta: "Build a quote",
      done: quote,
    },
    {
      key: "project",
      title: "Start the job",
      detail: "A project keeps the tasks, the client and the deadline in one place.",
      href: "/projects?new=1",
      cta: "Start a project",
      done: project,
    },
    {
      key: "invoice",
      title: "Get paid",
      detail: "An accepted quote becomes an invoice without retyping a single line.",
      href: "/invoices?new=1",
      cta: "Raise an invoice",
      done: invoice,
    },
  ];

  const done = steps.filter((s) => s.done).length;

  return {
    steps,
    done,
    total: steps.length,
    complete: done === steps.length,
    hidden: Boolean(profile?.onboarding_hidden),
  };
}
