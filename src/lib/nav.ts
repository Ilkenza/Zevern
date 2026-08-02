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
  | "tools";

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
