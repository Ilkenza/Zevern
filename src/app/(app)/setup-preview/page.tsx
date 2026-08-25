import { SetupView } from "@/components/private/SetupView";
import type { MoneyCategory } from "@/lib/types";
import type { AccountBalance } from "@/lib/data/money";

const accounts = [
  { id: "a", user_id: "u", name: "Cash", kind: "cash", currency: "RSD", opening_balance: 4150, color: null, archived: false, sort: 0, created_at: "2026-01-01T00:00:00Z", balance: 3480, reserved: 0, free: 3480 },
  { id: "b", user_id: "u", name: "Bank (RSD)", kind: "bank", currency: "RSD", opening_balance: 146023, color: null, archived: false, sort: 1, created_at: "2026-01-01T00:00:00Z", balance: 146023, reserved: 0, free: 146023 },
] as AccountBalance[];

const cat = (id: string, name: string, kind: string, color: string): MoneyCategory =>
  ({ id, user_id: "u", name, kind, icon: null, color, archived: false, sort: 0, created_at: "2026-01-01T00:00:00Z" }) as MoneyCategory;

const categories = [
  cat("1", "Groceries", "expense", "#5fb88a"),
  cat("2", "Eating out", "expense", "#d6885b"),
  cat("3", "Transport", "expense", "#5b8fd6"),
  cat("4", "Bills & utilities", "expense", "#de6b5e"),
  cat("5", "Subscriptions", "expense", "#a98bd6"),
  cat("6", "Health", "expense", "#4fb3b8"),
];

export default function SetupPreview() {
  return (
    <SetupView
      accounts={accounts}
      categories={categories}
      rates={{ EUR: 117.2, USD: 101 }}
      ratesUpdatedOn={null}
      customColors={[]}
      calendarToken={null}
      origin="http://localhost:3000"
    />
  );
}
