"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage, deleteErrorMessage } from "@/lib/supabase/errors";

export type ServiceItemState = { error?: string } | undefined;

function parsePrice(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) || n < 0 ? NaN : n;
}

export async function saveServiceItem(
  _prev: ServiceItemState,
  formData: FormData,
): Promise<ServiceItemState> {
  const id = String(formData.get("id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const priceRsd = parsePrice(String(formData.get("price_rsd") ?? ""));
  const priceEur = parsePrice(String(formData.get("price_eur") ?? ""));
  const priceUsd = parsePrice(String(formData.get("price_usd") ?? ""));

  if (!label) return { error: "Label is required." };
  if ([priceRsd, priceEur, priceUsd].some((p) => Number.isNaN(p)))
    return { error: "Cene moraju biti pozitivni brojevi." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const payload = {
    label,
    category,
    price_rsd: priceRsd,
    price_eur: priceEur,
    price_usd: priceUsd,
  };

  if (id) {
    const { error } = await supabase
      .from("service_items")
      .update(payload)
      .eq("id", id)
      .eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error) };
  } else {
    const { error } = await supabase.from("service_items").insert(payload);
    if (error) return { error: saveErrorMessage(error) };
  }

  revalidatePath("/quotes/catalog");
  redirect("/quotes/catalog");
}

export async function deleteServiceItem(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("service_items")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: deleteErrorMessage(error, "this item") };
  revalidatePath("/quotes/catalog");
  redirect("/quotes/catalog");
}

// Base price (tier "Basic") per feature and currency. RSD for domestic, EUR/USD for international.
const STARTER = [
  { label: "Landing page (one-pager)", rsd: 30000, eur: 400, usd: 430 },
  { label: "Multi-page website (up to 5 pages)", rsd: 70000, eur: 900, usd: 980 },
  { label: "Extra page", rsd: 9000, eur: 120, usd: 130 },
  { label: "Contact form", rsd: 8000, eur: 100, usd: 110 },
  { label: "Booking (Calendly / Cal.com)", rsd: 12000, eur: 150, usd: 160 },
  { label: "Login / user accounts", rsd: 35000, eur: 350, usd: 380 },
  { label: "Stripe checkout / payments", rsd: 30000, eur: 300, usd: 330 },
  { label: "Blog / CMS", rsd: 25000, eur: 250, usd: 270 },
  { label: "Multi-language", rsd: 18000, eur: 200, usd: 220 },
  { label: "SEO setup", rsd: 15000, eur: 180, usd: 200 },
  { label: "Analytics setup", rsd: 6000, eur: 80, usd: 90 },
  { label: "Animations / micro-interactions", rsd: 16000, eur: 200, usd: 220 },
  { label: "Redesign (existing site)", rsd: 45000, eur: 500, usd: 550 },
  { label: "Maintenance (monthly)", rsd: 8000, eur: 100, usd: 110 },
];

// Tiers by client type (multiplier on the "Basic" base price).
const TIERS = [
  { name: "Basic", mult: 1 },
  { name: "Standard", mult: 1.6 },
  { name: "Premium", mult: 2.5 },
];

// Round: RSD to 500, EUR/USD to 10 — clean prices.
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

export async function addStarterFeatures() {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  // Clear previous seed batches (all versions) so re-running doesn't create duplicates.
  const { error: clearErr } = await supabase
    .from("service_items")
    .delete()
    .eq("user_id", uid)
    .in("category", ["Website", "Basic", "Standard", "Premium"]);
  if (clearErr) console.error("addStarterFeatures:", clearErr.message);
  // cSpell:ignore Local International
  const { error: localErr } = await supabase
    .from("service_items")
    .delete()
    .eq("user_id", uid)
    .like("category", "Local — %");
  if (localErr) console.error("addStarterFeatures:", localErr.message);
  const { error: intlErr } = await supabase
    .from("service_items")
    .delete()
    .eq("user_id", uid)
    .like("category", "International — %");
  if (intlErr) console.error("addStarterFeatures:", intlErr.message);

  const rows = STARTER.flatMap((s) =>
    TIERS.map((t) => ({
      label: s.label,
      category: t.name,
      price_rsd: roundTo(s.rsd * t.mult, 500),
      price_eur: roundTo(s.eur * t.mult, 10),
      price_usd: roundTo(s.usd * t.mult, 10),
    })),
  );
  await supabase.from("service_items").insert(rows);
  revalidatePath("/quotes/catalog");
  redirect("/quotes/catalog");
}
