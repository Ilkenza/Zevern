import { NextResponse } from "next/server";
import { collectExport, toCsv, exportStem, EXPORT_TABLES } from "@/lib/export/collect";
import { todayISO } from "@/lib/format";

/**
 * Your data, on your disk.
 *
 * Two shapes, because they answer two different needs. JSON is the complete copy —
 * every table, every column, nothing reshaped — which is what you want if you are
 * leaving, or keeping a backup, or moving somewhere else. CSV is one table at a time,
 * because the actual reason people export invoices is to open them in a spreadsheet,
 * and a spreadsheet cannot open a nested JSON document.
 *
 * There is no token and no id in the URL: the export is whatever the signed-in session
 * owns, which is the only reading of "my data" that cannot be pointed at someone else.
 */

const TABLE_SET = new Set<string>(EXPORT_TABLES);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const table = url.searchParams.get("table");

  if (format === "csv" && (!table || !TABLE_SET.has(table))) {
    return NextResponse.json(
      { error: "A CSV export needs one of the known tables." },
      { status: 400 },
    );
  }

  const result = await collectExport();
  if (!result.ok) {
    const status = result.error === "Not signed in." ? 401 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  const today = todayISO();
  const stem = exportStem(today);

  if (format === "csv") {
    const rows = result.data[table as string] ?? [];
    return new NextResponse(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${stem}-${table}.csv"`,
        // A copy of your own data has no business in a shared cache.
        "cache-control": "no-store, private",
      },
    });
  }

  const body = JSON.stringify(
    {
      app: "Zevern",
      exported_at: new Date().toISOString(),
      // What each table held at the moment of export, so a truncated or corrupted
      // download can be spotted without reading the whole file.
      counts: result.counts,
      data: result.data,
    },
    null,
    2,
  );

  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${stem}.json"`,
      "cache-control": "no-store, private",
    },
  });
}
