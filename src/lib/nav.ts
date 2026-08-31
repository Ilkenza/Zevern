import { GoalIcon } from "@/components/icons/GoalIcon";
import {
  LayoutDashboard,
  Send,
  FolderKanban,
  ListChecks,
  Users,
  ReceiptText,
  FileSpreadsheet,
  Sparkles,
  Wrench,
  Settings,
  Wallet,
  Target,
  CalendarClock,
  SlidersHorizontal,
  HandCoins,
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";

export type CountKey =
  | "projects"
  | "tasks"
  | "clients"
  | "invoices"
  | "seo"
  | "leads"
  | "quotes"
  | "tools"
  | "privateTasks";

/** Toggleable module keys (Settings on/off). Overview + Settings are always shown. */
export type ModuleKey =
  | "leads"
  | "projects"
  | "tasks"
  | "clients"
  | "invoices"
  | "quotes"
  | "seo"
  | "toolbox";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  countKey?: CountKey;
  moduleKey?: ModuleKey;
};

/** The two halves of the app. Freelance is the work side, Private is life. */
export type Workspace = "work" | "private";

export const WORKSPACES: { key: Workspace; label: string; href: string }[] = [
  { key: "work", label: "Freelance", href: "/" },
  { key: "private", label: "Private", href: "/private" },
];

export function workspaceFor(pathname: string): Workspace {
  return pathname === "/private" || pathname.startsWith("/private/") ? "private" : "work";
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Leads", href: "/leads", icon: Send, countKey: "leads", moduleKey: "leads" },
  { label: "Projects", href: "/projects", icon: FolderKanban, countKey: "projects", moduleKey: "projects" },
  { label: "Tasks", href: "/tasks", icon: ListChecks, countKey: "tasks", moduleKey: "tasks" },
  { label: "Clients", href: "/clients", icon: Users, countKey: "clients", moduleKey: "clients" },
  { label: "Invoices", href: "/invoices", icon: ReceiptText, countKey: "invoices", moduleKey: "invoices" },
  { label: "Quotes", href: "/quotes", icon: FileSpreadsheet, countKey: "quotes", moduleKey: "quotes" },
  { label: "SEO / GEO", href: "/seo", icon: Sparkles, countKey: "seo", moduleKey: "seo" },
  { label: "Toolbox", href: "/toolbox", icon: Wrench, countKey: "tools", moduleKey: "toolbox" },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const PRIVATE_NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/private", icon: LayoutDashboard },
  { label: "Tasks", href: "/private/tasks", icon: ListChecks, countKey: "privateTasks" },
  { label: "Money", href: "/private/money", icon: Wallet },
  { label: "Budgets", href: "/private/budgets", icon: Target },
  // One screen, two views: the timeline leads because "what is coming" is asked
  // before every real spending decision, while "what repeats" is asked only when
  // something changes. /private/recurring still works and opens the Rules view.
  { label: "Upcoming", href: "/private/upcoming", icon: CalendarClock },
  // A bullseye with an arrow in it — the symbol everything from Google to a keyboard
  // emoji reaches for when it means "goal". `Target`, on Budgets above, is the same
  // bullseye without the arrow: related on purpose, told apart by the one mark that
  // says something was aimed and landed.
  { label: "Goals", href: "/private/goals", icon: GoalIcon },
  /*
    Money owed, in both directions, on its own screen — and until now with no door into
    it. The totals sit on the overview and the entries sit in the ledger, which is fine
    for noticing and useless for managing: settling one meant finding a row in a list of
    two hundred. A hand giving coins away is the one icon in the set that reads as money
    that is not yours to spend.
  */
  { label: "Debts", href: "/private/debts", icon: HandCoins },
  { label: "Setup", href: "/private/setup", icon: SlidersHorizontal },
  /*
    Settings is deliberately not here, and the attempt to put it here is worth recording.

    `/settings` is a Freelance route — `workspaceFor` reads the path and anything outside
    `/private` is the other workspace — so a `Settings` line in this list looked like a
    Private screen and, pressed, threw the whole sidebar over to Freelance. Worse than the
    problem it was meant to fix: the reason it went in was that export had no door on this
    side, and the door it opened led out of the building.

    Most of that screen is Freelance anyway — business details, module toggles, the lead
    collector. The one part of it Private actually wants is the export, and that now lives
    in Setup, under `Your data`, where it can be reached without leaving.
  */
];

export type NavCounts = Partial<Record<CountKey, number>>;

export const NEW_ITEMS: (NewItem & { moduleKey: ModuleKey })[] = [
  { label: "New lead", href: "/leads?new=1", icon: Send, moduleKey: "leads" },
  { label: "New client", href: "/clients?new=1", icon: Users, moduleKey: "clients" },
  { label: "New project", href: "/projects?new=1", icon: FolderKanban, moduleKey: "projects" },
  { label: "New task", href: "/tasks?new=1", icon: ListChecks, moduleKey: "tasks" },
  { label: "New invoice", href: "/invoices?new=1", icon: ReceiptText, moduleKey: "invoices" },
  { label: "New quote", href: "/quotes/new", icon: FileSpreadsheet, moduleKey: "quotes" },
  { label: "New SEO check", href: "/seo?new=1", icon: Sparkles, moduleKey: "seo" },
];

/**
 * The quick-add menu, with an icon on every line.
 *
 * A menu you open every day is not read after the first week — it is aimed at. A shape
 * in a fixed position is aimed at faster than a word, and the word then only confirms.
 * Six labels of similar length and no other mark is the one arrangement that forces a
 * read every single time.
 *
 * The vocabulary is the sidebar's, not a new one: whatever a row leads to wears the
 * icon that place already wears. The three money actions are the exception, because all
 * three lead to the same screen and would collide on `Wallet` — those take the
 * direction the money goes instead, which is the same language the ledger's signs use.
 */
export type NewItem = { label: string; href: string; icon: LucideIcon; dividerBefore?: boolean };

export const PRIVATE_NEW_ITEMS: NewItem[] = [
  { label: "New expense", href: "/private/money?new=expense", icon: ArrowDownRight },
  { label: "New income", href: "/private/money?new=income", icon: ArrowUpRight },
  /*
    Money moving between two of your own accounts, which is not spending it.

    It read `Withdraw cash` and opened this same form, which was one use of it standing
    in for all of them: cash out of an ATM, but also a card bill paid off a savings
    account, or dinars moved before a trip. The narrower name made the other three look
    like they belonged somewhere else on the menu, and there is nowhere else — so the
    line is now what the form is. The banknote went with the name: an arrow that points
    both ways is the direction this money actually goes, and the three money lines above
    and below it are already drawn that way.
  */
  { label: "Transfer", href: "/private/money?new=transfer", icon: ArrowLeftRight },
  { label: "New goal", href: "/private/goals?new=1", icon: GoalIcon },
  /*
    A budget belongs here for the same reason a goal does: both are set once and then
    lived with, and both were reachable only from their own screen — which is the one
    place you are not standing when you decide to cap a category.
  */
  { label: "New budget", href: "/private/budgets?new=1", icon: Target },
  { label: "New recurring", href: "/private/upcoming?view=rules&new=1", icon: CalendarClock },
  /*
    The task goes last because everything above it is money.

    It used to sit fourth, between `Transfer` and `New goal`, which cut the list in
    half with the one item that is not about a dinar. A menu read top to bottom should
    change subject once, not twice — and a subject that appears, leaves and comes back
    reads as an ordering nobody chose.

    Debts are deliberately not in this list. A credit is taken once every few years and
    money is lent to a friend once or twice; putting either here would push what is used
    daily further down for something that gets read a hundred times and pressed once.
    Both are two taps from `Add` on the money screen, which is the right price for how
    often they happen.
  */
  { label: "New task", href: "/private/tasks?new=1", icon: ListChecks, dividerBefore: true },
];

/** For the Settings toggle UI. */
export const MODULE_OPTIONS: { key: ModuleKey; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "projects", label: "Projects" },
  { key: "tasks", label: "Tasks" },
  { key: "clients", label: "Clients" },
  { key: "invoices", label: "Invoices" },
  { key: "quotes", label: "Quotes" },
  { key: "seo", label: "SEO / GEO" },
  { key: "toolbox", label: "Toolbox" },
];
