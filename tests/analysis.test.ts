import { describe, expect, it } from "vitest";
import { slice, summarize } from "../src/lib/analysis/aggregate";
import { analyze } from "../src/lib/analysis/analyze";
import { crossCheck } from "../src/lib/analysis/commentary";
import { coursePlan } from "../src/lib/analysis/coursePlan";
import { dewPointC, gapFactor, heatSlowdownPct } from "../src/lib/analysis/environment";
import { analyzePacing, fiveKmSegments } from "../src/lib/analysis/pacing";
import { decoupling } from "../src/lib/analysis/physiology";
import { alignPower, normalizedPower } from "../src/lib/analysis/power";
import { MARATHON_KM, riegel } from "../src/lib/analysis/readiness";
import { preEventWindows, tagRecords, weeklyVolume } from "../src/lib/analysis/training";
import { demoSession } from "../src/lib/demo";
import { withDistance } from "../src/lib/parse/gpx";
import type { Lap, TrainingRecord } from "../src/lib/types";

const lap = (distanceKm: number, timeS: number, extra: Partial<Lap> = {}): Lap => ({ index: 0, distanceKm, timeS, ...extra });

describe("aggregate", () => {
  it("computes pace as total time ÷ total distance, not mean lap pace", () => {
    const s = summarize([lap(1, 300), lap(0.2, 50)]);
    expect(s.paceS).toBeCloseTo(350 / 1.2, 6);
    // Naive mean of lap paces would be (300 + 250) / 2 = 275.
    expect(s.paceS).not.toBeCloseTo(275, 0);
  });

  it("time-weights heart rate and reports coverage", () => {
    const s = summarize([lap(1, 300, { avgHr: 150 }), lap(1, 100, { avgHr: 170 }), lap(1, 100)]);
    expect(s.avgHr).toBeCloseTo((150 * 300 + 170 * 100) / 400, 6);
    expect(s.hrCoverage).toBeCloseTo(0.8, 6);
  });

  it("slices laps proportionally and flags the approximation", () => {
    const r = slice([lap(1, 300), lap(1, 320)], 0.5, 1.5);
    expect(r.approximated).toBe(true);
    expect(summarize(r.laps).timeS).toBeCloseTo(150 + 160, 6);
  });
});

describe("pacing", () => {
  const fade = Array.from({ length: 30 }, (_, i) => lap(1, 300 + (i >= 20 ? (i - 19) * 3 : 0)));
  it("reports positive drift when the final third is slower", () => {
    const p = analyzePacing(fade);
    expect(p.driftPct).toBeGreaterThan(0);
    expect(p.splitType).toBe("Positive split");
  });
  it("reports negative drift when the final third is faster", () => {
    const neg = Array.from({ length: 30 }, (_, i) => lap(1, 310 - i));
    expect(analyzePacing(neg).driftPct).toBeLessThan(0);
    expect(analyzePacing(neg).splitType).toBe("Negative split");
  });
  it("builds 5 km blocks with the remainder last", () => {
    const segs = fiveKmSegments([...Array.from({ length: 26 }, () => lap(1, 300)), lap(0.2, 60)]);
    expect(segs.map((s) => s.label)).toEqual(["0–5 km", "5–10 km", "10–15 km", "15–20 km", "20–25 km", "25–26.2 km"]);
    expect(segs.reduce((a, s) => a + s.distanceKm, 0)).toBeCloseTo(26.2, 6);
  });
});

describe("physiology", () => {
  it("returns zero decoupling for constant pace and HR", () => {
    const d = decoupling(Array.from({ length: 20 }, () => lap(1, 300, { avgHr: 150 })), "pace");
    expect(d.available).toBe(true);
    expect(d.pct).toBeCloseTo(0, 6);
  });
  it("detects positive decoupling when HR rises at constant pace", () => {
    const d = decoupling(Array.from({ length: 20 }, (_, i) => lap(1, 300, { avgHr: i < 10 ? 150 : 160 })), "pace");
    expect(d.pct).toBeCloseTo(((1 / 150 - 1 / 160) / (1 / 150)) * 100, 4);
  });
  it("refuses short activities", () => {
    expect(decoupling([lap(5, 1500, { avgHr: 150 })], "pace").available).toBe(false);
  });
});

describe("power", () => {
  it("normalised power equals average power for a constant signal", () => {
    const samples = Array.from({ length: 600 }, (_, i) => ({ timeS: i, power: 250 }));
    expect(normalizedPower(samples)).toBeCloseTo(250, 6);
  });
  it("matches Stryd laps one-to-one when structures agree", () => {
    const g = [lap(1, 300), lap(1, 300)];
    const a = alignPower(g, { name: "s", laps: [lap(1.01, 300, { power: 250 }), lap(1.0, 300, { power: 260 })], samples: [], warnings: [] });
    expect(a.source).toBe("stryd-laps");
    expect(a.laps.map((l) => l.power)).toEqual([250, 260]);
  });
});

describe("training", () => {
  const rec = (date: string, km: number): TrainingRecord => ({ date, type: "Running", title: "", distanceKm: km, timeS: km * 330 });
  const records = [rec("2026-09-14", 10), rec("2026-10-11", 20), rec("2026-10-15", 8), rec("2026-10-18", 26.2), rec("2026-10-18", 5.0)];
  it("tags event and additional run instead of double-counting", () => {
    const t = tagRecords(records, "2026-10-18", { distanceKm: 26.21, timeS: 7800 }, { distanceKm: 5.02, timeS: 1700 });
    expect(t.records.filter((r) => r.role === "event")).toHaveLength(1);
    expect(t.records.filter((r) => r.role === "additional")).toHaveLength(1);
    expect(t.records).toHaveLength(5);
  });
  it("computes 7/14/28-day pre-event windows excluding the event day", () => {
    const t = tagRecords(records, "2026-10-18", { distanceKm: 26.2, timeS: 7800 }, { distanceKm: 5, timeS: 1700 });
    const w = preEventWindows(t.records, "2026-10-18");
    expect(w.find((x) => x.days === 7)?.km).toBe(28);
    expect(w.find((x) => x.days === 28)?.km).toBe(28);
    expect(w.find((x) => x.days === 28)?.status).toBe("Complete");
    const late = preEventWindows(t.records.filter((r) => r.date >= "2026-10-11"), "2026-10-18");
    expect(late.find((x) => x.days === 28)?.status).toBe("Partial");
  });
  it("buckets Monday-start weeks and separates event volume", () => {
    const t = tagRecords(records, "2026-10-18", { distanceKm: 26.2, timeS: 7800 }, { distanceKm: 5, timeS: 1700 });
    const weeks = weeklyVolume(t.records, "2026-10-18");
    const last = weeks[weeks.length - 1];
    expect(last.weekStart).toBe("2026-10-12");
    expect(last.eventKm).toBeCloseTo(26.2);
    expect(last.additionalKm).toBeCloseTo(5);
    expect(last.trainingKm).toBe(8);
  });
});

describe("environment & readiness", () => {
  it("Riegel is identity at equal distance and grows with distance", () => {
    expect(riegel(3600, 10, 10)).toBeCloseTo(3600, 6);
    expect(riegel(3600, 10, MARATHON_KM)).toBeGreaterThan(3600 * 4.2195);
  });
  it("heat model is zero in cool, dry conditions and grows with heat", () => {
    expect(heatSlowdownPct(10, 2)).toBe(0);
    expect(heatSlowdownPct(28, 20)).toBeGreaterThan(heatSlowdownPct(22, 14));
  });
  it("dew point equals temperature at 100% humidity", () => {
    expect(dewPointC(20, 100)).toBeCloseTo(20, 1);
  });
  it("uphill costs more than flat", () => {
    expect(gapFactor(0)).toBeCloseTo(1, 6);
    expect(gapFactor(0.05)).toBeGreaterThan(1.2);
  });
  it("course plan splits sum to the target time", () => {
    const pts = withDistance(Array.from({ length: 200 }, (_, i) => ({ lat: 40 + i * 0.0009, lon: -75, eleM: 50 + 20 * Math.sin(i / 20) })));
    const plan = coursePlan(pts, 3600, 0.8);
    expect(plan[plan.length - 1].cumulativeS).toBeCloseTo(3600, 3);
  });
});

describe("commentary", () => {
  it("classifies a strain note supported by slower pace and higher HR", () => {
    const laps = Array.from({ length: 10 }, (_, i) => lap(1, i === 8 ? 330 : 300, { avgHr: i === 8 ? 165 : 150, note: i === 8 ? "Legs heavy, really struggling" : undefined }));
    const items = crossCheck(laps, [], "");
    expect(items[0].sentiment).toBe("strain");
    expect(items[0].support).toBe("Supports");
  });
});

describe("end-to-end on demo data", () => {
  const a = analyze(demoSession());
  it("keeps event, additional run and combined totals separate", () => {
    expect(a.event?.summary.distanceKm).toBeCloseTo(26.2, 6);
    expect(a.extra?.summary.distanceKm).toBeCloseTo(5.02, 6);
    expect(a.combined?.distanceKm).toBeCloseTo(31.22, 6);
  });
  it("produces at most five prioritised findings", () => {
    expect(a.findings.length).toBeGreaterThan(0);
    expect(a.findings.length).toBeLessThanOrEqual(5);
    expect(a.findings.map((f) => f.priority)).toEqual(a.findings.map((_, i) => i + 1));
  });
  it("lists no more than five data gaps", () => {
    expect(a.dataGaps.length).toBeLessThanOrEqual(5);
  });
});
