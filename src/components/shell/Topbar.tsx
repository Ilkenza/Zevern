"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, Plus, Zap } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { NEW_ITEMS, PRIVATE_NEW_ITEMS, workspaceFor } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { ShellUser } from "./types";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Topbar({
  user,
  hidden = [],
  onMenu,
}: {
  user: ShellUser;
  hidden?: string[];
  onMenu: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const isPrivate = workspaceFor(pathname) === "private";
  const firstName = user.fullName?.trim().split(/\s+/)[0] ?? null;
  const newItems = isPrivate
    ? PRIVATE_NEW_ITEMS
    : NEW_ITEMS.filter((item) => !hidden.includes(item.moduleKey));

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-base/80 px-5 py-3 backdrop-blur lg:px-8">
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="rounded-ctrl p-1.5 text-muted transition-colors hover:bg-white/4 hover:text-ink lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[16px] font-bold tracking-[-0.3px] text-ink">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </div>
        <div className="hidden truncate text-[12px] text-muted sm:block">
          {isPrivate ? "Private — tasks and money." : "Freelance — leads, work and invoices."}
        </div>
      </div>

      {/* Quick add — one tap to log a spend, phone-first */}
      {isPrivate && (
        <Link
          href="/private/quick"
          className={buttonClasses("secondary", "border")}
          aria-label="Quick add"
        >
          <Zap className="h-4 w-4" />
          <span className="hidden sm:inline">Quick add</span>
        </Link>
      )}

      {/* Search (visual placeholder in Phase 2) */}
      <div className="relative hidden md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          type="search"
          placeholder="Search…"
          aria-label="Search"
          className="w-55 rounded-ctrl border border-line bg-white/[0.035] py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-faint focus:border-gold focus:outline-none"
        />
      </div>

      {/* + New */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={buttonClasses("primary")}
        >
          <Plus className="h-4 w-4" />
          New
        </button>
        {menuOpen && (
          <>
            <button
              aria-hidden
              tabIndex={-1}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-44 rounded-card border border-line bg-surface p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]"
            >
              {newItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "block rounded-ctrl px-3 py-2 text-[13px] font-medium text-muted transition-colors",
                    "hover:bg-white/4 hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
