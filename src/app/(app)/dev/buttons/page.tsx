/**
 * A bench for button treatments — not part of the product.
 *
 * Every hover on this app has so far been designed one control at a time, inside the
 * screen that needed it, which is why there are four unrelated button languages and why
 * each new one reads as a patch. This page puts the candidates side by side on the real
 * surface, in the real font, with the real tokens, so a treatment can be chosen once and
 * then applied everywhere rather than argued about per screen.
 *
 * Delete the whole `dev` folder when a direction is picked.
 */

import { ButtonTheme } from "@/components/dev/ButtonTheme";

const VARIANTS: { id: string; name: string; note: string }[] = [
  { id: "plate", name: "Gold plate", note: "Fills with the app's primary gold. Loudest. What New and Quick add already wear." },
  { id: "outline", name: "Gold outline", note: "Stays dark; the hairline and the label come up to gold. Restraint." },
  { id: "bevel", name: "Bevelled ink", note: "A raised dark plate. Hover lifts the bevel and warms the label." },
  { id: "rule", name: "Drawn rule", note: "A gold rule draws in under the label. No surface change at all." },
  { id: "edge", name: "Leading edge", note: "A gold bar on the left grows to a band. Directional." },
  { id: "inset", name: "Inset well", note: "Recessed. Hover brightens the inside rather than the outside." },
  { id: "sweep", name: "Single sweep", note: "Dark, with one gold band crossing once per hover." },
  { id: "glass", name: "Frosted", note: "Translucent white over the card, gold label. Cool rather than warm." },
];

export default function ButtonBenchPage() {
  return (
    <div className="btn-bench mx-auto max-w-300">
      <ButtonTheme />

      <header>
        <h1>Button treatments</h1>
        <p>
          Hover each one. Every variant is shown three times — the size used inside a card,
          the size used in a page header, and disabled. Pick per level, not per screen:
          one for the committing action, one for the ordinary action, one for the quiet one.
        </p>
      </header>

      {VARIANTS.map((v) => (
        <section key={v.id} className="btn-bench-row">
          <div className="btn-bench-meta">
            <h2>{v.name}</h2>
            <p>{v.note}</p>
          </div>

          <div className="btn-bench-samples">
            <button type="button" className={`bb bb-${v.id}`}>
              Put aside
            </button>
            <button type="button" className={`bb bb-lg bb-${v.id}`}>
              New goal
            </button>
            <button type="button" className={`bb bb-${v.id}`} disabled>
              Put aside
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
