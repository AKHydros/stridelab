import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze } from "../src/lib/analysis/analyze";
import { demoContext } from "../src/lib/demo";
import { parseLapTable } from "../src/lib/parse/laps";
import { parseStryd } from "../src/lib/parse/stryd";
import { gridToTable, parseDelimited } from "../src/lib/parse/table";
import { parseTraining } from "../src/lib/parse/training";

const table = (f: string) => gridToTable(parseDelimited(readFileSync(new URL(`../sample-data/${f}`, import.meta.url), "utf8")));

describe("bundled sample files (synthetic, Garmin/Stryd export layout)", () => {
  const session = {
    context: demoContext(),
    event: parseLapTable("1", table("1-garmin-event-splits.csv")),
    stryd: parseStryd("2", table("2-stryd-laps.csv")),
    training: parseTraining("3", table("3-garmin-activities.csv")),
    cooldown: parseLapTable("4", table("4-garmin-cooldown-5k-splits.csv")),
  };
  const a = analyze(session);

  it("parses every file", () => {
    expect(session.event.laps).toHaveLength(27);
    expect(session.event.deviceSummary).toBeDefined();
    expect(session.stryd.criticalPowerW).toBe(285);
    expect(session.cooldown.laps).toHaveLength(5);
    expect(session.training.warnings.join(" ")).toMatch(/1 non-running/);
  });

  it("reconciles lap sums with the device summary row", () => {
    expect(a.event!.summary.distanceKm).toBeCloseTo(session.event.deviceSummary!.distanceKm!, 2);
    expect(a.reconciliation.find((r) => r.item === "Lap sum vs device summary row")?.status).toBe("ok");
  });

  it("finds the athlete's notes and aligns Stryd laps one-to-one", () => {
    expect(a.event!.commentary.length).toBe(2);
    expect(a.event!.powerAlignment.source).toBe("stryd-laps");
    expect(a.event!.powerAlignment.note).toMatch(/one-to-one/);
  });

  it("tags the event and cool-down in the activity summary without double-counting", () => {
    const roles = a.training!.records.filter((r) => r.date === "2026-10-18").map((r) => r.role).sort();
    expect(roles).toEqual(["additional", "event"]);
    expect(a.training!.records.some((r) => r.synthetic)).toBe(false);
  });
});

describe("bundled FIT, Strava ZIP and recovery samples", async () => {
  const { parseFit } = await import("../src/lib/parse/fit");
  const { readHistoryFiles } = await import("../src/lib/parse/history");
  const { parseRecovery } = await import("../src/lib/parse/recovery");
  const bytes = (f: string) => new Uint8Array(readFileSync(new URL(`../sample-data/${f}`, import.meta.url)));
  const event = parseFit("1-garmin-event.fit", bytes("1-garmin-event.fit"));
  const cooldown = parseFit("4-garmin-cooldown-5k.fit", bytes("4-garmin-cooldown-5k.fit"));
  const strava = await readHistoryFiles([new File([bytes("strava-export.zip")], "strava-export.zip")], "Strava");
  const garmin = parseTraining("3", table("3-garmin-activities.csv"));
  const recovery = parseRecovery("r", table("recovery-hrv-sleep.csv"));
  const a = analyze({ context: demoContext(), event: event.activity, cooldown: cooldown.activity, training: { ...garmin, records: garmin.records.map((r) => ({ ...r, source: "Garmin Connect" })) }, strava, recovery });

  it("decodes the event FIT into 27 laps with 1 Hz samples", () => {
    expect(event.activity.laps).toHaveLength(27);
    expect(a.event!.summary.distanceKm).toBeCloseTo(26.2, 1);
    expect(event.activity.samples!.length).toBeGreaterThan(7000);
    expect(a.zones.event.hr?.method).toMatch(/per-second/);
  });
  it("merges Garmin and Strava history over 6 months", () => {
    expect(strava.records.length).toBeGreaterThan(50);
    expect(a.training!.sources.join(" ")).toMatch(/Garmin Connect \+ Strava/);
    expect(a.training!.weeks.length).toBeGreaterThanOrEqual(26);
  });
  it("parses Garmin-style recovery and analyses it", () => {
    expect(recovery.days.length).toBeGreaterThan(170);
    expect(recovery.days[0].sleepHours).toBeGreaterThan(4);
    expect(a.recovery?.points.some((p) => p.status !== "Insufficient data")).toBe(true);
  });
});
