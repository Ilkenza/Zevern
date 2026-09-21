import { LEAD_STATUSES } from "@/lib/status";

const CHANNELS = [
  "email",
  "instagram",
  "facebook",
  "google_maps",
  "linkedin",
  "whatsapp",
  "phone",
  "other",
];

export type ImportRow = {
  name: string;
  company: string | null;
  contact: string | null;
  channel: string | null;
  service: string | null;
  /*
    Null when the sheet did not say — no status column, an empty cell, or a word that is
    not a status. It used to become "new", and on an update that read as an instruction:
    paste a sheet without a status column over four hundred leads and every one of them
    that had got anywhere was offered back to New. A new lead still starts as New; see
    `computeImportPlan`.
  */
  status: string | null;
  value: number;
  notes: string | null;
  next_followup: string | null;
};

function normalizeService(raw: string): string | null {
  const v = raw.toLowerCase().trim();
  if (!v) return null;
  if (["new_site", "new site", "novi sajt", "sajt", "bez sajta"].includes(v)) return "new_site";
  if (["redesign", "redizajn"].includes(v)) return "redesign";
  if (["fix", "site fix", "popravka", "popravka sajta"].includes(v)) return "fix";
  return null;
}

export type ParseResult = { rows: ImportRow[]; skipped: number; error?: string };

/** Split a single CSV/TSV line, honoring double-quoted fields. */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}


/**
 * A figure as a spreadsheet writes it, in whichever convention it was typed.
 *
 * "1.200" is twelve hundred to anybody who writes numbers the Serbian way, and the old
 * reading — every comma a decimal point, the first dot kept — turned it into 1.2. So the
 * separators are read by position rather than by symbol: where both appear, the last one
 * is the decimal mark; where one appears more than once, or once with exactly three
 * digits after it, it is a thousands mark. "12.50" and "1,5" are still decimals.
 */
export function importedAmount(raw: string): number {
  const s = raw.replace(/[^\d.,-]/g, "");
  if (!s) return Number.NaN;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    return Number(s.split(thousands).join("").replace(decimal, "."));
  }

  const mark = lastDot >= 0 ? "." : lastComma >= 0 ? "," : "";
  if (!mark) return Number(s);

  const parts = s.split(mark);
  const groupsOfThree = parts.length > 2 || parts[parts.length - 1].length === 3;
  return Number(groupsOfThree ? parts.join("") : parts.join("."));
}

export function parseLeadsImport(text: string): ParseResult {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return { rows: [], skipped: 0, error: "Nothing to import." };

  const lines = clean.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { rows: [], skipped: 0, error: "Add a header row and at least one lead below it." };
  }

  const delim = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitLine(lines[0], delim).map((h) => h.toLowerCase().replace(/\s+/g, "_"));

  const idx = (names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iName = idx(["name", "ime", "naziv", "lead"]);
  const iCompany = idx(["company", "firma", "kompanija"]);
  const iContact = idx(["contact", "kontakt", "email", "e-mail", "phone", "telefon"]);
  const iChannel = idx(["channel", "kanal"]);
  const iService = idx(["service", "usluga", "offer", "ponuda"]);
  const iStatus = idx(["status"]);
  const iValue = idx(["value", "vrednost", "iznos"]);
  const iFollow = idx(["next_followup", "followup", "follow_up", "rok"]);
  const iNotes = idx(["notes", "beleske", "napomena", "note"]);

  if (iName < 0) {
    return { rows: [], skipped: 0, error: "The header must include a 'name' column." };
  }

  const rows: ImportRow[] = [];
  let skipped = 0;

  for (let r = 1; r < lines.length; r++) {
    const cells = splitLine(lines[r], delim);
    const get = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");

    const name = get(iName);
    if (!name) {
      skipped++;
      continue;
    }

    const channelRaw = get(iChannel).toLowerCase();
    const channel = CHANNELS.includes(channelRaw) ? channelRaw : null;

    const statusRaw = get(iStatus).toLowerCase().replace(/\s+/g, "_");
    const status = (LEAD_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : null;

    const valNum = importedAmount(get(iValue));
    const value = Number.isFinite(valNum) && valNum > 0 ? valNum : 0;

    const follow = get(iFollow);
    const next_followup = /^\d{4}-\d{2}-\d{2}$/.test(follow) ? follow : null;

    rows.push({
      name,
      company: get(iCompany) || null,
      contact: get(iContact) || null,
      channel,
      service: normalizeService(get(iService)),
      status,
      value,
      notes: get(iNotes) || null,
      next_followup,
    });
  }

  return { rows, skipped };
}
