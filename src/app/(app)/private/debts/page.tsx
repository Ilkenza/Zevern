import { getLoans } from "@/lib/data/money";
import { DebtsView, type DebtsPanel } from "@/components/private/debts/DebtsView";

export const metadata = { title: "Loans & debts" };

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string }>;
}) {
  const [params, debts] = await Promise.all([searchParams, getLoans()]);

  let panel: DebtsPanel = null;
  if (params.new) {
    panel = { mode: "new" };
  } else if (params.edit) {
    const debt = debts.find((d) => d.id === params.edit);
    if (debt) panel = { mode: "edit", debt };
  }

  return <DebtsView debts={debts} panel={panel} />;
}
