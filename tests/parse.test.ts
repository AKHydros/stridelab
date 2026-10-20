import { describe, expect, it } from "vitest";
import { parseLapTable } from "../src/lib/parse/laps";
import { parseStryd } from "../src/lib/parse/stryd";
import { gridToTable, parseDelimited } from "../src/lib/parse/table";
import { parseTraining } from "../src/lib/parse/training";
import { parseDuration, fmtPace } from "../src/lib/units";

describe("units", () => {
  it("parses durations", () => {
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("5:07.5")).toBe(307.5);
    expect(parseDuration("--")).toBeUndefined();
  });
  it("formats pace without 60-second rollover bugs", () => {
    expect(fmtPace(299.7)).toBe("5:00/km");
  });
});

const garmin = `Laps,Time,Cumulative Time,Distance,Avg Pace,Avg HR,Max HR,Total Ascent,Total Descent,Avg Power,Avg Run Cadence,Notes
1,5:05,5:05,1.00,5:05,141,150,4,2,258,176,
2,4:59,10:04,1.00,4:59,148,152,1,3,262,178,Feeling good
3,1:00,11:04,0.20,5:00,150,151,0,0,260,178,Legs heavy at the end
Summary,11:04,11:04,2.20,5:02,147,152,5,5,260,177,`;

describe("Garmin split parser", () => {
  const f = parseLapTable("g.csv", gridToTable(parseDelimited(garmin)));
  it("reads laps and skips the summary row", () => {
    expect(f.laps).toHaveLength(3);
    expect(f.deviceSummary?.distanceKm).toBeCloseTo(2.2);
    expect(f.laps[0].timeS).toBe(305);
    expect(f.laps[1].avgHr).toBe(148);
    expect(f.laps[1].power).toBe(262);
  });
  it("attaches notes to laps", () => {
    expect(f.laps[2].note).toBe("Legs heavy at the end");
  });
  it("converts miles", () => {
    const mi = parseLapTable("m.csv", gridToTable(parseDelimited(`Split,Time,Distance (mi),Avg Pace (/mi)\n1,8:00,1.00,8:00`)));
    expect(mi.laps[0].distanceKm).toBeCloseTo(1.609344, 5);
  });
  it("skips a title row above the headers", () => {
    const t = gridToTable(parseDelimited(`My Sunday race splits,,\nLaps,Time,Distance\n1,5:00,1.0`));
    expect(t.headers).toEqual(["Laps", "Time", "Distance"]);
  });
});

describe("Stryd parser", () => {
  it("detects per-second samples and metres", () => {
    const rows = ["Timestamp,Stryd Distance (meters),Watts,Heart Rate"];
    for (let i = 0; i < 200; i++) rows.push(`${1700000000 + i},${i * 3.3},${250 + (i % 5)},150`);
    const s = parseStryd("s.csv", gridToTable(parseDelimited(rows.join("\n"))));
    expect(s.samples).toHaveLength(200);
    expect(s.samples[199].distanceKm).toBeCloseTo(0.6567, 3);
    expect(s.samples[199].timeS).toBe(199);
  });
  it("finds CP in a title row", () => {
    const s = parseStryd("s.csv", gridToTable(parseDelimited(`Stryd export CP: 285 W,,\nLap,Time,Distance,Power\n1,5:00,1.0,260`)));
    expect(s.criticalPowerW).toBe(285);
    expect(s.laps[0].power).toBe(260);
  });
});

describe("training parser", () => {
  it("reads Garmin activities and excludes non-running", () => {
    const csv = `Activity Type,Date,Title,Distance,Time,Avg HR
Running,2026-10-15 07:00:00,Easy,8.00,00:44:00,140
Cycling,2026-10-16 07:00:00,Ride,30.00,01:00:00,130
Running,2026-10-18 08:00:00,Race,26.20,02:12:00,156`;
    const t = parseTraining("a.csv", gridToTable(parseDelimited(csv)));
    expect(t.records).toHaveLength(2);
    expect(t.records[0].date).toBe("2026-10-15");
    expect(t.records[1].timeS).toBe(7920);
    expect(t.warnings.join(" ")).toMatch(/non-running/);
  });
});
