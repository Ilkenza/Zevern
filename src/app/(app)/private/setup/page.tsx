import { getAccountBalances, getCategories, getRates } from "@/lib/data/money";
import { getProfile } from "@/lib/data/profile";
import { SetupView } from "@/components/private/SetupView";

export default async function PrivateSetupPage() {
  const [accounts, categories, rates, profile] = await Promise.all([
    getAccountBalances(),
    getCategories(),
    getRates(),
    getProfile(),
  ]);

  return (
    <SetupView
      accounts={accounts}
      categories={categories}
      rates={rates}
      ratesUpdatedOn={profile?.rates_updated_on ?? null}
    />
  );
}
