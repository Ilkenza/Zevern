import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import type { NavCounts } from "@/lib/nav";
import { getClientCount } from "@/lib/data/clients";
import { getProjectCount } from "@/lib/data/projects";
import { getOpenTaskCount } from "@/lib/data/tasks";
import { getInvoiceCount } from "@/lib/data/invoices";
import { getCheckCount } from "@/lib/data/seo";
import { getActiveLeadCount } from "@/lib/data/leads";
import { getQuoteCount } from "@/lib/data/quotes";
import { getToolCount } from "@/lib/data/tools";
import { getProfile } from "@/lib/data/profile";
import { DefaultCurrencyProvider } from "@/lib/money/currency";
import { CURRENCIES, type Currency } from "@/lib/money";
import { getRates } from "@/lib/data/money";
import { greetingFor } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // "/" is the only route reachable without a session, and there the page renders
  // the marketing page — which must not be wrapped in the app shell. Every other
  // route in this group is closed by proxy.ts before it gets here.
  if (!user) return <>{children}</>;

  const shellUser = {
    fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
    email: user.email ?? "",
  };

  const [clients, projects, tasks, privateTasks, invoices, seo, leads, quotes, tools, profile] =
    await Promise.all([
      getClientCount(),
      getProjectCount(),
      getOpenTaskCount("work"),
      getOpenTaskCount("personal"),
      getInvoiceCount(),
      getCheckCount(),
      getActiveLeadCount(),
      getQuoteCount(),
      getToolCount(),
      getProfile(),
    ]);
  const counts: NavCounts = {
    clients,
    projects,
    tasks,
    privateTasks,
    invoices,
    seo,
    leads,
    quotes,
    tools,
  };
  const hidden = profile?.hidden_modules ?? [];
  // Read once here so no screen has to be handed it. The same two facts the server
  // helper uses, so a page and the client components inside it can never print the
  // same figure in two different currencies.
  const stored = profile?.default_currency ?? "RSD";
  const currency = ((CURRENCIES as readonly string[]).includes(stored) ? stored : "RSD") as Currency;
  const rates = await getRates();

  return (
    <DefaultCurrencyProvider value={{ currency, rates }}>
      <AppShell
        user={shellUser}
        // Decided here, on the server clock, for the same reason "today" is: read on
        // both sides it disagrees with itself at noon, at six, and in any browser set
        // to another zone — and React answers a disagreement by redrawing the shell.
        greeting={greetingFor(new Date().getHours())}
        counts={counts}
        hidden={hidden}
      >
        {children}
      </AppShell>
    </DefaultCurrencyProvider>
  );
}
