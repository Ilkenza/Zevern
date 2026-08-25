import { Download, FileJson, Table2 } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

/**
 * The way out.
 *
 * Two formats because they answer different questions. The JSON is the whole account
 * — every table, every column — and is what you take if you are backing up or leaving.
 * The CSVs are for the far more common reason people export anything: opening one
 * table in a spreadsheet.
 *
 * Plain links, not buttons with handlers: a download is a navigation, the browser
 * already knows how to do it, and a link keeps working with the middle button, with
 * "save link as", and with JavaScript switched off.
 */

/** The tables worth a one-click CSV. The rest are in the JSON. */
const SHEETS: { table: string; label: string }[] = [
  { table: "invoices", label: "Invoices" },
  { table: "clients", label: "Clients" },
  { table: "leads", label: "Leads" },
  { table: "projects", label: "Projects" },
  { table: "money_transactions", label: "Money entries" },
];

export function ExportPanel() {
  return (
    <div className="p-4">
      <p className="text-[13px] leading-relaxed text-muted">
        Everything on this account, on your own disk. The JSON is the complete copy —
        every table, nothing reshaped. The spreadsheets are one table each, for the
        times you only want to open the numbers somewhere else.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          href="/api/export?format=json"
          download
          className={buttonClasses("primary", "zv-press zv-sheen")}
        >
          <Download className="h-4 w-4" />
          Download everything
        </a>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-faint">
          <FileJson className="h-3.5 w-3.5" aria-hidden />
          one JSON file
        </span>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
          <Table2 className="h-3.5 w-3.5" aria-hidden />
          Spreadsheets
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SHEETS.map((s) => (
            <a
              key={s.table}
              href={`/api/export?format=csv&table=${s.table}`}
              download
              className="zv-press rounded-pill border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:border-gold/40 hover:text-ink"
            >
              {s.label}
            </a>
          ))}
        </div>
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
        A spreadsheet opens with semicolons and a byte-order mark so Excel on a Serbian
        locale reads the columns rather than dropping the lot into column A. If one
        table cannot be read, nothing downloads — half a copy handed over as though it
        were all of it is the one outcome worth failing for.
      </p>
    </div>
  );
}
