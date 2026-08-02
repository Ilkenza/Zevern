"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { ShellUser } from "./types";
import type { NavCounts } from "@/lib/nav";

export function AppShell({
  user,
  counts,
  hidden = [],
  children,
}: {
  user: ShellUser;
  counts: NavCounts;
  hidden?: string[];
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-base lg:grid lg:grid-cols-[260px_1fr]">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar user={user} counts={counts} hidden={hidden} />
      </div>

      {/* Mobile drawer + overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute inset-y-0 left-0 w-65 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
            <Sidebar
              user={user}
              counts={counts}
              hidden={hidden}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-h-screen flex-col">
        <Topbar user={user} hidden={hidden} onMenu={() => setDrawerOpen(true)} />
        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
