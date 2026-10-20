/**
 * Wind cost for running. Air resistance is roughly 4% of the energy cost at
 * marathon speeds on still air (Pugh 1971; Davies 1980) and scales with the
 * square of relative air speed. A tailwind returns only about half of what an
 * equal headwind costs, and 10 m forecast wind is reduced to runner height.
 */
export const AIR_SHARE = 0.04;
export const HEIGHT_FACTOR = 0.6;

export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

/** Headwind component (m/s, positive = into the runner). `fromDeg` is meteorological (where wind comes from). */
export function headwindMps(windKmh: number, fromDeg: number, headingDeg: number, exposure = 1): number {
  const w = (windKmh / 3.6) * HEIGHT_FACTOR * exposure;
  return w * Math.cos(((fromDeg - headingDeg) * Math.PI) / 180);
}

/** Multiplicative energy-cost factor for running at `speedMps` into a headwind. */
export function windCostFactor(speedMps: number, headwind: number): number {
  const rel = speedMps + headwind;
  const extra = AIR_SHARE * ((rel * Math.abs(rel) - speedMps * speedMps) / (speedMps * speedMps));
  return 1 + (extra < 0 ? extra * 0.5 : extra);
}
