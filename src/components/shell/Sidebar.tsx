"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import {
  NAV_ITEMS,
  PRIVATE_NAV_ITEMS,
  WORKSPACES,
  workspaceFor,
  type NavCounts,
} from "@/lib/nav";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import type { ShellUser } from "./types";

function initialsOf(user: ShellUser) {
  const source = user.fullName?.trim() || user.email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

export function Sidebar({
  user,
  counts,
  hidden = [],
  onNavigate,
}: {
  user: ShellUser;
  counts: NavCounts;
  hidden?: string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const workspace = workspaceFor(pathname);
  const items =
    workspace === "private"
      ? PRIVATE_NAV_ITEMS
      : NAV_ITEMS.filter((item) => !item.moduleKey || !hidden.includes(item.moduleKey));

  return (
    <aside className="flex h-screen flex-col border-r border-line bg-sidebar lg:sticky lg:top-0">
      <div className="zv-brand flex items-center gap-2 px-5 pb-3 pt-5">
        <div className="zv-mark flex h-7 w-7 items-center justify-center rounded-ctrl bg-gold text-on-gold">
          <span className="font-display text-[15px] font-extrabold">Z</span>
        </div>
        <span className="font-display text-[17px] font-extrabold tracking-[-0.4px] text-ink">
          Zevern
        </span>
      </div>

      {/*
        Workspace switch — the app has two halves and only one is ever open.

        `zv-seg` is the app's segmented control, already worn by the entry form and the
        goal form. Nothing about this one is special enough to earn a second look for
        the same job, and the switch is on every screen — so a look of its own would be
        the most visible inconsistency in the product rather than the least.
      */}
      <div className="zv-seg mx-3">
        {WORKSPACES.map((w) => {
          const active = workspace === w.key;
          return (
            <Link
              key={w.key}
              href={w.href}
              onClick={onNavigate}
              aria-current={active ? "true" : undefined}
              className={cn(active && "is-on")}
            >
              {w.label}
            </Link>
          );
        })}
      </div>

      {/* Nav */}
      <nav className="zv-nav-list flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active =
            item.href === "/" || item.href === "/private"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          const count = item.countKey ? counts[item.countKey] : undefined;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "zv-nav-item flex items-center gap-3 rounded-ctrl px-3 py-2 text-[13.5px] font-semibold",
                /*
                  Only the text colour is set here. The lighting is in `zv-nav-item`,
                  which shares its construction with the quick-add menu — a rule at the
                  left edge and light spilling right from it, with no filled rectangle
                  anywhere. A `bg-` utility would put the rectangle back and the two
                  places would stop being the same object again.
                */
                active ? "text-gold" : "text-muted hover:text-ink",
              )}
            >
              {/*
                The same tile the quick-add menu puts its icons in, at the size this row
                works in. Sharing the class rather than copying the look is the point:
                two places drawing the same object from two sets of numbers drift apart
                on the first change either one gets.
              */}
              <span className="zv-icon-tile">
                <Icon className="zv-nav-icon h-4.5 w-4.5" strokeWidth={2} />
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {typeof count === "number" && count > 0 && (
                <span className="zv-nav-count mono text-[11px] text-faint">{count}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User block */}
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-ctrl px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-[12px] font-bold uppercase text-gold">
            {initialsOf(user)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink">
              {user.fullName ?? "Account"}
            </div>
            <div className="mono truncate text-[11px] text-muted">
              {user.email}
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              className="zv-press cursor-pointer rounded-ctrl p-1.5 text-muted hover:bg-white/[0.04] hover:text-danger"
            >
              <LogOut className="h-[16px] w-[16px]" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}


