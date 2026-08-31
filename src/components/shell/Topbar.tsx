"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus, Zap, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { NEW_ITEMS, PRIVATE_NEW_ITEMS, workspaceFor } from "@/lib/nav";
import type { ShellUser } from "./types";

export function Topbar({
  user,
  greeting,
  hidden = [],
  onMenu,
}: {
  user: ShellUser;
  /** Read from the server's clock in the layout — see `greetingFor`. */
  greeting: string;
  hidden?: string[];
  onMenu: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  /*
    Pressing anywhere outside it closes it, and so does Escape.

    This was a full-screen sheet behind the menu, which is the usual way and did not work
    here: the header carries `backdrop-blur`, and a blurred element becomes the containing
    block for anything `fixed` inside it — so `fixed inset-0` covered the header strip and
    nothing else. Every click on the page below went straight past it and the menu could
    only be closed by its own X.

    A listener has no such problem, because it is not a rectangle. It also closes on a
    press anywhere in the header, which the sheet could not do without covering the very
    controls it sat over. The whole group is the reference, not just the menu, so pressing
    `New` while it is open reaches the button's own toggle instead of being read as an
    outside press and re-opened by it.
  */
  const group = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!group.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  const pathname = usePathname();
  const isPrivate = workspaceFor(pathname) === "private";
  const firstName = user.fullName?.trim().split(/\s+/)[0] ?? null;
  const newItems = isPrivate
    ? PRIVATE_NEW_ITEMS
    : NEW_ITEMS.filter((item) => !hidden.includes(item.moduleKey));

  return (
    <header
      style={{ viewTransitionName: "zv-topbar" }}
      className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-base/80 px-5 py-3 backdrop-blur lg:px-8"
    >
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="zv-press rounded-ctrl p-1.5 text-muted hover:bg-white/4 hover:text-ink lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[16px] font-bold tracking-[-0.3px] text-ink">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </div>
        <div className="hidden truncate text-[12px] text-muted sm:block">
          {isPrivate ? "Private — tasks and money." : "Freelance — leads, work and invoices."}
        </div>
      </div>

      {/*
        Quick add, on the screens it is actually for.

        It is the shop path: one amount, one tap on a thing you buy often, done — and that
        is a phone standing at a till. On a desktop the same person has `New` two pixels to
        the right, which opens the full form, and the entry panel is one click from every
        money screen. A third door to the same room, permanently in the header, is what it
        was there — so it now stops at the width where the full form gets awkward.
      */}
      {isPrivate && (
        <Link
          href="/private/quick"
          className={buttonClasses("secondary", "zv-press border md:hidden")}
          aria-label="Quick add"
        >
          <Zap className="h-4 w-4" />
          <span className="hidden sm:inline">Quick add</span>
        </Link>
      )}

      {/*
        The search box is gone.

        It was a placeholder: a box you could click into, type a whole sentence in, press
        Enter, and nothing happened — on every screen in the app, at the top, next to two
        controls that do work. A control that does nothing is worse than a missing one,
        because the missing one does not make a promise.

        Every list that holds enough to need searching has its own search in its own
        toolbar, scoped to what is in front of you, and those work. What this one was
        reaching for is a different thing — one box that finds an entry, a task, a goal or
        a debt from anywhere — and that belongs behind a key rather than in a permanent
        box. When it exists it can come back.
      */}

      {/* + New */}
      <div ref={group} className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={buttonClasses("primary", "zv-press zv-turn")}
        >
          <Plus className="h-4 w-4" />
          New
        </button>
        {menuOpen && (
          <>
            <div
              role="menu"
              className="zv-menu absolute right-0 z-50 mt-2 w-53 rounded-card border border-line bg-surface p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]"
            >
              {/*
                Pressing the page behind it closes the menu, but nothing on screen says
                so — on a phone that reads as a menu with no way out. The X is the way
                out that says it, and it sits where every other panel keeps one.
              */}
              <div className="flex items-center justify-between gap-2 border-b border-line-soft px-2 pb-1.5 pt-1">
                <span className="mono text-[10.5px] uppercase tracking-[0.14em] text-faint">
                  New
                </span>
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  title="Close"
                  className="zv-press flex h-6.5 w-6.5 items-center justify-center rounded-ctrl text-faint hover:bg-white/6 hover:text-ink"
                >
                  <X className="h-3.75 w-3.75" strokeWidth={2.25} />
                </button>
              </div>

              {newItems.map((item, i) => (
                <Fragment key={item.href}>
                  {/*
                    One hairline, where the subject changes.

                    Everything above it is money; below it is not. The order alone says
                    so only to someone who already knows — the rule says it to everyone,
                    and costs a pixel.
                  */}
                  {item.dividerBefore && <div role="separator" className="zv-menu-sep" />}
                  <Link
                    href={item.href}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    /*
                      Eighteen milliseconds apart, which is under the threshold at which a
                      cascade becomes a queue. The list still lands as one gesture; it just
                      lands in an order, and the eye reads an order as something that was
                      arranged rather than something that appeared.
                    */
                    style={{ animationDelay: `${i * 18}ms` }}
                    className="zv-menu-item flex items-center gap-2.5 rounded-ctrl px-2.5 py-2 text-[13px] font-medium"
                  >
                    {/*
                      The tile is what makes six different glyphs one column.

                      An arrow is one stroke and a banknote is nine; set bare, the first
                      two rows read as half-empty next to the rest and the eye finds a
                      rhythm that is not there. Boxed, every row starts with the same
                      22px square and the drawing inside it stops being a size.
                    */}
                    <span className="zv-icon-tile">
                      <item.icon className="zv-menu-icon h-3.75 w-3.75" aria-hidden />
                    </span>
                    {item.label}
                  </Link>
                </Fragment>
              ))}
            </div>
          </>
        )}
      </div>
    </header>
  );
}

