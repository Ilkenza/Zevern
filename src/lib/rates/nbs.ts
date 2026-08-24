/**
 * The National Bank of Serbia publishes the middle rate through a SOAP service that
 * needs a licence key, so this reads the same figures from kurs.resenje.org — a public,
 * key-less mirror that pulls from the NBS web services. If it ever goes away, only this
 * file has to change: everything else works off the numbers stored on the profile.
 */

const ENDPOINT = "https://kurs.resenje.org/api/v1/currencies";
const TIMEOUT_MS = 8000;

export type FetchedRate = {
  code: "EUR" | "USD";
  /** Dinars for one unit of the currency — the middle rate, parity already divided out. */
  middle: number;
  /** The date the NBS rate list is from, not the date it was fetched. */
  date: string;
};

export async function fetchNbsRate(code: "EUR" | "USD"): Promise<FetchedRate> {
  const res = await fetch(`${ENDPOINT}/${code.toLowerCase()}/rates/today`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`${code}: exchange rate service answered ${res.status}`);

  const body: unknown = await res.json();
  const row = body as { exchange_middle?: unknown; parity?: unknown; date?: unknown };

  const middle = Number(row.exchange_middle);
  // Some currencies are quoted per 100 units; EUR and USD are per 1, but dividing
  // by the parity keeps this correct if another currency is ever added.
  const parity = Number(row.parity) > 0 ? Number(row.parity) : 1;

  if (!Number.isFinite(middle) || middle <= 0) {
    throw new Error(`${code}: no middle rate in the response`);
  }

  return { code, middle: middle / parity, date: String(row.date ?? "") };
}

/** Both rates in one go; either one failing fails the pair, so a half-update never lands. */
export async function fetchNbsRates(): Promise<{ eur: FetchedRate; usd: FetchedRate }> {
  const [eur, usd] = await Promise.all([fetchNbsRate("EUR"), fetchNbsRate("USD")]);
  return { eur, usd };
}
