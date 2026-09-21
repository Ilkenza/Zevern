import { describe, expect, it } from "vitest";
import { bankFeesCategory, syncTransferFee } from "./fee";

/*
  A fake of just enough of the Supabase client to run the fee helpers for real.

  Every chain is recorded as it is built — table, operation, payload, filters — and the
  answer it resolves to is taken from a script, first match wins. The point is to watch
  what the helpers actually ask the database to do, since that is where the money is.
*/
type Call = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  filters: [string, string, unknown][];
  cols?: string;
};
type Answer = { data?: unknown; error?: { message: string; code?: string } | null };
type Rule = { when: (c: Call) => boolean; then: Answer };

function fakeClient(rules: Rule[]) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = (cols?: string) => {
      if (call.op === "select") call.cols = cols;
      return builder;
    };
    builder.insert = (payload: unknown) => ((call.op = "insert"), (call.payload = payload), builder);
    builder.update = (payload: unknown) => ((call.op = "update"), (call.payload = payload), builder);
    builder.delete = () => ((call.op = "delete"), builder);
    builder.eq = (col: string, v: unknown) => (call.filters.push(["eq", col, v]), builder);
    builder.in = (col: string, v: unknown) => (call.filters.push(["in", col, v]), builder);
    builder.order = chain;
    builder.limit = chain;
    builder.maybeSingle = chain;
    builder.then = (resolve: (a: Answer) => unknown) => {
      calls.push(call);
      const rule = rules.find((r) => r.when(call));
      return Promise.resolve(resolve({ data: null, error: null, ...(rule?.then ?? {}) }));
    };
    return builder;
  };
  return { client: { from } as never, calls };
}

const has = (c: Call, col: string, v: unknown) =>
  c.filters.some(([, k, val]) => k === col && val === v);

const MOVE = {
  transferId: "t-1",
  wanted: 250,
  accountId: "bank",
  currency: "RSD",
  rate: 1,
  occurredOn: "2026-09-10",
  occurredAt: "11:50:00",
  title: "Skidanje sa atm",
};

/* Bank fees already exists, and the transfer has no fee yet. */
const FRESH: Rule[] = [
  { when: (c) => c.table === "money_transactions" && c.op === "select" && has(c, "fee_for_id", "t-1"), then: { data: null } },
  { when: (c) => c.table === "money_categories" && c.op === "select" && has(c, "name", "Bank fees"), then: { data: { id: "cat-fees" } } },
];

describe("syncTransferFee", () => {
  it("writes the charge as an expense on the account the money left", async () => {
    const { client, calls } = fakeClient(FRESH);
    expect(await syncTransferFee(client, "u-1", MOVE)).toBeNull();

    const insert = calls.find((c) => c.table === "money_transactions" && c.op === "insert");
    expect(insert?.payload).toEqual({
      kind: "expense",
      title: "Skidanje sa atm — fee",
      amount: 250,
      currency: "RSD",
      rate: 1,
      account_id: "bank",
      category_id: "cat-fees",
      occurred_on: "2026-09-10",
      occurred_at: "11:50:00",
      fee_for_id: "t-1",
    });
  });

  it("looks for the existing fee on this profile only", async () => {
    const { client, calls } = fakeClient(FRESH);
    await syncTransferFee(client, "u-1", MOVE);
    const lookup = calls.find((c) => c.table === "money_transactions" && c.op === "select");
    expect(has(lookup!, "user_id", "u-1")).toBe(true);
  });

  it("updates the fee that is already there instead of adding a second one", async () => {
    const { client, calls } = fakeClient([
      { when: (c) => c.table === "money_transactions" && c.op === "select", then: { data: { id: "fee-1" } } },
      ...FRESH.slice(1),
    ]);
    expect(await syncTransferFee(client, "u-1", { ...MOVE, wanted: 300 })).toBeNull();

    expect(calls.some((c) => c.table === "money_transactions" && c.op === "insert")).toBe(false);
    const update = calls.find((c) => c.table === "money_transactions" && c.op === "update");
    expect((update?.payload as { amount: number }).amount).toBe(300);
    expect(has(update!, "id", "fee-1")).toBe(true);
    expect(has(update!, "user_id", "u-1")).toBe(true);
  });

  it("removes the fee when the charge is cleared", async () => {
    const { client, calls } = fakeClient([
      { when: (c) => c.table === "money_transactions" && c.op === "select", then: { data: { id: "fee-1" } } },
    ]);
    expect(await syncTransferFee(client, "u-1", { ...MOVE, wanted: 0 })).toBeNull();

    const del = calls.find((c) => c.op === "delete");
    expect(del && has(del, "id", "fee-1") && has(del, "user_id", "u-1")).toBe(true);
    expect(calls.some((c) => c.op === "insert" || c.op === "update")).toBe(false);
  });

  it("does nothing at all for a move with no charge and no fee on file", async () => {
    const { client, calls } = fakeClient([
      { when: (c) => c.table === "money_transactions" && c.op === "select", then: { data: null } },
    ]);
    expect(await syncTransferFee(client, "u-1", { ...MOVE, wanted: 0 })).toBeNull();
    expect(calls.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("names the fee plainly when the move has no title", async () => {
    const { client, calls } = fakeClient(FRESH);
    await syncTransferFee(client, "u-1", { ...MOVE, title: null });
    const insert = calls.find((c) => c.op === "insert" && c.table === "money_transactions");
    expect((insert?.payload as { title: string }).title).toBe("Transfer fee");
  });

  it("keeps the title inside the column's 80 characters", async () => {
    const { client, calls } = fakeClient(FRESH);
    await syncTransferFee(client, "u-1", { ...MOVE, title: "x".repeat(80) });
    const insert = calls.find((c) => c.op === "insert" && c.table === "money_transactions");
    expect((insert?.payload as { title: string }).title.length).toBeLessThanOrEqual(80);
  });

  it("reports a failed read instead of guessing there is no fee", async () => {
    const { client, calls } = fakeClient([
      { when: (c) => c.table === "money_transactions" && c.op === "select", then: { error: { message: "boom" } } },
    ]);
    expect(await syncTransferFee(client, "u-1", MOVE)).toMatch(/fee/i);
    // Guessing "none" would have inserted a second fee beside one that exists.
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("reports a failed write instead of saying the fee is saved", async () => {
    const { client } = fakeClient([
      ...FRESH,
      { when: (c) => c.table === "money_transactions" && c.op === "insert", then: { error: { message: "nope" } } },
    ]);
    expect(await syncTransferFee(client, "u-1", MOVE)).not.toBeNull();
  });
});

describe("bankFeesCategory", () => {
  it("uses the category that is already there", async () => {
    const { client, calls } = fakeClient(FRESH);
    expect(await bankFeesCategory(client, "u-1")).toBe("cat-fees");
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("makes it, last in the list, when the account has none", async () => {
    const { client, calls } = fakeClient([
      { when: (c) => c.table === "money_categories" && c.op === "select" && c.cols === "id", then: { data: null } },
      { when: (c) => c.table === "money_categories" && c.op === "select" && c.cols === "sort", then: { data: { sort: 17 } } },
      { when: (c) => c.table === "money_categories" && c.op === "insert", then: { data: { id: "cat-new" } } },
    ]);
    expect(await bankFeesCategory(client, "u-1")).toBe("cat-new");

    const insert = calls.find((c) => c.table === "money_categories" && c.op === "insert");
    expect(insert?.payload).toMatchObject({ user_id: "u-1", name: "Bank fees", kind: "expense", sort: 18 });
  });

  it("ignores an archived one rather than filing into a category nobody can see", async () => {
    const { client, calls } = fakeClient(FRESH);
    await bankFeesCategory(client, "u-1");
    const lookup = calls.find((c) => c.table === "money_categories" && c.op === "select");
    expect(has(lookup!, "archived", false)).toBe(true);
  });
});
