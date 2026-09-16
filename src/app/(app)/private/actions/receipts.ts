"use server";

import { userId } from "@/lib/supabase/current-user";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { readReceipt, receiptToken, receiptUrl, type ScannedReceipt } from "@/lib/money/receipt";

/* ------------------------------------------------------------- reading a paper receipt */

/**
 * What the scanner sends back to the form.
 *
 * Nothing is written by this action. It reads a receipt and hands it over; the entry is
 * saved by the same `saveTransaction` as any other, after the person has looked at what
 * was filled in and changed whatever they wanted. That separation is the whole promise of
 * the feature — scanning fills the form, it does not make a decision.
 */
export type ScanState =
  | { ok: true; receipt: ScannedReceipt; seenOn: string | null }
  | { ok: false; error: string };

/** Long enough for the tax service on a bad day, short enough that nobody waits on it. */
const TIMEOUT_MS = 9_000;

/** A receipt's page is a couple of kilobytes. A quarter of a megabyte is already absurd. */
const MAX_BYTES = 256 * 1024;

/**
 * How many receipts one account may look up in a minute.
 *
 * Generous for a person holding a paper receipt and mean for anything holding a list.
 * This lives in the process's own memory, so on a platform that runs several copies of
 * the app the real ceiling is this number times however many are warm — which makes it a
 * brake rather than a gate, and it is written here as a brake. The gate is `receiptToken`:
 * even an unlimited caller can only ever make this server talk to one host.
 */
const PER_MINUTE = 20;
const seen = new Map<string, number[]>();

function tooFast(uid: string): boolean {
  const now = Date.now();
  const recent = (seen.get(uid) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  seen.set(uid, recent);
  // The map would otherwise grow one key per user for the life of the process.
  if (seen.size > 500) {
    for (const [key, times] of seen) {
      if (times.every((t) => now - t >= 60_000)) seen.delete(key);
    }
  }
  return recent.length > PER_MINUTE;
}

/**
 * Turn a scanned receipt address into a filled-in form.
 *
 * The address arrives from a camera, which means it arrives from whatever was printed on
 * whatever was held up to it — so it is treated as a stranger's string from the first
 * line. `receiptToken` reduces it to the one parameter that can mean anything, and the
 * request is built from that alone; nothing that was scanned is ever passed on.
 */
export async function scanReceipt(scanned: string): Promise<ScanState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { ok: false, error: "Nisi prijavljen." };

  if (tooFast(uid)) return { ok: false, error: "Previše skeniranja odjednom — sačekaj minut." };

  const token = receiptToken(scanned);
  if (!token) {
    return {
      ok: false,
      error: "Ovaj kod nije fiskalni račun. QR na računu vodi na suf.purs.gov.rs.",
    };
  }

  let payload: unknown;
  try {
    const response = await fetch(receiptUrl(token), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      /*
        A redirect is refused rather than followed. Following one would let the answer
        decide where this server's next request goes, which is exactly the door that
        rebuilding the address closed a few lines above.
      */
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      return { ok: false, error: "Poreska služba je preusmerila zahtev — račun nije pročitan." };
    }
    if (response.status === 404) return { ok: false, error: "Poreska služba ne zna za ovaj račun." };
    if (!response.ok) {
      return { ok: false, error: `Poreska služba nije odgovorila (${response.status}). Probaj ponovo.` };
    }

    const text = await capped(response, MAX_BYTES);
    if (text === null) return { ok: false, error: "Odgovor je prevelik da bi bio račun." };

    payload = JSON.parse(text);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      error: timedOut ? "Poreska služba ne odgovara. Probaj ponovo." : "Račun nije pročitan.",
    };
  }

  const read = readReceipt(payload);
  if (!read.ok) return read;

  return { ok: true, receipt: read.receipt, seenOn: await alreadyEntered(supabase, uid, read.receipt.number) };
}

/**
 * The day this receipt was already entered, if it was.
 *
 * A warning and not a refusal. One trip to the shop is often two entries here — the
 * week's food and the food that goes to work are different categories out of the same
 * bag — so the second one is a thing a person does on purpose, and being told "you
 * entered this on the 12th" is all the help that is wanted.
 */
async function alreadyEntered(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  uid: string,
  number: string,
): Promise<string | null> {
  if (!number) return null;

  const { data, error } = await supabase
    .from("money_transactions")
    .select("occurred_on")
    .eq("user_id", uid)
    .eq("receipt_no", number)
    .order("occurred_on", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A failed check is not a failed scan: the worst case is that a duplicate goes
  // unmentioned, and refusing the whole receipt over it would be the larger fault.
  if (error) {
    console.error("receipt duplicate check failed", error);
    return null;
  }
  return data?.occurred_on ?? null;
}

/**
 * The body, as text, or nothing when there is too much of it.
 *
 * `response.text()` will happily buffer whatever arrives; a byte count while reading is
 * what turns "a receipt is a couple of kilobytes" from a hope into a limit.
 */
async function capped(response: Response, max: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return null;

  const reader = response.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
