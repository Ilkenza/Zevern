import { redirect } from "next/navigation";
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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already guards this; belt-and-suspenders for the user block below.
  if (!user) redirect("/login");

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

  return (
    <AppShell user={shellUser} counts={counts} hidden={hidden}>
      {children}
    </AppShell>
  );
}
