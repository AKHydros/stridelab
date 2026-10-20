import type { TrainingRecord } from "../types";
import { addDays, daysBetween } from "../units";

export type RecordRole = "event" | "additional" | "training";
export interface TaggedRecord extends TrainingRecord {
  role: RecordRole;
  synthetic?: boolean;
}

/**
 * Tag the activity-summary rows that are the event and the additional run, so
 * they are never double-counted. If they are absent from the summary they are
 * added from their own files (marked synthetic).
 */
export function tagRecords(
  records: TrainingRecord[],
  eventDate: string,
  event?: { distanceKm: number; timeS: number },
  extra?: { distanceKm: number; timeS: number },
): { records: TaggedRecord[]; notes: string[] } {
  const notes: string[] = [];
  const tagged: TaggedRecord[] = records.map((r) => ({ ...r, role: "training" }));
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.3, b * 0.05);
  const claim = (target: { distanceKm: number; timeS: number } | undefined, role: RecordRole, label: string) => {
    if (!target) return;
    const sameDay = tagged.filter((r) => r.role === "training" && Math.abs(daysBetween(eventDate, r.date)) <= 0 && near(r.distanceKm, target.distanceKm));
    if (sameDay.length) {
      sameDay.sort((a, b) => Math.abs(a.distanceKm - target.distanceKm) - Math.abs(b.distanceKm - target.distanceKm));
      sameDay[0].role = role;
      notes.push(`${label} found in the activity summary (${sameDay[0].distanceKm.toFixed(2)} km) and tagged — not double-counted.`);
    } else {
      tagged.push({ date: eventDate, type: "Running", title: label, distanceKm: target.distanceKm, timeS: target.timeS, role, synthetic: true });
      notes.push(`${label} not present in the activity summary; added from its own file for weekly totals.`);
    }
  };
  claim(event, "event", "Main event");
  claim(extra, "additional", "Additional run");
  tagged.sort((a, b) => (a.dateTime ?? a.date).localeCompare(b.dateTime ?? b.date));
  return { records: tagged, notes };
}

export interface WeekBucket {
  weekStart: string;
  trainingKm: number;
  eventKm: number;
  additionalKm: number;
  totalKm: number;
  runs: number;
  incomplete: boolean;
  incompleteReason?: string;
}

const mondayOf = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
};

export function weeklyVolume(records: TaggedRecord[], eventDate: string): WeekBucket[] {
  const real = records.filter((r) => !r.synthetic);
  if (!records.length) return [];
  const firstData = (real[0] ?? records[0]).date;
  const lastData = [...records].map((r) => r.date).sort().slice(-1)[0];
  const lastDate = lastData > eventDate ? lastData : eventDate;
  const weeks: WeekBucket[] = [];
  for (let w = mondayOf(firstData); w <= lastDate; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    const inWeek = records.filter((r) => r.date >= w && r.date <= end);
    const by = (role: RecordRole) => inWeek.filter((r) => r.role === role).reduce((a, r) => a + r.distanceKm, 0);
    const reasons: string[] = [];
    if (w < firstData) reasons.push(`records begin ${firstData}`);
    if (end > lastData) reasons.push(`records end ${lastData}`);
    weeks.push({
      weekStart: w,
      trainingKm: by("training"),
      eventKm: by("event"),
      additionalKm: by("additional"),
      totalKm: inWeek.reduce((a, r) => a + r.distanceKm, 0),
      runs: inWeek.length,
      incomplete: reasons.length > 0,
      incompleteReason: reasons.join("; ") || undefined,
    });
  }
  return weeks;
}

export interface WindowTotal {
  days: number;
  km?: number;
  runs?: number;
  status: "Complete" | "Partial" | "Insufficient data";
  note?: string;
}

/** Totals over the N days before the event day (event day excluded). */
export function preEventWindows(records: TaggedRecord[], eventDate: string, windows = [7, 14, 28]): WindowTotal[] {
  const pre = records.filter((r) => r.role === "training" && r.date < eventDate);
  const first = records.filter((r) => !r.synthetic).map((r) => r.date).sort()[0];
  return windows.map((days) => {
    const start = addDays(eventDate, -days);
    if (!first || first > addDays(eventDate, -1)) return { days, status: "Insufficient data" as const };
    const inWin = pre.filter((r) => r.date >= start);
    const partial = first > start;
    return {
      days,
      km: inWin.reduce((a, r) => a + r.distanceKm, 0),
      runs: inWin.length,
      status: partial ? ("Partial" as const) : ("Complete" as const),
      note: partial ? `Records begin ${first}; window starts ${start}.` : undefined,
    };
  });
}

export interface TrainingAnalysis {
  windows: WindowTotal[];
  /** Acute (7-day) ÷ chronic (28-day weekly mean). Descriptive only. */
  acwr?: number;
  loadLabel?: "Relatively high" | "Moderate / steady" | "Relatively low (taper-like)";
  longestRuns: TaggedRecord[];
  qualitySessions: { record: TaggedRecord; daysBefore: number; reason: string }[];
  longRunComparison: TaggedRecord[];
  daysSinceLastQuality?: number;
}

export function analyzeTraining(records: TaggedRecord[], eventDate: string, goalPaceS: number): TrainingAnalysis {
  const windows = preEventWindows(records, eventDate);
  const w7 = windows.find((w) => w.days === 7);
  const w28 = windows.find((w) => w.days === 28);
  let acwr: number | undefined;
  if (w7?.km !== undefined && w28?.km && w28.status === "Complete") acwr = w7.km / (w28.km / 4);
  const pre = records.filter((r) => r.role === "training" && r.date < eventDate && r.date >= addDays(eventDate, -42));
  const quality = pre
    .map((r) => {
      const pace = r.timeS / r.distanceKm;
      const reasons: string[] = [];
      if (r.distanceKm >= 24) reasons.push("long run ≥24 km");
      if (r.distanceKm >= 5 && pace <= goalPaceS + 10) reasons.push("at/faster than goal marathon pace +10 s/km");
      if (r.trainingEffect !== undefined && r.trainingEffect >= 4) reasons.push(`aerobic TE ${r.trainingEffect.toFixed(1)}`);
      return { record: r, daysBefore: daysBetween(r.date, eventDate), reason: reasons.join(", ") };
    })
    .filter((q) => q.reason);
  return {
    windows,
    acwr,
    loadLabel: acwr === undefined ? undefined : acwr > 1.3 ? "Relatively high" : acwr >= 0.8 ? "Moderate / steady" : "Relatively low (taper-like)",
    longestRuns: [...pre].sort((a, b) => b.distanceKm - a.distanceKm).slice(0, 5),
    qualitySessions: quality.sort((a, b) => a.daysBefore - b.daysBefore),
    longRunComparison: pre.filter((r) => r.distanceKm >= 18).sort((a, b) => a.date.localeCompare(b.date)),
    daysSinceLastQuality: quality.length ? Math.min(...quality.map((q) => q.daysBefore)) : undefined,
  };
}
