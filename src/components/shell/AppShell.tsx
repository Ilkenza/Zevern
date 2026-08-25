"use client";

import { useState, ViewTransition } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { ShellUser } from "./types";
import type { NavCounts } from "@/lib/nav";

/**
 * The frame, and the one place that decides how a route change looks.
 *
 * `<ViewTransition>` wraps only the main column. The sidebar and the topbar are given
 * their own view-transition names and told to hold still, so a navigation moves the
 * content and nothing else — which is the whole difference between an app and a set
 * of pages. Direction comes from `transitionTypes` on the links themselves: a row
 * into a detail page says "forward", the way out says "back", and everything else
 * gets the plain lift.
 */
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
      <div className="hidden lg:block" style={{ viewTransitionName: "zv-sidebar" }}>
        <Sidebar user={user} counts={counts} hidden={hidden} />
      </div>

      {/* Mobile drawer + overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="zv-scrim absolute inset-0 bg-black/60"
          />
          <div className="zv-drawer absolute inset-y-0 left-0 w-65 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
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
        <ViewTransition
          enter={{ "zv-forward": "zv-forward", "zv-back": "zv-back", default: "zv-in" }}
          exit={{ "zv-forward": "zv-forward", "zv-back": "zv-back", default: "zv-in" }}
        >
          <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
        </ViewTransition>
      </div>
    </div>
  );
}
