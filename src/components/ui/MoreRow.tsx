import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * The bottom of a list that does not end.
 *
 * Every list on the overview is a window onto a screen that holds more, and each one
 * used to stop silently — five budgets out of forty, four goals out of forty, six
 * entries out of six hundred, with nothing on the page admitting it. Silence is the
 * worst of the options here: a panel showing five of forty budgets and looking exactly
 * like a panel showing all five is a screen quietly lying about the size of your life.
 *
 * The count is the honest version, and it is also the door — so the thing that tells
 * you there is more is the same thing that takes you to it, rather than a note pointing
 * at a link somewhere else.
 */
export function MoreRow({
  count,
  href,
  noun,
  label,
}: {
  /** How many were cut. The row draws nothing at zero, so callers need no guard. */
  count: number;
  /**
   * Where the rest lives. Left off when there is nowhere to go — the two panels that
   * clear themselves as you work through them have no "all of them" screen, and the
   * next few arrive on their own the moment these are done. A count with no door is
   * still worth saying; a door onto nothing is not.
   */
  href?: string;
  /** Singular; pluralised by adding an "s" unless `label` is given instead. */
  noun?: string;
  /** The whole phrase, for the cases where "s" is the wrong plural or the wrong word. */
  label?: string;
}) {
  if (count <= 0) return null;
  const text = label ?? `${count} more ${count === 1 ? noun : `${noun}s`}`;
  if (!href) return <p className="zv-more is-static">{text}</p>;
  return (
    <Link href={href} className="zv-more">
      <span>{text}</span>
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}
