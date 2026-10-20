import type { Lap, Sample, StrydFile } from "../types";
import { cumulative, slice, summarize } from "./aggregate";

export type PowerSource = "stryd-laps" | "stryd-samples" | "garmin-laps" | "none";

export interface AlignedPower {
  source: PowerSource;
  /** Event laps with power (and Stryd running dynamics where aligned). */
  laps: Lap[];
  note: string;
  strydDistanceKm?: number;
  strydTimeS?: number;
}

/**
 * Attach power to the Garmin event laps. Stryd is the primary power source.
 * Stryd laps are matched one-to-one only when the lap counts and distances
 * agree; per-second samples are mapped by distance fraction (Stryd distance is
 * rescaled to the Garmin total), which is an alignment approximation and is
 * labelled as such.
 */
export function alignPower(eventLaps: Lap[], stryd?: StrydFile): AlignedPower {
  const gTotal = eventLaps.reduce((a, l) => a + l.distanceKm, 0);
  if (stryd?.laps.length) {
    const sTotal = stryd.laps.reduce((a, l) => a + l.distanceKm, 0);
    const sTime = stryd.laps.reduce((a, l) => a + l.timeS, 0);
    const sameCount = stryd.laps.length === eventLaps.length;
    const matched = sameCount && stryd.laps.every((l, i) => Math.abs(l.distanceKm - eventLaps[i].distanceKm) <= Math.max(0.05, eventLaps[i].distanceKm * 0.05));
    if (matched) {
      return {
        source: "stryd-laps",
        laps: eventLaps.map((l, i) => ({
          ...l,
          power: stryd.laps[i].power ?? l.power,
          formPower: stryd.laps[i].formPower ?? l.formPower,
          lss: stryd.laps[i].lss ?? l.lss,
          cadence: l.cadence ?? stryd.laps[i].cadence,
        })),
        note: `Stryd laps matched one-to-one with ${eventLaps.length} Garmin laps (distances within 5%).`,
        strydDistanceKm: sTotal,
        strydTimeS: sTime,
      };
    }
    // Lap structures differ: map Stryd lap power onto Garmin laps by distance fraction.
    const eventCum = cumulative(eventLaps);
    const laps = eventLaps.map((l, i) => {
      const startF = eventCum[i].startKm / gTotal;
      const endF = startF + l.distanceKm / gTotal;
      const part = slice(stryd.laps, startF * sTotal, endF * sTotal).laps;
      return { ...l, power: summarize(part).avgPower ?? l.power };
    });
    return {
      source: "stryd-laps",
      laps,
      note: `Stryd lap structure (${stryd.laps.length} laps, ${sTotal.toFixed(2)} km) differs from Garmin (${eventLaps.length} laps, ${gTotal.toFixed(2)} km); power mapped by distance fraction — approximate alignment.`,
      strydDistanceKm: sTotal,
      strydTimeS: sTime,
    };
  }
  if (stryd?.samples.length) {
    const s = stryd.samples.filter((x) => x.distanceKm !== undefined);
    const sTotal = s.length ? s[s.length - 1].distanceKm! : 0;
    if (sTotal > 0) {
      const cum = cumulative(eventLaps);
      const laps = eventLaps.map((l, i) => {
        const a = (cum[i].startKm / gTotal) * sTotal;
        const b = (cum[i].endKm / gTotal) * sTotal;
        const win = s.filter((x) => x.distanceKm! >= a && x.distanceKm! < b);
        return {
          ...l,
          power: mean(win.map((x) => x.power)) ?? l.power,
          formPower: mean(win.map((x) => x.formPower)) ?? l.formPower,
          lss: mean(win.map((x) => x.lss)) ?? l.lss,
          cadence: l.cadence ?? mean(win.map((x) => x.cadence)),
        };
      });
      return {
        source: "stryd-samples",
        laps,
        note: `Stryd per-second samples (${s.length}) mapped to Garmin laps by distance fraction (Stryd ${sTotal.toFixed(2)} km vs Garmin ${gTotal.toFixed(2)} km). Devices are not time-synchronised; treat lap-level power as approximate.`,
        strydDistanceKm: sTotal,
        strydTimeS: stryd.samples[stryd.samples.length - 1].timeS,
      };
    }
  }
  if (eventLaps.some((l) => l.power !== undefined)) {
    return { source: "garmin-laps", laps: eventLaps, note: "Power taken from the Garmin split file (no usable Stryd file)." };
  }
  return { source: "none", laps: eventLaps, note: "No running-power data available." };
}

const mean = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x !== undefined && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};

export interface PowerAnalysis {
  available: boolean;
  avgPower?: number;
  normalizedPower?: number;
  variabilityIndex?: number;
  lapPowerCvPct?: number;
  pctCp?: number;
  /** Speed per watt (m/s per 100 W) first vs final third. */
  speedPerWatt?: { early: number; late: number; changePct: number };
  /** % change of pace and power, final vs first third. */
  divergence?: { pacePct: number; powerPct: number };
  runningEffectiveness?: number;
}

export function analyzePower(laps: Lap[], samples: Sample[], cp?: number, weightKg?: number): PowerAnalysis {
  const s = summarize(laps);
  if (s.avgPower === undefined) return { available: false };
  const total = s.distanceKm;
  const early = summarize(slice(laps, 0, total / 3).laps);
  const late = summarize(slice(laps, (2 * total) / 3, total).laps);
  const spw = (x: typeof early) => (x.avgPower ? ((1000 / x.paceS) / x.avgPower) * 100 : NaN);
  const e = spw(early);
  const l = spw(late);
  const np = normalizedPower(samples);
  const withP = laps.filter((x) => x.power !== undefined && x.distanceKm >= 0.4);
  const mp = withP.reduce((a, x) => a + x.power! * x.timeS, 0) / withP.reduce((a, x) => a + x.timeS, 0);
  const sd = Math.sqrt(withP.reduce((a, x) => a + x.timeS * (x.power! - mp) ** 2, 0) / withP.reduce((a, x) => a + x.timeS, 0));
  return {
    available: true,
    avgPower: s.avgPower,
    normalizedPower: np,
    variabilityIndex: np && s.avgPower ? np / s.avgPower : undefined,
    lapPowerCvPct: withP.length > 1 ? (sd / mp) * 100 : undefined,
    pctCp: cp ? (s.avgPower / cp) * 100 : undefined,
    speedPerWatt: Number.isFinite(e) && Number.isFinite(l) ? { early: e, late: l, changePct: ((l - e) / e) * 100 } : undefined,
    divergence: early.avgPower && late.avgPower ? { pacePct: ((late.paceS - early.paceS) / early.paceS) * 100, powerPct: ((late.avgPower - early.avgPower) / early.avgPower) * 100 } : undefined,
    runningEffectiveness: weightKg ? (1000 / s.paceS) / (s.avgPower / weightKg) : undefined,
  };
}

/** 30-s rolling mean, raised to the 4th power, averaged, 4th root. Needs ~1 Hz samples. */
export function normalizedPower(samples: Sample[]): number | undefined {
  const p = samples.filter((s) => s.power !== undefined);
  if (p.length < 120) return undefined;
  const rolled: number[] = [];
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    sum += p[i].power!;
    if (i >= 30) sum -= p[i - 30].power!;
    if (i >= 29) rolled.push(sum / 30);
  }
  return Math.pow(rolled.reduce((a, v) => a + v ** 4, 0) / rolled.length, 0.25);
}
