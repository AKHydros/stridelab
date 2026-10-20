import type { RecoveryDay, TrainingRecord } from "../types";
import { addDays } from "../units";
import type { PmcDay } from "./load";

export type HrvStatus = "Above normal" | "Within normal" | "Below normal" | "Insufficient data";

export interface RecoveryPoint extends RecoveryDay {
  lnHrv?: number;
  /** 7-day rolling mean of ln rMSSD (≥ 4 values). */
  ln7?: number;
  /** 60-day baseline mean and the normal band (± 0.5 SD, the smallest worthwhile change). */
  baseline?: number;
  bandLo?: number;
  bandHi?: number;
  status: HrvStatus;
  rhr30?: number;
  sleep7?: number;
  light: "green" | "amber" | "red" | "none";
  flags: string[];
}

export interface Correlation {
  label: string;
  r?: number;
  n: number;
  note: string;
  points: { x: number; y: number; date: string }[];
}

export interface Comparison {
  label: string;
  goodLabel: string;
  poorLabel: string;
  good?: number;
  poor?: number;
  nGood: number;
  nPoor: number;
  diffPct?: number;
}

export interface RecoveryAnalysis {
  points: RecoveryPoint[];
  latest?: RecoveryPoint;
  preEvent: { nights: RecoveryPoint[]; hrvVsBaselinePct?: number; sleepAvg?: number; summary: string };
  loadResponse?: Correlation;
  sleepVsEf?: Comparison;
  hrvVsEf?: Comparison;
  method: string;
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined);
const sd = (v: number[]) => {
  const m = mean(v);
  return m === undefined || v.length < 2 ? undefined : Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
};

export function pearson(xs: number[], ys: number[]): number | undefined {
  const n = xs.length;
  if (n < 8) return undefined;
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : undefined;
}

/**
 * HRV-guided monitoring after Plews et al. (2012) and Buchheit (2014): compare
 * the 7-day rolling mean of ln rMSSD with a 60-day normal band. Resting HR and
 * sleep add context. The traffic light is a transparent rule set, not a
 * proprietary readiness score.
 */
export function analyzeRecovery(days: RecoveryDay[], eventDate: string, records: TrainingRecord[], pmc: PmcDay[] = []): RecoveryAnalysis {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(sorted.map((d) => [d.date, d]));
  const inWindow = (end: string, n: number, pick: (d: RecoveryDay) => number | undefined) => {
    const v: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = byDate.get(addDays(end, -i));
      const y = x && pick(x);
      if (y !== undefined && Number.isFinite(y)) v.push(y);
    }
    return v;
  };
  const ln = (d: RecoveryDay) => (d.hrv ? Math.log(d.hrv) : undefined);

  const points: RecoveryPoint[] = sorted.map((d) => {
    const last7 = inWindow(d.date, 7, ln);
    const base = inWindow(addDays(d.date, -1), 60, ln);
    const ln7 = last7.length >= 4 ? mean(last7) : undefined;
    const bm = base.length >= 14 ? mean(base) : undefined;
    const bs = base.length >= 14 ? sd(base) : undefined;
    const bandLo = bm !== undefined && bs !== undefined ? bm - 0.5 * bs : undefined;
    const bandHi = bm !== undefined && bs !== undefined ? bm + 0.5 * bs : undefined;
    const status: HrvStatus = ln7 === undefined || bandLo === undefined ? "Insufficient data" : ln7 < bandLo ? "Below normal" : ln7 > bandHi! ? "Above normal" : "Within normal";
    const rhrBase = inWindow(addDays(d.date, -1), 30, (x) => x.restingHr);
    const rhr30 = rhrBase.length >= 10 ? mean(rhrBase) : undefined;
    const sleep7v = inWindow(d.date, 7, (x) => x.sleepHours);
    const sleep7 = sleep7v.length >= 4 ? mean(sleep7v) : undefined;
    const flags: string[] = [];
    if (status === "Below normal") flags.push("HRV 7-day mean below normal band");
    if (d.restingHr !== undefined && rhr30 !== undefined && d.restingHr - rhr30 >= 5) flags.push(`Resting HR +${Math.round(d.restingHr - rhr30)} bpm vs 30-day baseline`);
    if (sleep7 !== undefined && sleep7 < 7) flags.push(`Sleep averaging ${sleep7.toFixed(1)} h over 7 nights`);
    const assessed = status !== "Insufficient data" || rhr30 !== undefined || sleep7 !== undefined;
    return {
      ...d,
      lnHrv: ln(d),
      ln7,
      baseline: bm,
      bandLo,
      bandHi,
      status,
      rhr30,
      sleep7,
      flags,
      light: !assessed ? "none" : flags.length === 0 ? "green" : flags.length === 1 ? "amber" : "red",
    };
  });

  // The three nights before the event (night of day-3, day-2, day-1 and the morning of the event).
  const nights = [3, 2, 1, 0].map((k) => points.find((p) => p.date === addDays(eventDate, -k))).filter((p): p is RecoveryPoint => !!p);
  const ev = points.find((p) => p.date === eventDate) ?? nights[nights.length - 1];
  const hrvVsBaselinePct = ev?.ln7 !== undefined && ev.baseline !== undefined ? (Math.exp(ev.ln7 - ev.baseline) - 1) * 100 : undefined;
  const sleepAvg = mean(nights.map((n) => n.sleepHours).filter((x): x is number => x !== undefined));
  const summary = !nights.length
    ? "No recovery data around the event."
    : `${ev?.status ?? "Unknown"} HRV entering the event${hrvVsBaselinePct !== undefined ? ` (${hrvVsBaselinePct >= 0 ? "+" : ""}${hrvVsBaselinePct.toFixed(0)}% vs baseline)` : ""}${sleepAvg !== undefined ? `; ${sleepAvg.toFixed(1)} h average sleep over the final nights` : ""}.`;

  // Load → next-morning HRV deviation from baseline.
  const loadPts: { x: number; y: number; date: string }[] = [];
  for (const d of pmc) {
    const next = points.find((p) => p.date === addDays(d.date, 1));
    if (next?.lnHrv !== undefined && next.baseline !== undefined) loadPts.push({ x: d.load, y: (Math.exp(next.lnHrv - next.baseline) - 1) * 100, date: next.date });
  }
  const loadResponse: Correlation | undefined = loadPts.length
    ? {
        label: "Daily training load vs next-morning HRV (% from baseline)",
        r: pearson(loadPts.map((p) => p.x), loadPts.map((p) => p.y)),
        n: loadPts.length,
        note: "Negative r means harder days tend to be followed by lower HRV. Correlation only — illness, alcohol, travel and stress also move HRV.",
        points: loadPts,
      }
    : undefined;

  // Aerobic efficiency (m/min per bpm) of runs after good vs poor recovery mornings.
  const ef = (r: TrainingRecord) => (r.avgHr ? (r.distanceKm * 1000) / (r.timeS / 60) / r.avgHr : undefined);
  const compare = (label: string, goodLabel: string, poorLabel: string, good: (p: RecoveryPoint) => boolean | undefined): Comparison => {
    const g: number[] = [];
    const b: number[] = [];
    for (const r of records) {
      const p = points.find((x) => x.date === r.date);
      const e = ef(r);
      const ok = p ? good(p) : undefined;
      if (e === undefined || ok === undefined || r.date === eventDate) continue;
      (ok ? g : b).push(e);
    }
    const mg = mean(g);
    const mb = mean(b);
    return { label, goodLabel, poorLabel, good: mg, poor: mb, nGood: g.length, nPoor: b.length, diffPct: mg && mb && g.length >= 5 && b.length >= 5 ? ((mb - mg) / mg) * 100 : undefined };
  };

  return {
    points,
    latest: [...points].reverse().find((p) => p.light !== "none"),
    preEvent: { nights, hrvVsBaselinePct, sleepAvg, summary },
    loadResponse,
    sleepVsEf: compare("Run efficiency after sleep", "≥ 7 h", "< 7 h", (p) => (p.sleepHours === undefined ? undefined : p.sleepHours >= 7)),
    hrvVsEf: compare("Run efficiency by morning HRV", "At/above baseline", "Below baseline", (p) => (p.lnHrv === undefined || p.baseline === undefined ? undefined : p.lnHrv >= p.baseline)),
    method: "ln rMSSD 7-day rolling mean vs 60-day baseline ± 0.5 SD (Plews 2012; Buchheit 2014). Resting HR vs 30-day mean; sleep 7-night mean.",
  };
}
