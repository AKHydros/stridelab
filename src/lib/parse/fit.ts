import { Decoder, Stream } from "@garmin/fitsdk";
import type { ActivityFile, Lap, RouteFile, Sample, TrainingRecord } from "../types";
import { withDistance } from "./gpx";

const SEMI = 180 / 2 ** 31;
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 19) : undefined);
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
/** Garmin logs running cadence in strides/min (+ a fractional part); report steps/min. */
const spm = (c: unknown, frac: unknown) => (num(c) !== undefined ? Math.round((num(c)! + (num(frac) ?? 0)) * 2) : undefined);

export interface FitActivity {
  activity: ActivityFile;
  summary?: TrainingRecord;
  route?: RouteFile;
  sport?: string;
}

/** Decode a FIT activity with Garmin's official SDK. */
export function parseFit(name: string, bytes: Uint8Array): FitActivity {
  const stream = Stream.fromByteArray(Array.from(bytes));
  if (!Decoder.isFIT(stream)) throw new Error(`${name} is not a FIT file.`);
  const decoder = new Decoder(stream);
  const { messages, errors } = decoder.read({ convertDateTimesToDates: true, convertTypesToStrings: true, applyScaleAndOffset: true, expandComponents: true, mergeHeartRates: true });
  const warnings = errors.map((e) => `FIT decode: ${e.message}`);
  const records = messages.recordMesgs ?? [];
  const t0 = records.find((r) => r.timestamp instanceof Date)?.timestamp as Date | undefined;

  const samples: Sample[] = records
    .filter((r) => r.timestamp instanceof Date)
    .map((r) => ({
      timeS: ((r.timestamp as Date).getTime() - (t0?.getTime() ?? 0)) / 1000,
      distanceKm: num(r.distance) !== undefined ? num(r.distance)! / 1000 : undefined,
      speedMps: num(r.enhancedSpeed) ?? num(r.speed),
      hr: num(r.heartRate),
      power: num(r.power),
      cadence: spm(r.cadence, r.fractionalCadence),
      elevationM: num(r.enhancedAltitude) ?? num(r.altitude),
      gctMs: num(r.stanceTime),
    }));

  const laps: Lap[] = (messages.lapMesgs ?? [])
    .map((l, i) => ({
      index: i + 1,
      distanceKm: (num(l.totalDistance) ?? 0) / 1000,
      timeS: num(l.totalTimerTime) ?? num(l.totalElapsedTime) ?? 0,
      movingTimeS: num(l.totalTimerTime),
      avgHr: num(l.avgHeartRate),
      maxHr: num(l.maxHeartRate),
      cadence: spm(l.avgRunningCadence ?? l.avgCadence, l.avgFractionalCadence),
      power: num(l.avgPower),
      ascentM: num(l.totalAscent),
      descentM: num(l.totalDescent),
      temperatureC: num(l.avgTemperature),
    }))
    .filter((l) => l.distanceKm > 0 && l.timeS > 0);
  if (!laps.length && samples.length) warnings.push("No lap messages in the FIT file; using the whole activity as one lap.");

  const pts = records
    .filter((r) => num(r.positionLat) !== undefined && num(r.positionLong) !== undefined)
    .map((r) => ({ lat: num(r.positionLat)! * SEMI, lon: num(r.positionLong)! * SEMI, eleM: num(r.enhancedAltitude) ?? num(r.altitude), time: iso(r.timestamp), hr: num(r.heartRate) }));

  const s = messages.sessionMesgs?.[0];
  const start = (s?.startTime as Date | undefined) ?? t0;
  const total = laps.length
    ? { d: laps.reduce((a, l) => a + l.distanceKm, 0), t: laps.reduce((a, l) => a + l.timeS, 0) }
    : { d: num(s?.totalDistance) !== undefined ? num(s?.totalDistance)! / 1000 : samples.at(-1)?.distanceKm ?? 0, t: num(s?.totalTimerTime) ?? samples.at(-1)?.timeS ?? 0 };
  const finalLaps = laps.length ? laps : total.d > 0 ? [{ index: 1, distanceKm: total.d, timeS: total.t, avgHr: num(s?.avgHeartRate), power: num(s?.avgPower) }] : [];
  const sport = typeof s?.sport === "string" ? s.sport : undefined;

  return {
    sport,
    activity: { name, laps: finalLaps, samples, startTime: start ? iso(start) : undefined, looseNotes: [], warnings },
    route: pts.length > 1 ? { name, points: withDistance(pts) } : undefined,
    summary:
      start && total.d > 0
        ? {
            date: localDate(start),
            dateTime: iso(start),
            type: sport ?? "running",
            title: name.replace(/\.(fit|fit\.gz)$/i, ""),
            distanceKm: num(s?.totalDistance) !== undefined ? num(s?.totalDistance)! / 1000 : total.d,
            timeS: num(s?.totalElapsedTime) ?? total.t,
            movingTimeS: num(s?.totalTimerTime),
            avgHr: num(s?.avgHeartRate),
            maxHr: num(s?.maxHeartRate),
            cadence: spm(s?.avgRunningCadence ?? s?.avgCadence, s?.avgFractionalCadence),
            power: num(s?.avgPower),
            ascentM: num(s?.totalAscent),
          }
        : undefined,
  };
}
