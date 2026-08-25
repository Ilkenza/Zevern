"use client";

import { useEffect, useState } from "react";

/**
 * Which section the reader is currently in, for the index beside the page.
 *
 * An IntersectionObserver rather than a scroll handler: the browser works out what is
 * on screen on its own and only calls back when the answer changes, so this costs
 * nothing while scrolling and needs no throttling to stay smooth.
 *
 * The top margin pulls the trigger line down below the sticky topbar, and the bottom
 * one keeps only the upper part of the viewport in play — otherwise the last section
 * on a short page never wins, because the one above it is still visible underneath.
 */
export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    /*
      A set of what is on screen, not a map of how much of it.

      The first version stored `intersectionRatio` and treated anything above zero as
      visible. That reads correctly and is wrong: for a section taller than the band it
      is measured against, the ratio is the fraction of the *section* inside the band,
      which rounds to zero on a long one — so the observer fired, every entry looked
      invisible, and the index never moved off the first item. `isIntersecting` is the
      question actually being asked.
    */
    const onScreen = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onScreen.add(entry.target.id);
          else onScreen.delete(entry.target.id);
        }
        // The first one still on screen, in page order — which is what the eye reads
        // as "where I am", rather than whichever happens to be most visible.
        const current = ids.find((id) => onScreen.has(id));
        if (current) setActive(current);
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 },
    );

    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((n): n is HTMLElement => n != null);
    nodes.forEach((n) => observer.observe(n));

    return () => observer.disconnect();
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps -- compared by value

  return active;
}
