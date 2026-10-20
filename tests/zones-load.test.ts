import { describe, expect, it } from "vitest";
import { analyze } from "../src/lib/analysis/analyze";
import { bestEfforts, fitCriticalPower, meanMaxPower, performanceManager, rTSS, trimp, wPrimeBalance } from "../src/lib/analysis/load";
import { hrZones, paceZones, powerZones, timeInZone, zoneOf } from "../src/lib/analysis/zones";
import { demoContext, demoSession } from "../src/lib/demo";
import type { Lap } from "../src/lib/types";

const lap = (distanceKm: number, timeS: number, extra: Partial<Lap> = {}): Lap => ({ index: 0, distanceKm, timeS, ...extra });

describe("zones", () => {
  it("builds Stryd power zones from CP", () => {
    const z = powerZones(300);
    expect(zoneOf(z, 230)?.id).toBe("Z1");
    expect(zoneOf(z, 255)?.id).toBe("Z2");
    expect(zoneOf(z, 299)?.id).toBe("Z3");
    expect(zoneOf(z, 320)?.id).toBe("Z4");
    expect(zoneOf(z, 400)?.id).toBe("Z5");
  });
  it("prefers LTHR, then HRR, then HRmax — and never invents zones", () => {
    expect(hrZones({ lthr: 170 })?.basis).toMatch(/LTHR/);
    expect(hrZones({ maxHr: 190, restHr: 50 })?.basis).toMatch(/HRR/);
    expect(hrZones({ maxHr: 190 })?.basis).toMatch(/HRmax/);
    expect(hrZones({})).toBeUndefined();
  });
  it("puts slower paces in lower pace zones", () => {
    const z = paceZones(280);
    expect(zoneOf(z, 400)?.id).toBe("Z1");
    expect(zoneOf(z, 300)?.id).toBe("Z3");
    expect(zoneOf(z, 270)?.id).toBe("Z5");
  });
  it("time in zone sums to covered time", () => {
    const tiz = timeInZone(powerZones(300), [lap(1, 300, { power: 230 }), lap(1, 280, { power: 290 }), lap(1, 290)])!;
    expect(tiz.coveredS).toBe(580);
    expect(tiz.rows.reduce((a, r) => a + r.seconds, 0)).toBe(580);
    expect(tiz.rows.reduce((a, r) => a + r.pct, 0)).toBeCloseTo(100, 6);
  });
});

describe("load & curves", () => {
  it("rTSS is 100 for one hour at threshold pace", () => {
    expect(rTSS(3600, 3600 / 280, 280)).toBeCloseTo(100, 6);
  });
  it("TRIMP grows with intensity", () => {
    expect(trimp(3600, 170, 50, 190)).toBeGreaterThan(trimp(3600, 140, 50, 190));
  });
  it("PMC: CTL responds slower than ATL; TSB is yesterday's CTL − ATL", () => {
    const ctx = { ...demoContext(), eventDate: "2026-01-10", thresholdPaceS: 280 };
    const recs = Array.from({ length: 10 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, type: "Running", title: "", distanceKm: 10, timeS: 3000 }));
    const p = performanceManager(recs, ctx);
    const last = p.days[p.days.length - 1];
    const prev = p.days[p.days.length - 2];
    expect(last.atl).toBeGreaterThan(last.ctl);
    expect(last.tsb).toBeCloseTo(prev.ctl - prev.atl, 9);
  });
  it("best efforts find the fastest continuous span", () => {
    const laps = [lap(1, 300), lap(1, 280), lap(1, 320)];
    const [k1] = bestEfforts(laps, [{ label: "1 km", km: 1 }]);
    expect(k1.timeS).toBeCloseTo(280, 6);
    expect(bestEfforts(laps, [{ label: "10 km", km: 10 }])[0].timeS).toBeUndefined();
  });
  it("mean-max power is non-increasing with duration", () => {
    const s = Array.from({ length: 2000 }, (_, i) => ({ timeS: i, power: 250 + (i % 300 < 60 ? 120 : 0) }));
    const m = meanMaxPower(s);
    for (let i = 1; i < m.length; i++) expect(m[i].power).toBeLessThanOrEqual(m[i - 1].power + 1e-9);
  });
  it("recovers CP and W′ from ideal hyperbolic data and rejects flat data", () => {
    const pts = [180, 300, 600, 900, 1200].map((t) => ({ durationS: t, power: 280 + 18000 / t }));
    const fit = fitCriticalPower(pts);
    expect(fit.cp).toBeCloseTo(280, 6);
    expect(fit.wPrimeJ).toBeCloseTo(18000, 3);
    expect(fitCriticalPower([180, 300, 600, 1200].map((t) => ({ durationS: t, power: 270 }))).available).toBe(false);
    expect(fitCriticalPower([180, 300, 600, 1200].map((t) => ({ durationS: t, power: 280 + 5000 / t }))).available).toBe(false);
  });
  it("W′ balance depletes above CP and recovers below, never exceeding W′", () => {
    const w = wPrimeBalance([{ dt: 60, power: 400 }, { dt: 600, power: 200 }], 300, 20000);
    expect(w[1].wbal).toBeCloseTo(20000 - 6000, 6);
    expect(w[2].wbal).toBeLessThanOrEqual(20000);
    expect(w[2].wbal).toBeGreaterThan(w[1].wbal);
  });
});

describe("demo analysis includes zones and load", () => {
  const a = analyze(demoSession());
  it("has all three zone systems and sample-based time in zone", () => {
    expect(a.zones.power && a.zones.hr && a.zones.pace).toBeTruthy();
    expect(a.zones.event.power?.method).toMatch(/per-second/);
  });
  it("has a PMC, best efforts, a W′ balance trace and an honest CP-fit result", () => {
    expect(a.load.pmc?.days.length).toBeGreaterThan(40);
    expect(a.load.bestEfforts.find((b) => b.label === "10 km")?.timeS).toBeDefined();
    expect(a.load.wbal?.minJ).toBeLessThan(16500);
    expect(typeof a.load.cpFit.available).toBe("boolean");
  });
});
