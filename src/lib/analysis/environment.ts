/**
 * Environmental adjustments. All of these are published rules of thumb or
 * laboratory models; the UI labels every output from here as an estimate.
 */

/** Minetti et al. (2002) energy cost of running on a grade, J·kg⁻¹·m⁻¹. */
export function minettiCost(grade: number): number {
  const i = Math.max(-0.45, Math.min(0.45, grade));
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

/**
 * Cost relative to flat running. Downhill benefit is capped because the raw
 * Minetti curve overstates how much faster people actually run downhill.
 */
export function gapFactor(grade: number): number {
  const f = minettiCost(grade) / 3.6;
  return Math.max(f, 0.85);
}

/** Magnus-formula dew point, °C. */
export function dewPointC(tempC: number, rhPct: number): number {
  const a = 17.62;
  const b = 243.12;
  const g = Math.log(Math.max(1, rhPct) / 100) + (a * tempC) / (b + tempC);
  return (b * g) / (a - g);
}

const cToF = (c: number) => (c * 9) / 5 + 32;

/**
 * Temperature + dew point (°F) heat rule of thumb widely used by US coaches:
 * ≤100 no effect, rising to 8–10 % slowdown at 171–180. Midpoints are
 * interpolated linearly.
 */
const HEAT_TABLE: [number, number][] = [
  [100, 0], [105, 0.25], [115, 0.75], [125, 1.5], [135, 2.5], [145, 3.75], [155, 5.25], [165, 7], [175, 9], [185, 12],
];

export function heatSlowdownPct(tempC: number, dewC: number): number {
  const sum = cToF(tempC) + cToF(dewC);
  if (sum <= HEAT_TABLE[0][0]) return 0;
  for (let i = 1; i < HEAT_TABLE.length; i++) {
    const [x1, y1] = HEAT_TABLE[i];
    const [x0, y0] = HEAT_TABLE[i - 1];
    if (sum <= x1) return y0 + ((sum - x0) / (x1 - x0)) * (y1 - y0);
  }
  return HEAT_TABLE[HEAT_TABLE.length - 1][1];
}

export function heatBand(pct: number): { label: string; advice: string } {
  if (pct <= 0) return { label: "Neutral", advice: "No heat adjustment expected." };
  if (pct < 1) return { label: "Mild", advice: "Minor effect; start on plan, monitor HR drift after halfway." };
  if (pct < 3) return { label: "Warm", advice: "Start 1–3% slower than goal pace, prioritise early fluids and cooling." };
  if (pct < 6) return { label: "Hot", advice: "Re-set the goal: pace by effort/power, expect 3–6% slowdown." };
  return { label: "Severe", advice: "Racing for time is not advised; run for completion and safety." };
}

/** Qualitative wind impact; quantitative wind cost depends on course orientation and drafting. */
export function windBand(kmh: number): { label: string; advice: string } {
  if (kmh < 10) return { label: "Calm", advice: "Negligible wind effect." };
  if (kmh < 20) return { label: "Breezy", advice: "Tuck in behind runners on exposed headwind sections; hold effort, not pace." };
  if (kmh < 30) return { label: "Windy", advice: "Expect noticeable cost into the wind; a tailwind does not fully repay a headwind." };
  return { label: "Very windy", advice: "Pace by power/effort; even pace is no longer even effort." };
}
