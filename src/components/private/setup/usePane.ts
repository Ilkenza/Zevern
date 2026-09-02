"use client";

import { useEffect, useSyncExternalStore } from "react";

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

  /*
    Put the address back when something takes it away.

    This is what actually happens on a delete: the action calls `revalidatePath`, Next
    applies it by updating the router's URL — and the router's URL has no fragment in it,
    so `#setup-expenses` is dropped on the way through. The rail then had nothing to read
    and fell to the first pane, which is Accounts.

    Keeping the pane in memory (below) fixes the screen; this fixes the address, so a
    reload or a shared link still lands where you were. `replaceState` on purpose: no
    history entry for something nobody navigated to, and no `hashchange`, so this cannot
    feed itself.
  */
  useEffect(() => {
    if (hash || !ids.includes(last)) return;
    try {
      window.history.replaceState(null, "", `#${last}`);
    } catch {
      /* A browser that refuses is no worse off than before: the pane below still holds. */
    }
  }, [hash, ids]);

  if (ids.includes(hash)) return hash;
  /*
    An empty address is not a request for the first pane.

    Deleting two categories put the rail back on Accounts, which is what happens whenever
    the hash is momentarily gone: this fell straight through to `ids[0]`. The last pane
    that was actually asked for is a better answer than the first one in the list — it is
    the only one anybody chose — so a blank reading keeps you where you were, and only a
    real address for a real pane moves you.
  */
  if (!hash && ids.includes(last)) return last;
  return ids[0] ?? "";
}

/**
 * The last pane anybody asked for, remembered across a re-render that loses the address.
 *
 * Module scope on purpose: it must outlive the component, and on the server it is per
 * request, so nothing leaks between people.
 */
let last = "";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function read() {
  const hash = window.location.hash.slice(1);
  if (hash) last = hash;
  return hash;
}

/* No address to read on the server, so the first pane is rendered and the hash — if there
   is one — takes over on hydration. */
function readOnServer() {
  return "";
}
