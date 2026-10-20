import type { TrainingFile, TrainingRecord } from "../types";
import { KM_PER_MILE, parseDuration, parseNumber } from "../units";
import { type DistanceUnit, detectMiles } from "./laps";
import { type RawTable, findCol } from "./table";

/** Parse a Garmin Connect "Activities" export (one row per activity). */
export function parseTraining(name: string, t: RawTable, unit: DistanceUnit = "auto"): TrainingFile {
  const h = t.headers;
  const c = {
    type: findCol(h, ["activity type", "type", "sport"]),
    date: findCol(h, ["date", "activity date", "start time", "start", "date time", "start date local", "start date"]),
    title: findCol(h, ["title", "name", "activity name"]),
    distance: findCol(h, ["distance", "distance km", "distance mi"]),
    time: findCol(h, ["time", "duration", "elapsed time"], ["moving", "best", "contact"]),
    moving: findCol(h, ["moving time"]),
    pace: findCol(h, ["avg pace", "pace"]),
    avgHr: findCol(h, ["avg hr", "average heart rate", "avg heart rate", "average heartrate"]),
    maxHr: findCol(h, ["max hr", "max heart rate"]),
    cadence: findCol(h, ["avg run cadence", "avg cadence", "cadence"]),
    power: findCol(h, ["avg power", "average watts", "power"]),
    ascent: findCol(h, ["total ascent", "elev gain", "ascent"]),
    te: findCol(h, ["aerobic te", "training effect", "aerobic training effect"]),
  };
  const miles = detectMiles(h, c.distance, c.pace, unit);
  const warnings: string[] = [];
  if (c.date < 0) warnings.push("No date column found; weekly volume cannot be computed.");
  if (miles) warnings.push("Distances detected in miles and converted to kilometres.");

  const records: TrainingRecord[] = [];
  let skippedNonRun = 0;
  for (const r of t.rows) {
    const type = c.type >= 0 ? String(r[c.type] ?? "").trim() : "Running";
    if (type && !/run|treadmill|track|trail/i.test(type)) {
      skippedNonRun++;
      continue;
    }
    const date = parseDate(r[c.date]);
    let distanceKm = parseNumber(r[c.distance]);
    // Garmin writes swim distances in metres with thousands separators; runs are km/mi.
    if (distanceKm !== undefined && miles) distanceKm *= KM_PER_MILE;
    const timeS = parseDuration(r[c.time]);
    if (!date || distanceKm === undefined || timeS === undefined) continue;
    records.push({
      date: date.slice(0, 10),
      dateTime: date,
      type: type || "Running",
      title: c.title >= 0 ? String(r[c.title] ?? "") : "",
      distanceKm,
      timeS,
      movingTimeS: c.moving >= 0 ? parseDuration(r[c.moving]) : undefined,
      avgHr: c.avgHr >= 0 ? parseNumber(r[c.avgHr]) : undefined,
      maxHr: c.maxHr >= 0 ? parseNumber(r[c.maxHr]) : undefined,
      cadence: c.cadence >= 0 ? parseNumber(r[c.cadence]) : undefined,
      power: c.power >= 0 ? parseNumber(r[c.power]) : undefined,
      ascentM: c.ascent >= 0 ? parseNumber(r[c.ascent]) : undefined,
      trainingEffect: c.te >= 0 ? parseNumber(r[c.te]) : undefined,
    });
  }
  if (skippedNonRun) warnings.push(`${skippedNonRun} non-running activities excluded from running volume.`);
  records.sort((a, b) => (a.dateTime ?? a.date).localeCompare(b.dateTime ?? b.date));
  return { name, records, warnings };
}

export function parseDate(v: unknown): string | undefined {
  if (v instanceof Date) return v.toISOString().slice(0, 19);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel serial date.
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 19);
  }
  if (typeof v !== "string" || !v.trim()) return undefined;
  const s = v.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4] ?? "00"}:${iso[5] ?? "00"}:${iso[6] ?? "00"}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const y = us[3].length === 2 ? "20" + us[3] : us[3];
    return `${y}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}T00:00:00`;
  }
  // e.g. Strava "Oct 18, 2026, 8:00:00 AM" — keep the calendar date as written.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
