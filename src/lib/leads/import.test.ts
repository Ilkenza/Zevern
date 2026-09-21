import { describe, expect, it } from "vitest";
import { importedAmount, parseLeadsImport } from "./parse-import";
import { computeImportPlan } from "./diff-import";
import type { Lead } from "@/lib/types";

describe("importedAmount", () => {
  it("reads a thousands dot the way it is written in Serbia", () => {
    expect(importedAmount("1.200")).toBe(1200);
    expect(importedAmount("12.500")).toBe(12500);
    expect(importedAmount("1.250.000")).toBe(1250000);
  });

  it("reads a thousands comma the way it is written in English", () => {
    expect(importedAmount("1,200")).toBe(1200);
    expect(importedAmount("1,250,000")).toBe(1250000);
  });

  it("keeps real decimals", () => {
    expect(importedAmount("12.50")).toBe(12.5);
    expect(importedAmount("1,5")).toBe(1.5);
    expect(importedAmount("450")).toBe(450);
  });

  it("takes the last mark as the decimal when both appear", () => {
    expect(importedAmount("1.200,50")).toBe(1200.5);
    expect(importedAmount("1,200.50")).toBe(1200.5);
  });

  it("ignores currency signs and spaces", () => {
    expect(importedAmount("€1.500")).toBe(1500);
    expect(importedAmount("1 500 RSD")).toBe(1500);
  });

  it("is not a number when there is no number", () => {
    expect(importedAmount("")).toBeNaN();
    expect(importedAmount("n/a")).toBeNaN();
  });
});

const lead = (over: Partial<Lead>): Lead =>
  ({
    id: "l-1",
    name: "Pekara Gaby",
    company: null,
    contact: "@pekaragaby",
    channel: "instagram",
    service: "new_site",
    status: "negotiating",
    value: 400,
    notes: null,
    next_followup: null,
    ...over,
  }) as Lead;

describe("importing over leads that already exist", () => {
  it("leaves a status alone when the sheet has no status column", () => {
    const { rows } = parseLeadsImport("name\tcontact\nPekara Gaby\t@pekaragaby");
    expect(rows[0].status).toBeNull();

    const plan = computeImportPlan(rows, [lead({})]);
    // Before: "status: Negotiating → New", offered for every lead in the sheet.
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("leaves it alone when the cell holds a word that is not a status", () => {
    const { rows } = parseLeadsImport("name,contact,status\nPekara Gaby,@pekaragaby,wonn");
    expect(computeImportPlan(rows, [lead({})]).updates).toEqual([]);
  });

  it("still changes it when the sheet names a real status", () => {
    const { rows } = parseLeadsImport("name,contact,status\nPekara Gaby,@pekaragaby,won");
    const plan = computeImportPlan(rows, [lead({})]);
    expect(plan.updates[0].payload.status).toBe("won");
  });

  it("starts a brand-new lead as New when the sheet does not say", () => {
    const { rows } = parseLeadsImport("name,contact\nDream Effects,@dreameffects");
    const plan = computeImportPlan(rows, []);
    expect(plan.newRows[0].status).toBe("new");
  });

  it("reads a value typed with a thousands dot", () => {
    const { rows } = parseLeadsImport("name\tvalue\nDunavantura\t1.200");
    expect(rows[0].value).toBe(1200);
  });
});

describe("the import help text", () => {
  it("names every status the parser accepts, by the word it accepts", async () => {
    const { readFileSync } = await import("node:fs");
    const { LEAD_STATUSES } = await import("@/lib/status");
    const form = readFileSync("src/components/leads/ImportForm.tsx", "utf8");
    const line = form.slice(form.indexOf(">status</span>"), form.indexOf(">value</span>"));
    for (const status of LEAD_STATUSES) expect(line).toContain(status);
    // The labels on screen are not the words a sheet has to use.
    expect(line).not.toContain("awaiting_their_site");
    expect(line).not.toContain("maybe_later");
  });
});
