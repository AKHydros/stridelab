import type { RecoveryDay, RecoveryFile } from "../types";
import { parseNumber } from "../units";
import { type RawTable, findCol } from "./table";
import { parseDate } from "./training";

/**
 * Wearable recovery exports (Garmin HRV/Sleep, Oura, Whoop, Apple Health
 * summaries, or a hand-made CSV). Each column is optional; files from the same
 * source exported separately (e.g. Garmin HRV and Garmin Sleep) merge by date.
 */
export function parseRecovery(name: string, t: RawTable): RecoveryFile {
  const h = t.headers;
  const c = {
    date: findCol(h, ["date", "calendar date", "day", "summary date", "cycle start time", "sleep onset", "start"]),
    hrv: findCol(h, ["overnight hrv", "hrv", "hrv ms", "rmssd", "average hrv", "average_hrv", "heart rate variability ms", "heart rate variability", "last night avg", "hrv (ms)"], ["status", "baseline", "7d", "7 day"]),
    rhr: findCol(h, ["resting heart rate", "resting hr", "rhr", "resting heart rate bpm", "lowest heart rate", "lowest_heart_rate"]),
    sleep: findCol(h, ["sleep duration", "total sleep", "total sleep time", "asleep duration min", "total_sleep_duration", "sleep hours", "hours slept", "sleep h", "duration", "asleep"]),
    score: findCol(h, ["sleep score", "sleep performance %", "sleep performance", "score"]),
    ready: findCol(h, ["readiness", "readiness score", "recovery score %", "recovery score", "training readiness", "body battery"]),
  };
  const warnings: string[] = [];
  if (c.date < 0) warnings.push("No date column found.");
  if (c.hrv < 0 && c.rhr < 0 && c.sleep < 0 && c.score < 0) warnings.push("No HRV, resting HR or sleep columns recognised.");
  const sleepHeader = h[c.sleep] ?? "";
  const days: RecoveryDay[] = [];
  for (const r of t.rows) {
    const date = parseDate(r[c.date])?.slice(0, 10);
    if (!date) continue;
    const d: RecoveryDay = {
      date,
      hrv: c.hrv >= 0 ? positive(parseNumber(r[c.hrv])) : undefined,
      restingHr: c.rhr >= 0 ? positive(parseNumber(r[c.rhr])) : undefined,
      sleepHours: c.sleep >= 0 ? sleepHours(r[c.sleep], sleepHeader) : undefined,
      sleepScore: c.score >= 0 ? positive(parseNumber(r[c.score])) : undefined,
      readiness: c.ready >= 0 ? positive(parseNumber(r[c.ready])) : undefined,
    };
    if (d.hrv ?? d.restingHr ?? d.sleepHours ?? d.sleepScore ?? d.readiness) days.push(d);
  }
  return { name, days: mergeDays(days), warnings };
}

const positive = (v?: number) => (v !== undefined && v > 0 ? v : undefined);

/** Accepts "7h 32min", "7:32", minutes, seconds or hours. */
export function sleepHours(v: unknown, header = ""): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "string") {
    const hm = v.match(/(\d+)\s*h(?:ours?|rs?)?\s*(?:(\d+)\s*m)?/i);
    if (hm) return +hm[1] + (hm[2] ? +hm[2] / 60 : 0);
    const colon = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (colon) return +colon[1] + +colon[2] / 60;
  }
  const n = parseNumber(v);
  if (n === undefined || n <= 0) return undefined;
  if (/min/i.test(header) || (n > 24 && n <= 1440)) return n / 60;
  if (/sec|_duration/i.test(header) || n > 1440) return n / 3600;
  return n;
}

export function mergeDays(days: RecoveryDay[]): RecoveryDay[] {
  const by = new Map<string, RecoveryDay>();
  for (const d of days) {
    const prev = by.get(d.date) ?? { date: d.date };
    by.set(d.date, { ...prev, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) } as RecoveryDay);
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
}
