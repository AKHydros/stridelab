import Papa from "papaparse";
import readXlsxFile, { readSheetNames } from "read-excel-file";

export type Cell = string | number | boolean | Date | null;
export interface RawTable {
  headers: string[];
  rows: Cell[][];
  /** Rows above the detected header row (titles, notes). */
  preamble: Cell[][];
}

/**
 * Read every sheet of a workbook (or the single table of a CSV) and return the
 * one that best matches the expected columns.
 */
export async function readBestTable(file: File, score: (t: RawTable) => number): Promise<RawTable & { sheet?: string }> {
  const lower = file.name.toLowerCase();
  if (!(lower.endsWith(".xlsx") || lower.endsWith(".xlsm"))) return readTable(file);
  const names = await readSheetNames(file);
  let best: (RawTable & { sheet?: string }) | undefined;
  let bestScore = -1;
  for (const sheet of names) {
    const grid = (await readXlsxFile(file, { sheet })) as Cell[][];
    if (!grid.length) continue;
    const t = gridToTable(grid);
    const sc = score(t) + Math.min(t.rows.length, 50) / 1000;
    if (sc > bestScore) {
      bestScore = sc;
      best = { ...t, sheet };
    }
  }
  return best ?? { headers: [], rows: [], preamble: [] };
}

/** Read a CSV/TSV/XLSX file into a header + rows table. */
export async function readTable(file: File): Promise<RawTable> {
  const lower = file.name.toLowerCase();
  let grid: Cell[][];
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    grid = (await readXlsxFile(file)) as Cell[][];
  } else {
    grid = parseDelimited(await file.text());
  }
  return gridToTable(grid);
}

export function parseDelimited(text: string): Cell[][] {
  const res = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  return res.data as Cell[][];
}

/**
 * Exports often carry a title row before the real headers. Pick the first row
 * (within the first 10) whose cells are mostly non-numeric text and that is
 * followed by at least one row.
 */
export function gridToTable(grid: Cell[][]): RawTable {
  const isTexty = (c: Cell) => typeof c === "string" && c.trim() !== "" && !/^-?[\d.,:]+$/.test(c.trim());
  let headerIdx = 0;
  let best = -1;
  for (let i = 0; i < Math.min(10, grid.length - 1); i++) {
    const row = grid[i] ?? [];
    const texty = row.filter(isTexty).length;
    if (texty >= 2 && texty > best) {
      best = texty;
      headerIdx = i;
      if (texty >= Math.max(3, row.filter((c) => c !== null && c !== "").length * 0.7)) break;
    }
  }
  const headers = (grid[headerIdx] ?? []).map((h) => (h === null ? "" : String(h).trim()));
  const rows = grid
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => c !== null && String(c).trim() !== ""));
  return { headers, rows, preamble: grid.slice(0, headerIdx) };
}

const norm = (s: string) => s.toLowerCase().replace(/[®™]/g, "").replace(/[^a-z0-9%/]+/g, " ").trim();

/**
 * Find the column index for a field. `aliases` are matched exactly first,
 * then as whole-word prefixes, so "Avg HR" does not match "Max HR".
 */
export function findCol(headers: string[], aliases: string[], exclude: string[] = []): number {
  const hs = headers.map(norm);
  const ex = exclude.map(norm);
  const ok = (h: string) => !ex.some((e) => h.includes(e));
  for (const a of aliases.map(norm)) {
    const i = hs.findIndex((h) => h === a && ok(h));
    if (i >= 0) return i;
  }
  for (const a of aliases.map(norm)) {
    const i = hs.findIndex((h) => (h.startsWith(a + " ") || h.includes(" " + a + " ") || h.endsWith(" " + a)) && ok(h));
    if (i >= 0) return i;
  }
  return -1;
}

export function headerMentions(headers: string[], idx: number, needle: RegExp): boolean {
  return idx >= 0 && needle.test(headers[idx] ?? "");
}
