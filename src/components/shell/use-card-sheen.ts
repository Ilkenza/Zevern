"use client";

import { useEffect } from "react";

/**
 * The band of light that crosses a card when you point at it.
 *
 * It is the treatment the goal cards already have and the one that was asked for: a
 * slightly slanted line of light that travels across the card on arrival and back across
 * it on the way out. `.goal-card-premium::before` is the original; this puts the same
 * thing on every other card without needing a free pseudo-element on each of them, which
 * they do not have — most already spend `::before` or `::after` on a corner glow, a
 * watermark or an entrance.
 *
 * So the band is a real element, made when the pointer arrives on a card and taken away
 * once it has finished travelling back. Delegated from the document rather than a
 * listener per card, because the Setup screen has sixty of them and the pointer is only
 * ever on one.
 *
 * `plus-lighter` on the clipping layer is what lets it pass over the content instead of
 * behind it: it may add light and can never subtract any, so a figure the band crosses
 * gets brighter for a moment and never dimmer.
 */

/** Everything card-shaped. Lists are deliberately absent — see the note below. */
const CARDS = [
  /*
    Every goal card is also a `.money-card-premium`, and it already has this band on its
    own `::before`. Without the exclusion it would run two of them, a frame apart.
  */
  ".money-card-premium:not(.goal-card-premium)",
  ".overview-kpi",
  ".onhand-account",
  ".debt-total",
  ".forecast-outlook",
  ".goal-secondary-panel",
  ".bud-card",
  ".setup-rate-tile",
  /*
    The summary panel on the goals screen, and not `.money-summary-panel` itself. That
    class is also worn by "Where it went" and the ledger's panels, which are lists — and
    a band of light crossing a list drags a bright bar over the row you are reading,
    every time, for the best part of a second. That is why it came off them.
  */
  ".goal-overall-panel",
].join(", ");

/** Long enough for the band to cross and come back; matches the CSS transition. */
const TRAVEL = 950;

export function useCardSheen(): void {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /* One band per card being pointed at, so leaving one while arriving on another
       lets both finish their own pass. */
    const bands = new Map<HTMLElement, { layer: HTMLElement; timer: number }>();

    const leave = (card: HTMLElement) => {
      const band = bands.get(card);
      if (!band) return;
      bands.delete(card);
      band.layer.classList.remove("is-on");
      window.clearTimeout(band.timer);
      window.setTimeout(() => band.layer.remove(), TRAVEL + 60);
    };

    const enter = (card: HTMLElement) => {
      if (bands.has(card)) return;

      const layer = document.createElement("span");
      layer.className = "zv-sheen";
      layer.setAttribute("aria-hidden", "true");
      const band = document.createElement("i");
      band.className = "zv-sheen-band";
      layer.appendChild(band);

      /*
        `inset: 0` needs something to be inset against. Every one of these is positioned
        already, but a card that is not would take the band to the top of the page — so
        it is checked rather than assumed.
      */
      if (getComputedStyle(card).position === "static") card.style.position = "relative";
      card.appendChild(layer);

      // Read a layout property so the browser commits the resting transform before the
      // class that changes it — without this the band is simply at the far side, and
      // there is no travel to see.
      void layer.offsetWidth;
      layer.classList.add("is-on");

      // A pointer that never leaves (the card is removed under it, a route changes)
      // would otherwise leave the band behind.
      const timer = window.setTimeout(() => {
        if (!card.isConnected) {
          bands.delete(card);
          layer.remove();
        }
      }, TRAVEL * 4);

      bands.set(card, { layer, timer });
    };

    const over = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.(CARDS) as HTMLElement | null;
      for (const other of [...bands.keys()]) if (other !== card) leave(other);
      if (card) enter(card);
    };

    const gone = () => {
      for (const card of [...bands.keys()]) leave(card);
    };

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerleave", gone);
    // A scroll under a still pointer changes which card is under it, and fires no
    // pointer event of its own.
    window.addEventListener("scroll", gone, true);

    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerleave", gone);
      window.removeEventListener("scroll", gone, true);
      for (const { layer, timer } of bands.values()) {
        window.clearTimeout(timer);
        layer.remove();
      }
      bands.clear();
    };
  }, []);
}
