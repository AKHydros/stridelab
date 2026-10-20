import type { Lap } from "../types";
import { cumulative, lapPace, slice, summarize, type Summary } from "./aggregate";
import { gapFactor } from "./environment";

export interface Segment extends Summary {
  label: string;
  fromKm: number;
  toKm: number;
  approximated: boolean;
  gapPaceS?: number;
}

/** 0–5, 5–10, … km blocks plus the remaining distance. */
export function fiveKmSegments(laps: Lap[], size = 5): Segment[] {
  const total = laps.reduce((a, l) => a + l.distanceKm, 0);
  const segs: Segment[] = [];
  for (let from = 0; from < total - 0.05; from += size) {
    const to = Math.min(from + size, total);
    segs.push(makeSegment(laps, from, to, to === total && to - from < size ? `${from}–${to.toFixed(1)} km` : `${from}–${to} km`));
  }
  return segs;
}

export function makeSegment(laps: Lap[], fromKm: number, toKm: number, label: string): Segment {
  const s = slice(laps, fromKm, toKm);
  const sum = summarize(s.laps);
  return { ...sum, label, fromKm, toKm, approximated: s.approximated, gapPaceS: gapPace(s.laps) };
}

/** Grade-adjusted pace from net lap grade (approximation — rolling terrain within a lap is lost). */
export function gapPace(laps: Lap[]): number | undefined {
  if (!laps.length || laps.some((l) => l.ascentM === undefined || l.descentM === undefined)) return undefined;
  let adjTime = 0;
  let dist = 0;
  for (const l of laps) {
    const grade = ((l.ascentM ?? 0) - (l.descentM ?? 0)) / (l.distanceKm * 1000);
    adjTime += l.timeS / gapFactor(grade);
    dist += l.distanceKm;
  }
  return adjTime / dist;
}

export interface PacingAnalysis {
  firstThird: Segment;
  finalThird: Segment;
  /** (final-third pace − first-third pace) ÷ first-third pace × 100. Negative = faster late. */
  driftPct: number;
  firstHalf: Segment;
  secondHalf: Segment;
  /** Second half time − first half time, seconds. Negative = negative split. */
  splitDiffS: number;
  splitType: "Negative split" | "Even split" | "Positive split";
  paceCvPct: number;
  fastestLap?: Lap;
  slowestLap?: Lap;
  changes: { lap: Lap; atKm: number; deltaPct: number }[];
  segments: Segment[];
}

export function analyzePacing(laps: Lap[]): PacingAnalysis {
  const total = laps.reduce((a, l) => a + l.distanceKm, 0);
  const firstThird = makeSegment(laps, 0, total / 3, "First third");
  const finalThird = makeSegment(laps, (2 * total) / 3, total, "Final third");
  const firstHalf = makeSegment(laps, 0, total / 2, "First half");
  const secondHalf = makeSegment(laps, total / 2, total, "Second half");
  const splitDiffS = secondHalf.timeS - firstHalf.timeS;
  const splitPct = (splitDiffS / firstHalf.timeS) * 100;
  // Laps under 400 m (e.g. the final partial lap) are too noisy to rank.
  const full = laps.filter((l) => l.distanceKm >= 0.4);
  const ranked = [...full].sort((a, b) => lapPace(a) - lapPace(b));
  return {
    firstThird,
    finalThird,
    driftPct: ((finalThird.paceS - firstThird.paceS) / firstThird.paceS) * 100,
    firstHalf,
    secondHalf,
    splitDiffS,
    splitType: Math.abs(splitPct) < 1 ? "Even split" : splitDiffS < 0 ? "Negative split" : "Positive split",
    paceCvPct: weightedCv(full),
    fastestLap: ranked[0],
    slowestLap: ranked[ranked.length - 1],
    changes: paceChanges(laps),
    segments: fiveKmSegments(laps),
  };
}

/** Distance-weighted coefficient of variation of lap pace. */
export function weightedCv(laps: Lap[]): number {
  const d = laps.reduce((a, l) => a + l.distanceKm, 0);
  if (!d || laps.length < 2) return NaN;
  const mean = laps.reduce((a, l) => a + lapPace(l) * l.distanceKm, 0) / d;
  const v = laps.reduce((a, l) => a + l.distanceKm * (lapPace(l) - mean) ** 2, 0) / d;
  return (Math.sqrt(v) / mean) * 100;
}

/** Laps whose pace departs ≥4% from the mean of the previous three full laps. */
export function paceChanges(laps: Lap[], thresholdPct = 4): { lap: Lap; atKm: number; deltaPct: number }[] {
  const cum = cumulative(laps);
  const out: { lap: Lap; atKm: number; deltaPct: number }[] = [];
  for (let i = 3; i < cum.length; i++) {
    const { lap, startKm } = cum[i];
    if (lap.distanceKm < 0.4) continue;
    const prev = cum.slice(i - 3, i).map((c) => c.lap);
    const base = prev.reduce((a, l) => a + l.timeS, 0) / prev.reduce((a, l) => a + l.distanceKm, 0);
    const delta = ((lapPace(lap) - base) / base) * 100;
    if (Math.abs(delta) >= thresholdPct) out.push({ lap, atKm: startKm, deltaPct: delta });
  }
  return out;
}
