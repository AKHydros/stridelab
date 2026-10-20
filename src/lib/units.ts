export const KM_PER_MILE = 1.609344;

/** Parse "1:23:45", "23:45", "45.2", "0:05:12.3" or a number of seconds. */
export function parseDuration(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return undefined;
    // Spreadsheet durations stored as a fraction of a day (5:00 → 0.00347).
    return v > 0 && v < 1 ? v * 86400 : v;
  }
  if (v instanceof Date) {
    // Spreadsheet time cells arrive as dates anchored at 1899-12-30/31.
    return v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds() + v.getUTCMilliseconds() / 1000;
  }
  const s = String(v).trim();
  if (!s || s === "--") return undefined;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const parts = s.split(":").map((p) => p.trim());
  if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return undefined;
  const nums = parts.map(parseFloat);
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return undefined;
}

/** Parse a numeric cell, tolerating thousands separators and units ("1,234", "152 bpm"). */
export function parseNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s = String(v).trim().replace(/,(?=\d{3}\b)/g, "");
  if (!s || s === "--") return undefined;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : undefined;
}

export function fmtDuration(totalS: number | undefined): string {
  if (totalS === undefined || !Number.isFinite(totalS)) return "Not available";
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Pace in s/km → "m:ss". */
export function fmtPace(paceS: number | undefined, suffix = "/km"): string {
  if (paceS === undefined || !Number.isFinite(paceS) || paceS <= 0) return "Not available";
  let m = Math.floor(paceS / 60);
  let s = Math.round(paceS - m * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, "0")}${suffix}`;
}

export function fmtNum(v: number | undefined, digits = 0, unit = ""): string {
  if (v === undefined || !Number.isFinite(v)) return "Not available";
  return `${v.toFixed(digits)}${unit ? " " + unit : ""}`;
}

export function fmtSigned(v: number | undefined, digits = 1, unit = ""): string {
  if (v === undefined || !Number.isFinite(v)) return "Not available";
  // Values that round to zero read "±0", never "−0".
  if (Math.abs(v) < 0.5 * 10 ** -digits) return `±${(0).toFixed(digits)}${unit}`;
  const sign = v > 0 ? "+" : "−";
  return `${sign}${Math.abs(v).toFixed(digits)}${unit}`;
}

export function paceFromSpeed(mps: number): number {
  return 1000 / mps;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
