import { gunzipSync, unzipSync } from "fflate";
import type { TrainingFile, TrainingRecord } from "../types";
import { addDays } from "../units";
import { parseFit } from "./fit";
import { parseRouteXml } from "./gpx";
import type { DistanceUnit } from "./laps";
import { type RawTable, findCol, gridToTable, parseDelimited, readBestTable } from "./table";
import { parseTraining } from "./training";

export const HISTORY_DAYS = 182;

const isRun = (type: string) => /run|treadmill|track|trail/i.test(type);
const trainingScore = (t: RawTable) => [["date", "activity date"], ["distance"], ["time", "elapsed time"], ["activity type", "type"], ["title", "activity name"]].filter((a) => findCol(t.headers, a) >= 0).length;

/** A GPX/TCX activity summarised into one history record. */
function recordFromRoute(name: string, xml: string): TrainingRecord | undefined {
  const r = parseRouteXml(name, xml);
  const pts = r.points;
  if (pts.length < 2 || !pts[0].time || !pts[pts.length - 1].time) return undefined;
  const t0 = Date.parse(pts[0].time);
  const t1 = Date.parse(pts[pts.length - 1].time!);
  const hrs = pts.map((p) => p.hr).filter((h): h is number => h !== undefined);
  const d = new Date(t0);
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    dateTime: pts[0].time.slice(0, 19),
    type: "running",
    title: name.replace(/\.(gpx|tcx)$/i, ""),
    distanceKm: pts[pts.length - 1].distKm,
    timeS: (t1 - t0) / 1000,
    avgHr: hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : undefined,
  };
}

/**
 * Read any mix of history files for one source: activity CSV/XLSX exports
 * (Garmin Connect "Activities", Strava activities.csv), individual FIT/GPX/TCX
 * activities (optionally .gz), or a whole bulk-export ZIP.
 */
export async function readHistoryFiles(files: File[], source: string, unit: DistanceUnit = "auto"): Promise<TrainingFile> {
  const records: TrainingRecord[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  const fromBytes = (name: string, bytes: Uint8Array) => {
    const lower = name.toLowerCase();
    try {
      if (lower.endsWith(".gz")) return fromBytes(name.slice(0, -3), gunzipSync(bytes));
      if (lower.endsWith(".fit")) {
        const f = parseFit(name, bytes);
        if (f.summary && isRun(f.sport ?? "running")) records.push(f.summary);
        else skipped++;
        return;
      }
      if (lower.endsWith(".gpx") || lower.endsWith(".tcx")) {
        const r = recordFromRoute(name, new TextDecoder().decode(bytes));
        if (r) records.push(r);
        return;
      }
      if (lower.endsWith(".csv")) {
        const t = parseTraining(name, gridToTable(parseDelimited(new TextDecoder().decode(bytes))), unit);
        records.push(...t.records);
        warnings.push(...t.warnings);
      }
    } catch (e) {
      warnings.push(`${name}: ${(e as Error).message}`);
    }
  };

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const names = Object.keys(entries);
      const csv = names.find((n) => /(^|\/)activities\.csv$/i.test(n));
      if (csv) {
        // Strava bulk export: activities.csv already summarises every activity.
        fromBytes(csv, entries[csv]);
      } else {
        const acts = names.filter((n) => /\.(fit|gpx|tcx)(\.gz)?$/i.test(n));
        if (acts.length > 1500) warnings.push(`${acts.length} activity files in the ZIP; only the newest 1,500 by name are read.`);
        acts.sort().slice(-1500).forEach((n) => fromBytes(n, entries[n]));
        if (!acts.length) warnings.push(`${file.name}: no activities.csv or FIT/GPX files found.`);
      }
    } else if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
      const t = parseTraining(file.name, await readBestTable(file, trainingScore), unit);
      records.push(...t.records);
      warnings.push(...t.warnings);
    } else {
      fromBytes(file.name, new Uint8Array(await file.arrayBuffer()));
    }
  }
  if (skipped) warnings.push(`${skipped} non-running FIT activities excluded.`);
  const unique = dedupe(records.map((r) => ({ ...r, source })), source).records;
  unique.sort((a, b) => (a.dateTime ?? a.date).localeCompare(b.dateTime ?? b.date));
  return { name: files.map((f) => f.name).join(", "), records: unique, warnings: Array.from(new Set(warnings)) };
}

const same = (a: TrainingRecord, b: TrainingRecord) => a.date === b.date && Math.abs(a.distanceKm - b.distanceKm) <= Math.max(0.2, b.distanceKm * 0.03);
const richness = (r: TrainingRecord) => [r.avgHr, r.maxHr, r.cadence, r.power, r.ascentM, r.movingTimeS, r.trainingEffect].filter((x) => x !== undefined).length;

/** Collapse records describing the same run (same day, distance within 3 %), keeping the richer one. */
export function dedupe(records: TrainingRecord[], label?: string): { records: TrainingRecord[]; merged: number } {
  const out: TrainingRecord[] = [];
  let merged = 0;
  for (const r of records) {
    const i = out.findIndex((o) => same(o, r));
    if (i < 0) {
      out.push(r);
      continue;
    }
    merged++;
    const keep = richness(r) > richness(out[i]) ? r : out[i];
    const other = keep === r ? out[i] : r;
    const sources = new Set([out[i].source, r.source].filter(Boolean));
    out[i] = { ...other, ...Object.fromEntries(Object.entries(keep).filter(([, v]) => v !== undefined)), source: label && sources.size <= 1 ? label : [...sources].join(" + ") } as TrainingRecord;
  }
  return { records: out, merged };
}

export interface MergedHistory {
  records: TrainingRecord[];
  notes: string[];
  windowStart: string;
}

/**
 * Combine Garmin Connect and Strava histories into one running log limited to
 * the 6 months before the event (plus anything after it, up to race day).
 */
export function mergeHistory(eventDate: string, ...files: (TrainingFile | undefined)[]): MergedHistory {
  const notes: string[] = [];
  const all = files.flatMap((f) => f?.records ?? []).filter((r) => isRun(r.type));
  const { records, merged } = dedupe(all);
  if (merged && files.filter(Boolean).length > 1) notes.push(`${merged} runs appeared in more than one source and were merged (same day, distance within 3%).`);
  const windowStart = addDays(eventDate, -HISTORY_DAYS);
  const kept = records.filter((r) => r.date >= windowStart);
  if (kept.length < records.length) notes.push(`${records.length - kept.length} runs older than 6 months (before ${windowStart}) were left out.`);
  kept.sort((a, b) => (a.dateTime ?? a.date).localeCompare(b.dateTime ?? b.date));
  return { records: kept, notes, windowStart };
}
