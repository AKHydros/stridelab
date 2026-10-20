import type { Lap } from "../types";
import { slice, summarize } from "./aggregate";

export interface Decoupling {
  available: boolean;
  reason?: string;
  method: string;
  firstHalfEf?: number;
  secondHalfEf?: number;
  /** (EF₁ − EF₂) ÷ EF₁ × 100. Positive = HR rose relative to output. */
  pct?: number;
  approximated?: boolean;
}

/**
 * Aerobic decoupling (Friel): compare efficiency factor (output ÷ HR) between
 * the first and second halves by elapsed time. Requires ≥45 min and HR on
 * ≥90 % of the time. Output is speed (Pa:HR) or power (Pw:HR).
 */
export function decoupling(laps: Lap[], output: "pace" | "power"): Decoupling {
  const method =
    output === "pace"
      ? "Pa:HR — speed (m/min) ÷ HR, first vs second half of elapsed time"
      : "Pw:HR — power (W) ÷ HR, first vs second half of elapsed time";
  const all = summarize(laps);
  if (all.timeS < 45 * 60) return { available: false, method, reason: "Activity shorter than 45 minutes." };
  if (all.hrCoverage < 0.9) return { available: false, method, reason: "Heart rate missing on more than 10% of the activity." };
  if (output === "power" && all.powerCoverage < 0.9) return { available: false, method, reason: "Power missing on more than 10% of the activity." };
  const a = slice(laps, 0, all.timeS / 2, "time");
  const b = slice(laps, all.timeS / 2, all.timeS, "time");
  const ef = (ls: Lap[]) => {
    const s = summarize(ls);
    const out = output === "pace" ? (s.distanceKm * 1000) / (s.timeS / 60) : s.avgPower;
    return out !== undefined && s.avgHr ? out / s.avgHr : undefined;
  };
  const e1 = ef(a.laps);
  const e2 = ef(b.laps);
  if (!e1 || !e2) return { available: false, method, reason: "Insufficient data." };
  return { available: true, method, firstHalfEf: e1, secondHalfEf: e2, pct: ((e1 - e2) / e1) * 100, approximated: a.approximated || b.approximated };
}

export function decouplingBand(pct: number): string {
  if (pct < 0) return "Negative decoupling — HR fell relative to output (often a pacing change or terrain effect)";
  if (pct < 5) return "Below 5% — conventionally read as good aerobic durability for this duration";
  if (pct < 10) return "5–10% — moderate drift; interpret alongside heat, terrain and pacing changes";
  return "Above 10% — substantial drift; cause cannot be determined from HR alone";
}

/** HR progression between equal-time halves (bpm). */
export function hrDrift(laps: Lap[]): number | undefined {
  const s = summarize(laps);
  const a = summarize(slice(laps, 0, s.timeS / 2, "time").laps).avgHr;
  const b = summarize(slice(laps, s.timeS / 2, s.timeS, "time").laps).avgHr;
  return a !== undefined && b !== undefined ? b - a : undefined;
}

/** Karvonen %HRR when both max and resting HR are supplied, else %HRmax. */
export function relativeIntensity(hr: number | undefined, maxHr?: number, restHr?: number): { value?: number; basis: string } {
  if (hr === undefined || !maxHr) return { basis: "Not available (max HR not supplied)" };
  if (restHr) return { value: ((hr - restHr) / (maxHr - restHr)) * 100, basis: "% heart-rate reserve" };
  return { value: (hr / maxHr) * 100, basis: "% max HR" };
}
