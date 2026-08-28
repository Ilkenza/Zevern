"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * A switch for trying button treatments on the real screens — not part of the product.
 *
 * Picking a button style off a bench page is guesswork: a treatment that looks right in a
 * row of samples can fall apart beside the gold `New` in the topbar, or on a card already
 * carrying an accent rail. The only honest test is the real screen. This writes `data-btn`
 * on `<html>`, the stylesheet maps every real button to whichever treatment is named, and
 * the choice survives navigation because it lives in `localStorage`.
 *
 * `useSyncExternalStore` rather than an effect: this decides what is rendered, so it is
 * read during render instead of corrected after paint.
 *
 * Delete `src/components/dev` and the `[data-btn]` block in `globals.css` once decided.
 */
const KEY = "zv-btn-theme";

const THEMES = [
  ["default", "Current"],
  ["plate", "Gold plate"],
  ["outline", "Gold outline"],
  ["bevel", "Bevelled ink"],
  ["rule", "Drawn rule"],
  ["edge", "Leading edge"],
  ["inset", "Inset well"],
  ["sweep", "Single sweep"],
] as const;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("zv-btn-theme", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("zv-btn-theme", onChange);
  };
}

export function ButtonTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY) ?? "default",
    () => "default",
  );

  // Writing to the document is a side effect, so it belongs in one — the lint rule that
  // caught this is right: mutating the DOM during render is what makes a render impure.
  useEffect(() => {
    document.documentElement.dataset.btn = theme;
  }, [theme]);

  return (
    <div className="zv-btn-theme">
      <span>Buttons</span>
      <select
        value={theme}
        onChange={(e) => {
          localStorage.setItem(KEY, e.target.value);
          window.dispatchEvent(new Event("zv-btn-theme"));
        }}
        aria-label="Button treatment"
      >
        {THEMES.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
