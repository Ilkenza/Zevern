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
  Repeat,
  CalendarClock,
  PiggyBank,
  SlidersHorizontal,
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
  { label: "Recurring", href: "/private/recurring", icon: Repeat },
  { label: "Forecast", href: "/private/forecast", icon: CalendarClock },
  { label: "Goals", href: "/private/goals", icon: PiggyBank },
  { label: "Setup", href: "/private/setup", icon: SlidersHorizontal },
];

export type NavCounts = Partial<Record<CountKey, number>>;

export const NEW_ITEMS: { label: string; href: string; moduleKey: ModuleKey }[] = [
  { label: "New lead", href: "/leads?new=1", moduleKey: "leads" },
  { label: "New client", href: "/clients?new=1", moduleKey: "clients" },
  { label: "New project", href: "/projects?new=1", moduleKey: "projects" },
  { label: "New task", href: "/tasks?new=1", moduleKey: "tasks" },
  { label: "New invoice", href: "/invoices?new=1", moduleKey: "invoices" },
  { label: "New quote", href: "/quotes/new", moduleKey: "quotes" },
  { label: "New SEO check", href: "/seo?new=1", moduleKey: "seo" },
];

export const PRIVATE_NEW_ITEMS: { label: string; href: string }[] = [
  { label: "New expense", href: "/private/money?new=expense" },
  { label: "New income", href: "/private/money?new=income" },
  { label: "New task", href: "/private/tasks?new=1" },
  { label: "New goal", href: "/private/goals?new=1" },
  { label: "New recurring", href: "/private/recurring?new=1" },
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
