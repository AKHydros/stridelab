import { type Encodable, Encoder, type Mesg, Profile } from "@garmin/fitsdk";

/**
 * Build a small but standards-compliant FIT running activity with Garmin's own
 * encoder: `km` laps of 1 km at `paceS`, 1 Hz records with HR, power, cadence
 * and GPS heading north. Used by tests and the sample-data generator.
 */
export function buildFitActivity(opts: { start: Date; km: number; paceS: number; hr?: number; power?: number; sport?: string }): Uint8Array {
  const { start, km, paceS } = opts;
  const enc = new Encoder();
  const M = Profile.MesgNum;
  const write = (m: Record<string, unknown> & { mesgNum: number }) => enc.writeMesg(m as unknown as Encodable<Mesg>);
  write({ mesgNum: M.FILE_ID, type: "activity", manufacturer: "development", product: 0, timeCreated: start, serialNumber: 1234 });
  const speed = 1000 / paceS;
  let t = 0;
  for (let lap = 0; lap < km; lap++) {
    const lapStart = new Date(start.getTime() + t * 1000);
    let hrSum = 0;
    for (let i = 0; i < paceS; i++, t++) {
      const hr = (opts.hr ?? 150) + Math.round(lap * 1.5);
      hrSum += hr;
      write({
        mesgNum: M.RECORD,
        timestamp: new Date(start.getTime() + t * 1000),
        positionLat: Math.round(((40 + (t * speed) / 111_320) * 2 ** 31) / 180),
        positionLong: Math.round((-75 * 2 ** 31) / 180),
        distance: t * speed,
        enhancedSpeed: speed,
        heartRate: hr,
        cadence: 88,
        power: opts.power ?? 260,
        enhancedAltitude: 100 + 5 * Math.sin(t / 200),
      });
    }
    write({
      mesgNum: M.LAP,
      timestamp: new Date(start.getTime() + t * 1000),
      startTime: lapStart,
      totalElapsedTime: paceS,
      totalTimerTime: paceS,
      totalDistance: 1000,
      avgHeartRate: Math.round(hrSum / paceS),
      maxHeartRate: Math.round(hrSum / paceS) + 3,
      avgCadence: 88,
      avgPower: opts.power ?? 260,
      totalAscent: 3,
      totalDescent: 3,
      sport: opts.sport ?? "running",
    });
  }
  write({
    mesgNum: M.SESSION,
    timestamp: new Date(start.getTime() + t * 1000),
    startTime: start,
    sport: opts.sport ?? "running",
    totalElapsedTime: t,
    totalTimerTime: t,
    totalDistance: km * 1000,
    avgHeartRate: (opts.hr ?? 150) + Math.round(((km - 1) * 1.5) / 2),
    avgCadence: 88,
    avgPower: opts.power ?? 260,
    totalAscent: 3 * km,
  });
  return enc.close();
}

/** Encode lap-level data (e.g. the demo event) as a FIT activity with 1 Hz records. */
export function buildFitFromLaps(start: Date, laps: { distanceKm: number; timeS: number; avgHr?: number; power?: number; cadence?: number; ascentM?: number; descentM?: number }[]): Uint8Array {
  const enc = new Encoder();
  const M = Profile.MesgNum;
  const write = (m: Record<string, unknown> & { mesgNum: number }) => enc.writeMesg(m as unknown as Encodable<Mesg>);
  write({ mesgNum: M.FILE_ID, type: "activity", manufacturer: "development", product: 0, timeCreated: start, serialNumber: 1234 });
  let t = 0;
  let dist = 0;
  let ele = 180;
  for (const l of laps) {
    const lapStart = new Date(start.getTime() + t * 1000);
    const n = Math.round(l.timeS);
    const v = (l.distanceKm * 1000) / l.timeS;
    const dEle = ((l.ascentM ?? 0) - (l.descentM ?? 0)) / n;
    for (let i = 0; i < n; i++, t++) {
      dist += v;
      ele += dEle;
      write({ mesgNum: M.RECORD, timestamp: new Date(start.getTime() + t * 1000), distance: dist, enhancedSpeed: v, heartRate: l.avgHr, cadence: l.cadence ? Math.round(l.cadence / 2) : undefined, power: l.power, enhancedAltitude: ele });
    }
    write({
      mesgNum: M.LAP,
      timestamp: new Date(start.getTime() + t * 1000),
      startTime: lapStart,
      totalElapsedTime: l.timeS,
      totalTimerTime: l.timeS,
      totalDistance: l.distanceKm * 1000,
      avgHeartRate: l.avgHr,
      maxHeartRate: l.avgHr ? l.avgHr + 4 : undefined,
      avgCadence: l.cadence ? Math.round(l.cadence / 2) : undefined,
      avgPower: l.power,
      totalAscent: l.ascentM,
      totalDescent: l.descentM,
      sport: "running",
    });
  }
  write({ mesgNum: M.SESSION, timestamp: new Date(start.getTime() + t * 1000), startTime: start, sport: "running", totalElapsedTime: t, totalTimerTime: t, totalDistance: dist });
  return enc.close();
}
