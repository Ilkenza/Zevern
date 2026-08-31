/**
 * The chrome every control on a list toolbar wears, and the shape of the choices it offers.
 *
 * Lifted verbatim from `upcoming/rule-filters`, which is where this shape was settled:
 * that toolbar was the one in the app people liked, so it is the one everything else now
 * copies rather than the other way round. It lives in its own file because two components
 * wear it — the bar and the order picker inside it — and a shared string that lives in one
 * of its own users is an import cycle waiting to be written.
 */
export const control =
  "rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-[12.5px] text-ink scheme-dark focus:border-gold focus:shadow-ring";

export type ListOption = { value: string; label: string };

/**
 * One order a list can be put in — and, where it has one, the name of its other end.
 *
 * `reverse` is what lets the control say out loud which way the list is running. Turn the
 * switch and every order in the menu is relabelled from the end it now starts at: `Newest`
 * becomes `Oldest`, `Largest` becomes `Smallest`. Leave it out and that order keeps its one
 * name, and only the arrow says the list is backwards — which works, and is worth avoiding
 * wherever the other end has a name a person would use.
 */
export type SortOption = ListOption & { reverse?: string };
