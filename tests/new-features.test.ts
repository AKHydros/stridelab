import { zipSync, gzipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { buildFitActivity } from "../scripts/fit-fixture";
import { analyze } from "../src/lib/analysis/analyze";
import { coursePlan } from "../src/lib/analysis/coursePlan";
import { choFraction, simulateFuel } from "../src/lib/analysis/fuel";
import { performanceManager } from "../src/lib/analysis/load";
import { analyzeRecovery, pearson } from "../src/lib/analysis/recovery";
import { TAPER_PRESETS, simulateTaper, suggestTaper } from "../src/lib/analysis/taper";
import { bearingDeg, headwindMps, windCostFactor } from "../src/lib/analysis/wind";
import { demoContext, demoSession } from "../src/lib/demo";
import { parseFit } from "../src/lib/parse/fit";
import { withDistance } from "../src/lib/parse/gpx";
import { dedupe, mergeHistory, readHistoryFiles } from "../src/lib/parse/history";
import { parseRecovery, sleepHours } from "../src/lib/parse/recovery";
import { gridToTable, parseDelimited } from "../src/lib/parse/table";
import type { RecoveryDay, TrainingRecord } from "../src/lib/types";
import { addDays } from "../src/lib/units";

const file = (name: string, data: Uint8Array | string) => new File([typeof data === "string" ? strToU8(data) : data], name);

describe("FIT import (Garmin SDK)", () => {
  const bytes = buildFitActivity({ start: new Date("2026-10-18T08:00:00Z"), km: 3, paceS: 300, hr: 150, power: 260 });
  const f = parseFit("event.fit", bytes);
  it("reads laps, per-second samples, session summary and GPS route", () => {
    expect(f.activity.laps).toHaveLength(3);
    expect(f.activity.laps[0].distanceKm).toBeCloseTo(1, 6);
    expect(f.activity.laps[0].timeS).toBeCloseTo(300, 6);
    expect(f.activity.laps[0].power).toBe(260);
    expect(f.activity.laps[0].cadence).toBe(176); // 88 strides/min → 176 steps/min
    expect(f.activity.samples!.length).toBe(900);
    expect(f.activity.samples![899].timeS).toBe(899);
    expect(f.summary?.distanceKm).toBeCloseTo(3, 6);
    expect(f.summary?.date).toMatch(/^2026-10-1[78]$/);
    expect(f.route?.points.length).toBe(900);
    expect(f.sport).toBe("running");
  });
  it("rejects non-FIT bytes", () => {
    expect(() => parseFit("x.fit", new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});

describe("history: Garmin + Strava, 6 months", () => {
  const stravaCsv = `Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance,Max Heart Rate,Moving Time,Average Heart Rate
1,"Oct 15, 2026, 7:00:00 AM",Easy,Run,2640,8.05,150,2600,140
2,"Oct 16, 2026, 6:00:00 PM",Spin,Ride,3600,30.0,140,3600,120
3,"Jan 2, 2026, 7:00:00 AM",Old run,Run,2400,8.0,150,2400,140`;
  it("reads a Strava bulk-export ZIP via activities.csv", async () => {
    const zip = zipSync({ "export_123/activities.csv": strToU8(stravaCsv) });
    const t = await readHistoryFiles([file("export.zip", zip)], "Strava");
    expect(t.records.map((r) => r.date)).toEqual(["2026-01-02", "2026-10-15"]);
    expect(t.records[1].timeS).toBe(2640);
    expect(t.records[1].avgHr).toBe(140);
    expect(t.records.every((r) => r.source === "Strava")).toBe(true);
  });
  it("reads many FIT (and .fit.gz) files as one history", async () => {
    const a = buildFitActivity({ start: new Date("2026-10-10T12:00:00Z"), km: 2, paceS: 330 });
    const b = buildFitActivity({ start: new Date("2026-10-12T12:00:00Z"), km: 3, paceS: 320 });
    const c = buildFitActivity({ start: new Date("2026-10-13T12:00:00Z"), km: 4, paceS: 120, sport: "cycling" });
    const t = await readHistoryFiles([file("a.fit", a), file("b.fit.gz", gzipSync(b)), file("c.fit", c)], "Garmin Connect");
    expect(t.records.map((r) => r.distanceKm)).toEqual([2, 3]);
    expect(t.warnings.join(" ")).toMatch(/non-running/);
  });
  it("merges duplicates across sources and keeps only 6 months", () => {
    const rec = (date: string, km: number, source: string, extra: Partial<TrainingRecord> = {}): TrainingRecord => ({ date, type: "Running", title: "", distanceKm: km, timeS: km * 300, source, ...extra });
    const garmin = { name: "g", warnings: [], records: [rec("2026-10-15", 8, "Garmin Connect", { avgHr: 140, power: 230 }), rec("2026-03-01", 10, "Garmin Connect")] };
    const strava = { name: "s", warnings: [], records: [rec("2026-10-15", 8.05, "Strava"), rec("2026-10-16", 6, "Strava")] };
    const m = mergeHistory("2026-10-18", garmin, strava);
    expect(m.records).toHaveLength(2);
    const merged = m.records.find((r) => r.date === "2026-10-15")!;
    expect(merged.power).toBe(230);
    expect(merged.source).toBe("Garmin Connect + Strava");
    expect(m.notes.join(" ")).toMatch(/older than 6 months/);
    expect(dedupe([rec("2026-10-15", 8, "a"), rec("2026-10-15", 9, "b")]).merged).toBe(0);
  });
});

describe("recovery", () => {
  it("parses Garmin-style sleep durations and merges HRV + sleep files by date", () => {
    expect(sleepHours("7h 30min")).toBeCloseTo(7.5);
    expect(sleepHours("7:15")).toBeCloseTo(7.25);
    expect(sleepHours(450, "Asleep duration (min)")).toBeCloseTo(7.5);
    expect(sleepHours(27000, "total_sleep_duration")).toBeCloseTo(7.5);
    const hrv = parseRecovery("hrv.csv", gridToTable(parseDelimited("Date,Overnight HRV,Baseline,7d Avg\n2026-10-01,62,55-70,60")));
    expect(hrv.days[0].hrv).toBe(62);
    const whoop = parseRecovery("w.csv", gridToTable(parseDelimited("Cycle start time,Resting heart rate (bpm),Heart rate variability (ms),Asleep duration (min),Sleep performance %,Recovery score %\n2026-10-01 22:00:00,48,70,420,85,77")));
    expect(whoop.days[0]).toMatchObject({ date: "2026-10-01", restingHr: 48, hrv: 70, sleepHours: 7, sleepScore: 85, readiness: 77 });
  });
  it("flags HRV below its normal band and computes correlations", () => {
    const days: RecoveryDay[] = Array.from({ length: 80 }, (_, i) => ({ date: addDays("2026-08-01", i), hrv: i >= 72 ? 40 : 60 + (i % 5), sleepHours: 7.5, restingHr: 50 }));
    const a = analyzeRecovery(days, addDays("2026-08-01", 79), [], []);
    expect(a.points.at(-1)!.status).toBe("Below normal");
    expect(a.points.at(-1)!.light).not.toBe("green");
    expect(a.points[5].status).toBe("Insufficient data");
    expect(pearson([1, 2, 3, 4, 5, 6, 7, 8], [2, 4, 6, 8, 10, 12, 14, 16])).toBeCloseTo(1, 9);
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeUndefined();
  });
});

describe("taper simulator", () => {
  const ctx = { ...demoContext(), thresholdPaceS: 280 };
  const recs: TrainingRecord[] = Array.from({ length: 120 }, (_, i) => ({ date: addDays("2026-06-20", i), type: "Running", title: "", distanceKm: 12, timeS: 12 * 320 }));
  const pmc = performanceManager(recs, { ...ctx, eventDate: "2026-10-17" }).days;
  it("raises race-day form when load is reduced, and lowers fitness", () => {
    const none = simulateTaper(pmc, "2026-10-17", "2026-11-15", { weekPct: [100, 100, 100] });
    const classic = simulateTaper(pmc, "2026-10-17", "2026-11-15", TAPER_PRESETS[0].plan);
    expect(classic.raceDay!.tsb).toBeGreaterThan(none.raceDay!.tsb);
    expect(classic.raceDay!.ctl).toBeLessThan(none.raceDay!.ctl);
    expect(classic.days.at(-1)!.date).toBe("2026-11-15");
  });
  it("suggests a plan landing race-day TSB in +5…+15", () => {
    const plan = suggestTaper(pmc, "2026-10-17", "2026-11-15");
    expect(plan).toBeDefined();
    const r = simulateTaper(pmc, "2026-10-17", "2026-11-15", plan!);
    expect(r.raceDay!.tsb).toBeGreaterThanOrEqual(5);
    expect(r.raceDay!.tsb).toBeLessThanOrEqual(15);
  });
});

describe("carb-load simulator", () => {
  const base = { massKg: 70, loadGPerKg: 5, loadDays: 0, breakfastG: 100, intakeGPerH: 0, paceS: 300, thresholdPaceS: 280 };
  it("loading and in-race carbs push the low-glycogen point later", () => {
    const none = simulateFuel(base);
    const fuelled = simulateFuel({ ...base, loadGPerKg: 10, loadDays: 2, intakeGPerH: 60 });
    expect(fuelled.startG).toBeGreaterThan(none.startG);
    expect(fuelled.lowAtKm ?? 99).toBeGreaterThan(none.lowAtKm ?? 0);
  });
  it("carbohydrate share rises with intensity and is bounded", () => {
    expect(choFraction(300, 280)).toBeGreaterThan(choFraction(360, 280));
    expect(choFraction(200, 280)).toBeLessThanOrEqual(0.95);
  });
});

describe("wind", () => {
  it("computes bearing and headwind sign", () => {
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 6);
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 6);
    expect(headwindMps(36, 0, 0)).toBeGreaterThan(0); // wind from north, running north
    expect(headwindMps(36, 180, 0)).toBeLessThan(0);
  });
  it("headwind costs more than an equal tailwind repays", () => {
    const up = windCostFactor(3.5, 3) - 1;
    const down = 1 - windCostFactor(3.5, -3);
    expect(up).toBeGreaterThan(down);
  });
  it("wind-aware plan slows into-wind kms and still totals the target", () => {
    const north = withDistance(Array.from({ length: 50 }, (_, i) => ({ lat: 40 + i * 0.0045, lon: -75 })));
    const back = withDistance([...north, ...[...north].reverse()]);
    const plan = coursePlan(back, 3600, 1, 1, { speedKmh: 30, fromDeg: 0, exposure: 1 });
    expect(plan[0].paceS).toBeGreaterThan(plan[plan.length - 1].paceS);
    expect(plan.at(-1)!.cumulativeS).toBeCloseTo(3600, 3);
  });
});

describe("demo with six months, two sources and recovery", () => {
  const a = analyze(demoSession());
  it("merges Garmin and Strava and covers ~26 weeks", () => {
    expect(a.training!.sources.some((s) => s.includes("+"))).toBe(true);
    expect(a.training!.weeks.length).toBeGreaterThanOrEqual(26);
  });
  it("runs the recovery analysis and flags the poor final nights", () => {
    expect(a.recovery?.preEvent.sleepAvg).toBeLessThan(6.5);
    expect(a.findings.some((f) => f.area === "Recovery")).toBe(true);
  });
});
