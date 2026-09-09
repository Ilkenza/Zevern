"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Which section of Setup is on screen: chosen here, written into the address.
 *
 * The page used to be one column of six stacked cards and the rail was a set of anchors
 * into it: fifty-eight expense categories meant the exchange rates were two thousand
 * pixels below the fold, and "where am I" was answered by watching what scrolled past.
 * Now the rail chooses and the pane shows one thing.
 *
 * The address still names the pane, so `/private/setup#setup-accounts` — written in four
 * other places in this app — opens the section it means, back and forward work, and a
 * reload lands where you were. What changed is which of the two is in charge.
 *
 * Reading the address on every render is what put the rail back on the section you came
 * from every time you pressed a button. The tabs are plain anchors, so the browser moves
 * the fragment and Next's router never learns of it; `revalidatePath` then makes the
 * router put *its* URL back — the one from the last real navigation, stale fragment and
 * all — and the pane followed it. Nothing about that is a navigation: nobody asked to go
 * anywhere, a row was saved.
 *
 * So the fragment is only believed when it changes for a reason:
 *
 *  - once when this screen opens, which is what makes a link land where it points;
 *  - on `hashchange`, which is a tab press or the back button and nothing else.
 *
 * A `history.replaceState` — Next's or ours — fires no `hashchange`, so the router can
 * rewrite the URL as often as it likes and the pane stays where it was put. The effect at
 * the bottom writes the pane back into the address afterwards, so the two agree again for
 * the next reload or shared link.
 */
export function usePane(ids: string[]): string {
  const [address] = useState(makeAddress);
  const asked = useSyncExternalStore(address.subscribe, address.read, readOnServer);

  /*
    Read the address once more as the move that opened this screen lands.

    The snapshot above is taken while this screen renders, and on a client-side move
    between pages that is too early: Next puts the new URL in place from an effect of its
    own, in the router — a component above this one — and React runs a child's effects
    before its parent's. Arriving from `/private/money` on `#setup-earning`, the seed
    would read the address being left behind.

    So the re-read is queued as a microtask rather than done in the effect body: effects
    of one commit are flushed together, and a microtask queued inside that flush runs
    after all of them, the router's included. Nothing else can slip into that gap — a
    server action needs a press and a round trip — so this window only ever catches the
    navigation it is there for.
  */
  useEffect(() => {
    address.settle();
    queueMicrotask(address.settle);
  }, [address]);

  const pane = ids.includes(asked) ? asked : (ids[0] ?? "");

  /*
    Put the pane back into the address whenever something has taken it out.

    Two things take it out, and both are the router rather than a person: applying a
    revalidation drops the fragment, or restores an older one. Neither moves the pane any
    more — this only keeps the address honest, so a reload or a copied link still opens
    what is on screen.

    No dependency list on purpose: the only way to notice the router has rewritten the URL
    is to look, and the render it causes is the moment to do it. `replaceState` rather
    than a navigation — nobody went anywhere, so nothing belongs in the history — and it
    fires no `hashchange`, so this cannot feed itself. Next patches `replaceState` to keep
    its own idea of the URL in step, which is what stops the next revalidation undoing
    this one.

    Only once somebody has actually named a pane, though. Arriving at a bare
    `/private/setup` and reading it is not a request for an address with a fragment in
    it, and writing one there would be this hook editing a URL nobody asked about.
  */
  useEffect(() => {
    if (!asked || !pane || typeof window === "undefined") return;
    if (window.location.hash.slice(1) === pane) return;
    try {
      window.history.replaceState(null, "", `#${pane}`);
    } catch {
      /* A browser that refuses is no worse off than before: the pane above still holds. */
    }
  });

  return pane;
}

type Address = {
  /** The fragment this screen is showing. Stable between `hashchange`s, on purpose. */
  read: () => string;
  /** Re-read the address once, after the move that opened this screen has landed. */
  settle: () => void;
  subscribe: (onChange: () => void) => () => void;
};

/**
 * One reading of the address per screen, refreshed only when a person changes it.
 *
 * Per mount rather than at module scope: the value has to be seeded again every time this
 * screen opens, or arriving from a link would show whichever pane was last read.
 */
function makeAddress(): Address {
  let seen: string | null = null;
  let tell: (() => void) | null = null;

  const now = () => (typeof window === "undefined" ? "" : window.location.hash.slice(1));

  const take = () => {
    const next = now();
    if (next === seen) return;
    seen = next;
    tell?.();
  };

  return {
    read: () => {
      if (seen === null) seen = now();
      return seen;
    },
    settle: () => {
      take();
    },
    subscribe: (onChange) => {
      tell = onChange;
      window.addEventListener("hashchange", take);
      return () => {
        tell = null;
        window.removeEventListener("hashchange", take);
      };
    },
  };
}

/* No address to read on the server, so the first pane is rendered and the fragment — if
   there is one — takes over as soon as this reaches a browser. */
function readOnServer() {
  return "";
}
