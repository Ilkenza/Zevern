"use client";

import { useSyncExternalStore } from "react";

/**
 * Which section of Setup is on screen, taken from the address.
 *
 * The page used to be one column of six stacked cards and the rail was a set of anchors
 * into it: fifty-eight expense categories meant the exchange rates were two thousand
 * pixels below the fold, and "where am I" was answered by watching what scrolled past.
 * Now the rail chooses and the pane shows one thing.
 *
 * The address is the state, not a `useState`, and that is what keeps every existing link
 * working: `/private/setup#setup-accounts` is written in four other places in this app —
 * the empty ledger, the net-note fix, the seed card — and each of them now opens the pane
 * it meant instead of scrolling to it. Back and forward work for free, and so does
 * reloading on the section you were reading.
 */
export function usePane(ids: string[]): string {
  const hash = useSyncExternalStore(subscribe, read, readOnServer);
  return ids.includes(hash) ? hash : (ids[0] ?? "");
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function read() {
  return window.location.hash.slice(1);
}

/* No address to read on the server, so the first pane is rendered and the hash — if there
   is one — takes over on hydration. */
function readOnServer() {
  return "";
}
