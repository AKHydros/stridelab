import type { Lap } from "../types";

export interface Summary {
  distanceKm: number;
  timeS: number;
  movingTimeS?: number;
  paceS: number;
  avgHr?: number;
  maxHr?: number;
  /** Fraction of time covered by laps that report HR. */
  hrCoverage: number;
  avgPower?: number;
  powerCoverage: number;
  avgCadence?: number;
  ascentM?: number;
  descentM?: number;
  lapCount: number;
}

/** Time-weighted mean of a lap field over laps that report it. */
export function timeWeighted(laps: Lap[], pick: (l: Lap) => number | undefined): { mean?: number; coverage: number } {
  let w = 0;
  let sum = 0;
  let total = 0;
  for (const l of laps) {
    total += l.timeS;
    const v = pick(l);
    if (v === undefined || !Number.isFinite(v)) continue;
    w += l.timeS;
    sum += v * l.timeS;
  }
  return { mean: w > 0 ? sum / w : undefined, coverage: total > 0 ? w / total : 0 };
}

const sumOpt = (laps: Lap[], pick: (l: Lap) => number | undefined) =>
  laps.some((l) => pick(l) !== undefined) ? laps.reduce((a, l) => a + (pick(l) ?? 0), 0) : undefined;

/** Aggregate pace is total time ÷ total distance, never a mean of lap paces. */
export function summarize(laps: Lap[]): Summary {
  const distanceKm = laps.reduce((a, l) => a + l.distanceKm, 0);
  const timeS = laps.reduce((a, l) => a + l.timeS, 0);
  const hr = timeWeighted(laps, (l) => l.avgHr);
  const pw = timeWeighted(laps, (l) => l.power);
  const cad = timeWeighted(laps, (l) => l.cadence);
  const maxes = laps.map((l) => l.maxHr).filter((v): v is number => v !== undefined);
  return {
    distanceKm,
    timeS,
    movingTimeS: laps.length && laps.every((l) => l.movingTimeS !== undefined) ? laps.reduce((a, l) => a + (l.movingTimeS ?? 0), 0) : undefined,
    paceS: distanceKm > 0 ? timeS / distanceKm : NaN,
    avgHr: hr.mean,
    maxHr: maxes.length ? Math.max(...maxes) : undefined,
    hrCoverage: hr.coverage,
    avgPower: pw.mean,
    powerCoverage: pw.coverage,
    avgCadence: cad.mean,
    ascentM: sumOpt(laps, (l) => l.ascentM),
    descentM: sumOpt(laps, (l) => l.descentM),
    lapCount: laps.length,
  };
}

export const lapPace = (l: Lap) => l.timeS / l.distanceKm;

/**
 * Take the portion of the lap sequence between two cumulative positions,
 * measured either in km or in seconds. Laps straddling a boundary are
 * apportioned linearly, which assumes uniform pace within the lap.
 */
export function slice(laps: Lap[], from: number, to: number, by: "distance" | "time" = "distance"): { laps: Lap[]; approximated: boolean } {
  const out: Lap[] = [];
  let pos = 0;
  let approximated = false;
  for (const l of laps) {
    const len = by === "distance" ? l.distanceKm : l.timeS;
    const start = pos;
    const end = pos + len;
    pos = end;
    const a = Math.max(start, from);
    const b = Math.min(end, to);
    if (b <= a || len <= 0) continue;
    const f = (b - a) / len;
    if (f < 0.999) approximated = true;
    out.push({
      ...l,
      distanceKm: l.distanceKm * f,
      timeS: l.timeS * f,
      movingTimeS: l.movingTimeS !== undefined ? l.movingTimeS * f : undefined,
      ascentM: l.ascentM !== undefined ? l.ascentM * f : undefined,
      descentM: l.descentM !== undefined ? l.descentM * f : undefined,
    });
  }
  return { laps: out, approximated };
}

export function cumulative(laps: Lap[]): { startKm: number; endKm: number; startS: number; endS: number; lap: Lap }[] {
  let d = 0;
  let t = 0;
  return laps.map((lap) => {
    const r = { startKm: d, endKm: d + lap.distanceKm, startS: t, endS: t + lap.timeS, lap };
    d += lap.distanceKm;
    t += lap.timeS;
    return r;
  });
}
