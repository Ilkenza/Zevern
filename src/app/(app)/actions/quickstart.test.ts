import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  The price list the setup run writes has to land where the catalog reads it.

  The first version wrote the old single `price` column, which nothing reads any more,
  so every figure typed into the run showed as "—" in the catalog and went into a quote
  at 0. These hold the mapping in place: one column per currency, the rest left empty.

  The figures arrive plain ("60000"), because the row uses `MoneyField`, which shows
  60.000 and hands back 60000 — the same contract every other money form here keeps.
*/

const inserted: unknown[] = [];
let currency = "RSD";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } } }) },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({ data: { default_currency: currency }, error: null });
      q.insert = async (rows: unknown) => {
        if (table === "service_items") inserted.push(...(rows as unknown[]));
        return { error: null };
      };
      return q;
    },
  }),
}));

const { saveServices } = await import("./quickstart");

function form(services: { label: string; price: string }[]) {
  const f = new FormData();
  f.set("services", JSON.stringify(services));
  return f;
}

describe("saveServices", () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it("puts a dinar price in the dinar column and nowhere else", async () => {
    currency = "RSD";
    await saveServices(undefined, form([{ label: "Landing page", price: "60000" }]));
    expect(inserted).toEqual([
      { user_id: "u-1", label: "Landing page", price_rsd: 60000, price_eur: null, price_usd: null },
    ]);
  });

  it("follows the currency the paperwork question set", async () => {
    currency = "EUR";
    await saveServices(undefined, form([{ label: "Redesign", price: "450" }]));
    expect(inserted).toEqual([
      { user_id: "u-1", label: "Redesign", price_rsd: null, price_eur: 450, price_usd: null },
    ]);
  });

  it("keeps a line with no price, as no price rather than free", async () => {
    currency = "USD";
    await saveServices(undefined, form([{ label: "Hourly fixes", price: "" }]));
    expect(inserted).toEqual([
      { user_id: "u-1", label: "Hourly fixes", price_rsd: null, price_eur: null, price_usd: null },
    ]);
  });

  it("never writes the old single price column", async () => {
    currency = "RSD";
    await saveServices(undefined, form([{ label: "SEO audit", price: "15000" }]));
    expect(inserted[0]).not.toHaveProperty("price");
    expect(inserted[0]).not.toHaveProperty("currency");
  });
});
