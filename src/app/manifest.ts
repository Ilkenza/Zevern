import type { MetadataRoute } from "next";

/**
 * What makes Zevern installable.
 *
 * Not a wrapper and not a store listing — the browser reads this and offers to put the
 * app on the home screen, where it opens without the address bar, in its own task, with
 * its own icon. For the one thing this app is used for on a phone — filing what you just
 * spent, standing in a shop — the difference between that and a bookmark is the
 * difference between using it and not.
 *
 * `display: standalone` rather than `fullscreen`: the clock and the battery stay, which
 * is what people expect from an app they use for ten seconds at a time.
 *
 * `start_url` is the private overview and not `/`, because the phone is where the money
 * side lives; the freelance side is a desk job.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zevern",
    short_name: "Zevern",
    description: "Money, work and what is coming — in one place.",
    start_url: "/private",
    id: "/private",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14161b",
    theme_color: "#14161b",
    categories: ["finance", "productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /*
        Android crops an icon to whatever shape the launcher uses, so the maskable one is
        drawn with the mark well inside the safe circle. Without it the launcher takes the
        square icon and puts a white plate behind it, which is how a dark app ends up with
        a white badge on the home screen.
      */
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      /* Long-press the icon: the two things worth doing without opening anything first. */
      { name: "New expense", short_name: "Expense", url: "/private/money?new=expense" },
      { name: "New income", short_name: "Income", url: "/private/money?new=income" },
    ],
  };
}
