"use client";

import { useState, ViewTransition } from "react";
import { X } from "lucide-react";
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
  greeting,
  counts,
  hidden = [],
  children,
}: {
  user: ShellUser;
  greeting: string;
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
          {/*
            `100dvh` for the same reason the side panel needs it: the layout viewport
            is taller than what is on screen while the address bar is up, and what
            falls off the bottom is the sign-out row.
          */}
          <div className="zv-drawer absolute left-0 top-0 h-[100dvh] w-65 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
            <Sidebar
              user={user}
              counts={counts}
              hidden={hidden}
              onNavigate={() => setDrawerOpen(false)}
            />
            {/*
              The only way out of this was tapping the dark strip beside it — an
              affordance nothing on screen mentions. A close button says so.
            */}
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              title="Close menu"
              className="zv-press absolute right-3 top-3.5 flex h-9 w-9 items-center justify-center rounded-ctrl border border-line bg-white/[0.045] text-ink hover:border-danger/50 hover:bg-danger-bg hover:text-danger"
            >
              <X className="h-4.5 w-4.5" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-h-screen flex-col">
        <Topbar
          user={user}
          greeting={greeting}
          hidden={hidden}
          onMenu={() => setDrawerOpen(true)}
        />
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
