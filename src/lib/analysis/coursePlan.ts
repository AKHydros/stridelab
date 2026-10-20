import type { RoutePoint } from "../types";
import { gapFactor } from "./environment";
import { bearingDeg, headwindMps, windCostFactor } from "./wind";

export interface PlanSplit {
  km: number;
  distanceKm: number;
  gradePct: number;
  gainM: number;
  lossM: number;
  paceS: number;
  splitS: number;
  cumulativeS: number;
  bearingDeg?: number;
  /** Headwind component at runner height, m/s (negative = tailwind). */
  headwindMps?: number;
  windFactor?: number;
}

export interface WindInput {
  speedKmh: number;
  fromDeg: number;
  /** 1 = fully exposed, lower = sheltered or drafting. */
  exposure: number;
}

/** Elevation smoothed with a ±n point moving average to suppress GPS noise. */
export function smoothElevation(points: RoutePoint[], n = 5): number[] {
  const e = points.map((p) => p.eleM ?? NaN);
  return e.map((_, i) => {
    const w = e.slice(Math.max(0, i - n), i + n + 1).filter(Number.isFinite);
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : NaN;
  });
}

/**
 * Course-aware pacing plan (in the spirit of Garmin PacePro).
 * `evenEffort` blends between even pace (0) and even grade-adjusted effort (1).
 */
export function coursePlan(points: RoutePoint[], targetS: number, evenEffort = 0.6, splitKm = 1, wind?: WindInput): PlanSplit[] {
  if (points.length < 2) return [];
  const total = points[points.length - 1].distKm;
  const ele = smoothElevation(points);
  const hasEle = ele.some(Number.isFinite);
  const raw: Omit<PlanSplit, "paceS" | "splitS" | "cumulativeS">[] = [];
  const speed = (total * 1000) / targetS;
  let idx = 0;
  for (let start = 0, k = 1; start < total - 1e-6; start += splitKm, k++) {
    const end = Math.min(start + splitKm, total);
    let gain = 0;
    let loss = 0;
    const startPt = points[idx];
    let startEle: number | undefined;
    let endEle: number | undefined;
    while (idx < points.length - 1 && points[idx + 1].distKm <= end) {
      const a = ele[idx];
      const b = ele[idx + 1];
      if (points[idx].distKm >= start && Number.isFinite(a) && Number.isFinite(b)) {
        startEle ??= a;
        endEle = b;
        if (b > a) gain += b - a;
        else loss += a - b;
      }
      idx++;
    }
    const d = end - start;
    const grade = hasEle && startEle !== undefined && endEle !== undefined ? (endEle - startEle) / (d * 1000) : 0;
    const endPt = points[idx];
    const brg = startPt && endPt && (startPt.lat !== endPt.lat || startPt.lon !== endPt.lon) ? bearingDeg(startPt, endPt) : undefined;
    const hw = wind && brg !== undefined ? headwindMps(wind.speedKmh, wind.fromDeg, brg, wind.exposure) : undefined;
    raw.push({ km: k, distanceKm: d, gradePct: grade * 100, gainM: gain, lossM: loss, bearingDeg: brg, headwindMps: hw, windFactor: hw !== undefined ? windCostFactor(speed, hw) : undefined });
  }
  const weights = raw.map((r) => Math.pow(gapFactor(r.gradePct / 100) * (r.windFactor ?? 1), evenEffort));
  const weightedDist = raw.reduce((a, r, i) => a + r.distanceKm * weights[i], 0);
  const basePace = targetS / weightedDist;
  let cum = 0;
  return raw.map((r, i) => {
    const paceS = basePace * weights[i];
    const splitS = paceS * r.distanceKm;
    cum += splitS;
    return { ...r, paceS, splitS, cumulativeS: cum };
  });
}
