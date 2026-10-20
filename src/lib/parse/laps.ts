import type { ActivityFile, Lap } from "../types";
import { KM_PER_MILE, parseDuration, parseNumber } from "../units";
import { type Cell, type RawTable, findCol, headerMentions } from "./table";

export type DistanceUnit = "auto" | "km" | "mi";

const NOTE_ALIASES = [
  "notes", "note", "comments", "comment", "observations", "observation", "athlete notes",
  "athlete comments", "mental notes", "mental", "thoughts", "feel", "feeling", "remarks", "commentary",
];

export const LAP_COLUMNS = {
  lap: ["laps", "lap", "split", "splits", "interval", "#"],
  time: ["time", "lap time", "split time", "duration", "elapsed time"],
  movingTime: ["moving time"],
  distance: ["distance", "dist", "distance km", "distance mi", "distance (km)", "distance (mi)"],
  pace: ["avg pace", "pace", "average pace"],
  avgHr: ["avg hr", "average heart rate", "avg heart rate", "heart rate", "hr"],
  maxHr: ["max hr", "max heart rate"],
  cadence: ["avg run cadence", "avg cadence", "cadence", "average cadence"],
  power: ["avg power", "power", "average power", "watts", "avg watts"],
  ascent: ["total ascent", "ascent", "elev gain", "elevation gain", "gain"],
  descent: ["total descent", "descent", "elev loss", "elevation loss", "loss"],
  gct: ["avg ground contact time", "ground contact time", "ground time", "gct"],
  stride: ["avg stride length", "stride length"],
  vo: ["avg vertical oscillation", "vertical oscillation"],
  formPower: ["form power", "avg form power"],
  lss: ["leg spring stiffness", "lss", "avg leg spring stiffness"],
  temp: ["avg temperature", "temperature", "temp"],
};

export function detectMiles(headers: string[], distCol: number, paceCol: number, unit: DistanceUnit): boolean {
  if (unit !== "auto") return unit === "mi";
  return headerMentions(headers, distCol, /\bmi(les?)?\b|\(mi\)/i) || headerMentions(headers, paceCol, /\/\s*mi/i);
}

const isSummaryRow = (first: Cell) =>
  typeof first === "string" && /^(summary|total|totals|overall|avg|average)$/i.test(first.trim());

/** Parse a lap/split table (Garmin Connect "Splits" export or similar). */
export function parseLapTable(name: string, t: RawTable, unit: DistanceUnit = "auto"): ActivityFile {
  const h = t.headers;
  const c = Object.fromEntries(
    Object.entries(LAP_COLUMNS).map(([k, aliases]) => [k, findCol(h, aliases, k === "time" ? ["cumulative", "moving", "best", "contact"] : k === "avgHr" ? ["max"] : [])]),
  ) as Record<keyof typeof LAP_COLUMNS, number>;
  // "Time" alias would otherwise match a ground contact column by prefix.
  if (c.time >= 0 && /contact|cumulative/i.test(h[c.time])) c.time = -1;
  const noteCol = findCol(h, NOTE_ALIASES);
  const miles = detectMiles(h, c.distance, c.pace, unit);
  const toKm = miles ? KM_PER_MILE : 1;
  const warnings: string[] = [];
  if (miles) warnings.push("Distances detected in miles and converted to kilometres.");
  const known = new Set(Object.values(c).concat(noteCol).filter((i) => i >= 0));

  const laps: Lap[] = [];
  const looseNotes: string[] = [];
  let deviceSummary: Partial<Lap> | undefined;

  for (const row of t.rows) {
    const get = (i: number) => (i >= 0 ? row[i] : undefined);
    const num = (i: number) => parseNumber(get(i));
    let timeS = parseDuration(get(c.time));
    let distanceKm = num(c.distance);
    const paceRaw = parseDuration(get(c.pace));
    if (distanceKm !== undefined) distanceKm *= toKm;
    const pace = paceRaw !== undefined ? paceRaw / toKm : undefined;
    if (distanceKm === undefined && timeS !== undefined && pace) distanceKm = timeS / pace;
    if (timeS === undefined && distanceKm !== undefined && pace) timeS = distanceKm * pace;

    const textCells = row
      .map((v, i) => ({ v, i }))
      .filter(({ v, i }) => !known.has(i) && typeof v === "string" && /[a-z]{3,}/i.test(v) && v.trim().split(/\s+/).length >= 3)
      .map(({ v }) => String(v).trim());
    const note = [get(noteCol), ...textCells].filter((v) => typeof v === "string" && v.trim()).map((v) => String(v).trim()).join(" · ") || undefined;

    const lap: Lap = {
      index: laps.length + 1,
      distanceKm: distanceKm ?? NaN,
      timeS: timeS ?? NaN,
      movingTimeS: parseDuration(get(c.movingTime)),
      avgHr: num(c.avgHr),
      maxHr: num(c.maxHr),
      cadence: num(c.cadence),
      power: num(c.power),
      ascentM: num(c.ascent) !== undefined ? num(c.ascent)! * (miles && headerMentions(h, c.ascent, /ft|feet/i) ? 0.3048 : 1) : undefined,
      descentM: num(c.descent) !== undefined ? num(c.descent)! * (miles && headerMentions(h, c.descent, /ft|feet/i) ? 0.3048 : 1) : undefined,
      gctMs: num(c.gct),
      strideM: num(c.stride),
      verticalOscCm: num(c.vo),
      formPower: num(c.formPower),
      lss: num(c.lss),
      temperatureC: num(c.temp),
      note,
    };

    if (isSummaryRow(row[0])) {
      deviceSummary = lap;
      if (note) looseNotes.push(note);
      continue;
    }
    if (!Number.isFinite(lap.distanceKm) || !Number.isFinite(lap.timeS) || lap.distanceKm <= 0 || lap.timeS <= 0) {
      // A row with only words is a free-text observation, not a lap.
      const words = row.filter((v) => typeof v === "string" && /[a-z]{3,}/i.test(v)).map((v) => String(v).trim());
      if (words.length) looseNotes.push(words.join(" "));
      continue;
    }
    laps.push(lap);
  }

  for (const r of t.preamble) {
    const words = r.filter((v) => typeof v === "string" && v.trim().split(/\s+/).length >= 4).map((v) => String(v).trim());
    if (words.length) looseNotes.push(words.join(" "));
  }

  if (!laps.length) warnings.push("No lap rows with both distance and time were found. Check the column headers.");
  if (c.avgHr < 0) warnings.push("No average heart-rate column found.");
  return { name, laps, deviceSummary, looseNotes, warnings };
}
