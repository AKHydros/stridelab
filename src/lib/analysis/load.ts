import type { AthleteContext, Lap, Sample, TrainingRecord } from "../types";
import { addDays } from "../units";

/**
 * Training stress and the Performance Manager Chart (Banister impulse-response,
 * as popularised by TrainingPeaks and GoldenCheetah).
 */

export type StressMethod = "rTSS" | "TRIMP";

export interface StressResult {
  method?: StressMethod;
  basis: string;
  scored: number;
  skipped: number;
}

/** rTSS: hours × IF² × 100 with IF = threshold pace ÷ run pace (grade not adjusted). */
export function rTSS(timeS: number, distanceKm: number, thresholdPaceS: number): number {
  const intensity = thresholdPaceS / (timeS / distanceKm);
  return (timeS / 3600) * intensity * intensity * 100;
}

/** Banister TRIMP: minutes × HRr × 0.64·e^(1.92·HRr) (male coefficients). */
export function trimp(timeS: number, avgHr: number, restHr: number, maxHr: number): number {
  const hrr = Math.max(0, Math.min(1, (avgHr - restHr) / (maxHr - restHr)));
  return (timeS / 60) * hrr * 0.64 * Math.exp(1.92 * hrr);
}

export function chooseStress(ctx: AthleteContext): StressResult {
  if (ctx.thresholdPaceS) return { method: "rTSS", basis: "rTSS from pace vs threshold pace (not grade-adjusted)", scored: 0, skipped: 0 };
  if (ctx.maxHr && ctx.restHr) return { method: "TRIMP", basis: "Banister TRIMP from average HR (activity-level)", scored: 0, skipped: 0 };
  return { basis: "Not available — supply threshold pace, or max and resting HR", scored: 0, skipped: 0 };
}

export function stressOf(r: Pick<TrainingRecord, "timeS" | "distanceKm" | "avgHr">, ctx: AthleteContext, method: StressMethod): number | undefined {
  if (method === "rTSS") return r.distanceKm > 0 && ctx.thresholdPaceS ? rTSS(r.timeS, r.distanceKm, ctx.thresholdPaceS) : undefined;
  return r.avgHr && ctx.maxHr && ctx.restHr ? trimp(r.timeS, r.avgHr, ctx.restHr, ctx.maxHr) : undefined;
}

export interface PmcDay {
  date: string;
  load: number;
  ctl: number;
  atl: number;
  /** Form going into the day: yesterday's CTL − yesterday's ATL. */
  tsb: number;
  isEvent: boolean;
}

export interface Pmc {
  stress: StressResult;
  days: PmcDay[];
  rampInDays: number;
  atEvent?: PmcDay;
}

/** CTL (42-day) and ATL (7-day) exponentially weighted daily load. */
export function performanceManager(records: TrainingRecord[], ctx: AthleteContext): Pmc {
  const stress = chooseStress(ctx);
  if (!stress.method || !records.length) return { stress, days: [], rampInDays: 0 };
  const byDay = new Map<string, number>();
  for (const r of records) {
    const s = stressOf(r, ctx, stress.method);
    if (s === undefined) {
      stress.skipped++;
      continue;
    }
    stress.scored++;
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + s);
  }
  const dates = records.map((r) => r.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1] > ctx.eventDate ? dates[dates.length - 1] : ctx.eventDate;
  const kC = 1 - Math.exp(-1 / 42);
  const kA = 1 - Math.exp(-1 / 7);
  const days: PmcDay[] = [];
  let ctl = 0;
  let atl = 0;
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const load = byDay.get(d) ?? 0;
    const tsb = ctl - atl;
    ctl += (load - ctl) * kC;
    atl += (load - atl) * kA;
    days.push({ date: d, load, ctl, atl, tsb, isEvent: d === ctx.eventDate });
  }
  return { stress, days, rampInDays: Math.min(42, days.length), atEvent: days.find((x) => x.isEvent) };
}

/* ------------------------------------------------------------------ */
/* Best efforts and mean-maximal curves                                */
/* ------------------------------------------------------------------ */

export interface BestEffort {
  label: string;
  distanceKm: number;
  timeS?: number;
  paceS?: number;
  startKm?: number;
}

/**
 * Fastest continuous span of each distance within the activity, from the
 * piecewise-linear distance→time curve implied by the laps (uniform pace
 * within each lap is assumed).
 */
export function bestEfforts(laps: Lap[], distances: { label: string; km: number }[]): BestEffort[] {
  const knots: [number, number][] = [[0, 0]];
  for (const l of laps) {
    const [d, t] = knots[knots.length - 1];
    knots.push([d + l.distanceKm, t + l.timeS]);
  }
  const total = knots[knots.length - 1][0];
  const timeAt = (x: number) => {
    let i = 1;
    while (i < knots.length - 1 && knots[i][0] < x) i++;
    const [d0, t0] = knots[i - 1];
    const [d1, t1] = knots[i];
    return d1 === d0 ? t1 : t0 + ((x - d0) / (d1 - d0)) * (t1 - t0);
  };
  return distances.map(({ label, km }) => {
    if (km > total + 1e-9) return { label, distanceKm: km };
    let best = Infinity;
    let at = 0;
    for (let s = 0; s + km <= total + 1e-9; s += 0.05) {
      const t = timeAt(Math.min(s + km, total)) - timeAt(s);
      if (t < best) {
        best = t;
        at = s;
      }
    }
    return { label, distanceKm: km, timeS: best, paceS: best / km, startKm: at };
  });
}

export const MMP_DURATIONS = [5, 15, 30, 60, 120, 180, 300, 600, 1200, 1800, 3600, 5400, 7200];

export interface MmpPoint {
  durationS: number;
  power: number;
}

/** Mean-maximal power from ~1 Hz samples (prefix sums, gaps treated as continuous). */
export function meanMaxPower(samples: Sample[], durations = MMP_DURATIONS): MmpPoint[] {
  const p = samples.map((s) => s.power ?? 0);
  if (p.length < 60) return [];
  const pre = [0];
  for (const v of p) pre.push(pre[pre.length - 1] + v);
  const out: MmpPoint[] = [];
  for (const d of durations) {
    if (d > p.length) break;
    let best = 0;
    for (let i = d; i <= p.length; i++) best = Math.max(best, pre[i] - pre[i - d]);
    out.push({ durationS: d, power: best / d });
  }
  return out;
}

export interface CpFit {
  available: boolean;
  reason?: string;
  cp?: number;
  wPrimeJ?: number;
  r2?: number;
  points?: MmpPoint[];
}

/**
 * Two-parameter critical-power model (Monod & Scherrer): work = CP·t + W′,
 * fitted on 3–20 min mean-maximal points. Only meaningful when those points
 * come from near-maximal efforts; a steady run gives an implausible W′ and is
 * rejected rather than reported.
 */
export function fitCriticalPower(mmp: MmpPoint[]): CpFit {
  const pts = mmp.filter((m) => m.durationS >= 180 && m.durationS <= 1200);
  if (pts.length < 3) return { available: false, reason: "Needs per-second power covering 3–20 minutes." };
  const xs = pts.map((p) => p.durationS);
  const ys = pts.map((p) => p.power * p.durationS);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const cp = sxy / sxx;
  const w = my - cp * mx;
  const ssTot = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (cp * xs[i] + w)) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;
  if (w < 8000 || w > 40000) {
    return { available: false, reason: `Efforts in this file are too uniform to separate CP from W′ (fitted W′ ${Math.round(w / 1000)} kJ is outside a plausible 8–40 kJ for running). Fit across several all-out 3–20 min efforts instead.`, points: pts };
  }
  // R² of work vs time is near 1 for almost any data, so it is reported but not used to accept the fit.
  return { available: true, cp, wPrimeJ: w, r2, points: pts };
}

export interface WbalPoint {
  timeS: number;
  wbal: number;
}

/**
 * Skiba (2015) differential W′ balance. Depletes 1 J per J above CP; below CP
 * recovers in proportion to the deficit. With lap data each lap is one step,
 * which smooths out short surges.
 */
export function wPrimeBalance(steps: { dt: number; power?: number }[], cp: number, wPrime: number): WbalPoint[] {
  let w = wPrime;
  let t = 0;
  const out: WbalPoint[] = [{ timeS: 0, wbal: w }];
  for (const s of steps) {
    if (s.power === undefined || s.dt <= 0) {
      t += Math.max(0, s.dt);
      continue;
    }
    if (s.power > cp) w -= (s.power - cp) * s.dt;
    else w += (cp - s.power) * s.dt * ((wPrime - w) / wPrime);
    w = Math.min(wPrime, w);
    t += s.dt;
    out.push({ timeS: t, wbal: w });
  }
  return out;
}
