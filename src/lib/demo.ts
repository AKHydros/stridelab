import { withDistance } from "./parse/gpx";
import type { AthleteContext, Lap, RecoveryDay, SessionData, TrainingRecord } from "./types";
import { addDays } from "./units";

/**
 * SYNTHETIC demo data — invented for illustration only, not any athlete's
 * real results. Deterministic so screenshots and tests are reproducible.
 */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export const DEMO_EVENT_DATE = "2026-10-18";

export function demoContext(): AthleteContext {
  return {
    athleteName: "Demo Runner",
    eventName: "Autumn 26.2K (demo)",
    eventDate: DEMO_EVENT_DATE,
    plannedTotalKm: 31.2,
    marathonDate: "2026-11-15",
    goalPaceS: 298,
    criticalPowerW: 285,
    maxHr: 186,
    restHr: 48,
    weightKg: 70,
    lthr: 170,
    thresholdPaceS: 281,
    wPrimeJ: 16500,
    gapMinutes: 12,
    warmupNote: "Walked ~1 mile and did brief dynamic stretching; no running warm-up due to time constraints at the start.",
    observations: "",
  };
}

export function demoSession(): SessionData {
  const r = rng(42);
  const laps: Lap[] = [];
  const notes: Record<number, string> = {
    3: "Settling in after a cold start, breathing felt high for the effort",
    14: "Feeling smooth and controlled through halfway",
    22: "Legs getting heavy, had to dig in mentally and stop checking the watch",
    26: "Pushed the final stretch, felt better once I could see the finish",
  };
  for (let k = 1; k <= 27; k++) {
    const dist = k === 27 ? 0.2 : 1;
    const hill = Math.sin(k / 3.1) * 9;
    // Cold start, settle, gentle late fade, final push.
    const base = k <= 2 ? 306 : k <= 18 ? 299 : k <= 25 ? 299 + (k - 18) * 2.6 : 300;
    const pace = base + hill * 0.6 + (r() - 0.5) * 4;
    const hr = 142 + Math.min(k, 6) * 2.2 + Math.max(0, k - 12) * 0.85 + (r() - 0.5) * 2;
    laps.push({
      index: k,
      distanceKm: dist,
      timeS: pace * dist,
      movingTimeS: pace * dist - (k === 9 || k === 18 ? 4 : 0),
      avgHr: Math.round(hr),
      maxHr: Math.round(hr + 4),
      cadence: Math.round(178 - Math.max(0, k - 16) * 0.5 + (r() - 0.5) * 2),
      power: Math.round(262 + hill * 1.6 - Math.max(0, k - 20) * 1.1 + (r() - 0.5) * 4),
      ascentM: Math.max(0, Math.round((hill * 1.2 + 3) * dist)),
      descentM: Math.max(0, Math.round((-hill * 1.2 + 3) * dist)),
      gctMs: Math.round(232 + Math.max(0, k - 16) * 1.2),
      strideM: Number((((1000 / pace) * 60) / 178).toFixed(2)),
      note: notes[k],
    });
  }
  // Synthetic 1 Hz Stryd stream consistent with the laps (for curves and W′ balance).
  const samples = [];
  let t = 0;
  let dist = 0;
  for (const l of laps) {
    const n = Math.round(l.timeS);
    for (let i = 0; i < n; i++) {
      const surge = (l.index === 5 || l.index === 26) && i < 60 ? 70 : 0;
      samples.push({
        timeS: t++,
        power: Math.round((l.power ?? 250) + 6 * Math.sin(t / 9) + (r() - 0.5) * 10 + surge),
        distanceKm: (dist += (l.distanceKm * 1.006) / n),
        hr: l.avgHr,
      });
    }
  }
  const strydLaps = laps.map((l) => ({ ...l, distanceKm: l.distanceKm * 1.006, formPower: Math.round((l.power ?? 0) * 0.235), lss: 10.8 - Math.max(0, l.index - 18) * 0.04, note: undefined }));
  const cooldown: Lap[] = [0, 1, 2, 3, 4].map((i) => ({
    index: i + 1,
    distanceKm: i === 4 ? 1.02 : 1,
    timeS: (338 - i * 3 + (r() - 0.5) * 6) * (i === 4 ? 1.02 : 1),
    avgHr: Math.round(146 + i * 1.5),
    maxHr: Math.round(151 + i * 1.5),
    cadence: 171,
    power: 228,
    ascentM: 4,
    descentM: 4,
  }));
  // 26 weeks of progressive build with a cut-back every fourth week.
  const training: TrainingRecord[] = [];
  const strava: TrainingRecord[] = [];
  const dayLoad = new Map<string, number>();
  for (let d = 182; d >= 1; d--) {
    const date = addDays(DEMO_EVENT_DATE, -d);
    const dow = new Date(date + "T00:00:00Z").getUTCDay();
    const week = Math.floor((182 - d) / 7);
    const build = (0.72 + 0.28 * Math.min(1, week / 18)) * (week % 4 === 3 ? 0.75 : 1);
    const fitness = Math.min(1, week / 22);
    let km = 0;
    let pace = 336 - 10 * fitness;
    let title = "Easy run";
    let hr = 147 - 7 * fitness;
    if (dow === 0) {
      km = Math.round((17 + 13 * Math.min(1, week / 20)) * (week % 4 === 3 ? 0.8 : 1));
      pace = 322 - 10 * fitness;
      title = "Long run";
      hr = 149 - 6 * fitness;
    } else if (dow === 2) {
      km = Math.round(10 + 3 * build);
      pace = 300 - 9 * fitness;
      title = "Tempo / marathon pace";
      hr = 162 - 4 * fitness;
    } else if (dow === 4) {
      km = Math.round(8 + 3 * build);
      pace = 306 - 8 * fitness;
      title = "Progression";
      hr = 156 - 4 * fitness;
    } else if (dow === 6 || dow === 3) {
      km = Math.round(7 + 2 * build);
    }
    if (!km) continue;
    const rec: TrainingRecord = { date, dateTime: date + "T07:00:00", type: "Running", title, distanceKm: km, timeS: km * pace, avgHr: Math.round(hr + (r() - 0.5) * 3), cadence: 174, power: Math.round(pace < 305 ? 262 : 228) };
    dayLoad.set(date, (km * pace) / 3600 * (281 / pace) ** 2 * 100);
    // Garmin was not worn for two weeks mid-block; Strava (phone) has those runs.
    if (d > 100 || d < 86) training.push(rec);
    if (d <= 120) strava.push({ ...rec, distanceKm: +(km * 1.008).toFixed(2), title: rec.title + " (Strava)", cadence: undefined, power: undefined });
  }
  const eventTime = laps.reduce((a, l) => a + l.timeS, 0);
  training.push({ date: DEMO_EVENT_DATE, dateTime: DEMO_EVENT_DATE + "T08:00:00", type: "Running", title: "Autumn 26.2K", distanceKm: 26.2, timeS: eventTime, avgHr: 155 });
  training.push({ date: DEMO_EVENT_DATE, dateTime: DEMO_EVENT_DATE + "T10:30:00", type: "Running", title: "Cool down", distanceKm: 5.02, timeS: cooldown.reduce((a, l) => a + l.timeS, 0), avgHr: 149 });

  // Overnight recovery: HRV dips the morning after heavy days; poor sleep before the event.
  const recovery: RecoveryDay[] = [];
  for (let d = 182; d >= 0; d--) {
    const date = addDays(DEMO_EVENT_DATE, -d);
    const prevLoad = dayLoad.get(addDays(date, -1)) ?? 0;
    const trend = 0.12 * Math.min(1, (182 - d) / 150);
    const preEvent = d >= 1 && d <= 3;
    const ln = Math.log(58) + trend - 0.0016 * prevLoad - (preEvent ? 0.14 : 0) + (r() - 0.5) * 0.16;
    const sleep = preEvent ? 5.8 + r() * 0.5 : 7.1 + (r() - 0.45) * 1.2;
    recovery.push({
      date,
      hrv: Math.round(Math.exp(ln)),
      restingHr: Math.round(50 - 3 * Math.min(1, (182 - d) / 150) + (prevLoad > 110 ? 2 : 0) + (preEvent ? 3 : 0) + (r() - 0.5) * 2),
      sleepHours: +sleep.toFixed(2),
      sleepScore: Math.round(Math.max(30, Math.min(98, 55 + (sleep - 6) * 14 + (r() - 0.5) * 8))),
    });
  }

  // Synthetic 26.2 km out-and-back loop with rolling elevation.
  const pts = [];
  const lat0 = 41.8781;
  const lon0 = -87.6298;
  const n = 900;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push({
      lat: lat0 + 0.055 * Math.sin(t) + 0.012 * Math.sin(3 * t),
      lon: lon0 + 0.06 * (1 - Math.cos(t)) + 0.01 * Math.sin(2 * t),
      eleM: 180 + 12 * Math.sin(t * 2.3) + 5 * Math.sin(t * 7),
    });
  }
  const route = withDistance(pts);
  const scale = 26.2 / route[route.length - 1].distKm;
  route.forEach((p) => (p.distKm *= scale));

  return {
    context: demoContext(),
    isDemo: true,
    event: { name: "demo-event-splits.csv", laps, looseNotes: [], warnings: [], deviceSummary: { distanceKm: 26.2 } },
    cooldown: { name: "demo-cooldown-splits.csv", laps: cooldown, looseNotes: [], warnings: [] },
    stryd: { name: "demo-stryd.csv", laps: strydLaps, samples, criticalPowerW: 285, warnings: [] },
    training: { name: "demo-garmin-activities.csv", records: training.map((x) => ({ ...x, source: "Garmin Connect" })), warnings: [] },
    strava: { name: "demo-strava-export.zip", records: strava.map((x) => ({ ...x, source: "Strava" })), warnings: [] },
    recovery: { name: "demo-hrv-sleep.csv", days: recovery, warnings: [] },
    route: { name: "demo-route.gpx", points: route },
  };
}
