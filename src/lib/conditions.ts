import { dewPointC, heatSlowdownPct } from "./analysis/environment";

export interface Conditions {
  tempC: number;
  rh: number;
  windKmh: number;
  /** Direction the wind blows FROM, degrees (meteorological). */
  windDirDeg: number;
  source: string;
  place?: string;
}

export const DEFAULT_CONDITIONS: Conditions = { tempC: 12, rh: 65, windKmh: 10, windDirDeg: 270, source: "Manual entry" };

export function heatAdjustment(c: Conditions) {
  const dew = dewPointC(c.tempC, c.rh);
  return { dewC: dew, pct: heatSlowdownPct(c.tempC, dew) };
}
