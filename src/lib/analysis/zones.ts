import type { AthleteContext, Lap, Sample } from "../types";

export interface Zone {
  id: string;
  name: string;
  /** Inclusive lower bound, exclusive upper bound, in the zone's unit. */
  lo: number;
  hi: number;
  purpose: string;
}

export interface ZoneSet {
  kind: "power" | "hr" | "pace";
  basis: string;
  unit: string;
  zones: Zone[];
}

/** Stryd's five running-power zones, % of critical power. */
export function powerZones(cp: number): ZoneSet {
  const z = (id: string, name: string, a: number, b: number, purpose: string): Zone => ({ id, name, lo: cp * a, hi: cp * b, purpose });
  return {
    kind: "power",
    basis: `Stryd 5-zone model · CP ${Math.round(cp)} W`,
    unit: "W",
    zones: [
      z("Z1", "Easy", 0, 0.8, "Recovery and aerobic base (65–80% CP)"),
      z("Z2", "Moderate", 0.8, 0.9, "Long runs, marathon effort (80–90% CP)"),
      z("Z3", "Threshold", 0.9, 1.0, "Tempo and threshold (90–100% CP)"),
      z("Z4", "Interval", 1.0, 1.15, "VO₂max intervals (100–115% CP)"),
      z("Z5", "Repetition", 1.15, 10, "Speed and economy (115–130% CP)"),
    ],
  };
}

/**
 * Heart-rate zones. Preference: Friel %LTHR (run) → Karvonen %HRR → %HRmax.
 * Returns undefined when no anchor is supplied — zones are never invented.
 */
export function hrZones(ctx: Pick<AthleteContext, "lthr" | "maxHr" | "restHr">): ZoneSet | undefined {
  const { lthr, maxHr, restHr } = ctx;
  if (lthr) {
    const z = (id: string, name: string, a: number, b: number, purpose: string): Zone => ({ id, name, lo: lthr * a, hi: lthr * b, purpose });
    return {
      kind: "hr",
      basis: `Friel run zones · LTHR ${lthr} bpm`,
      unit: "bpm",
      zones: [
        z("Z1", "Recovery", 0, 0.85, "< 85% LTHR"),
        z("Z2", "Aerobic", 0.85, 0.9, "85–89% LTHR"),
        z("Z3", "Tempo", 0.9, 0.95, "90–94% LTHR"),
        z("Z4", "Sub-threshold", 0.95, 1.0, "95–99% LTHR"),
        { id: "Z5", name: "Threshold+", lo: lthr, hi: 999, purpose: "≥ 100% LTHR" },
      ],
    };
  }
  if (maxHr && restHr) {
    const hr = (f: number) => restHr + f * (maxHr - restHr);
    const z = (id: string, name: string, a: number, b: number): Zone => ({ id, name, lo: a === 0 ? 0 : hr(a), hi: b >= 1 ? 999 : hr(b), purpose: `${a * 100}–${b * 100}% HRR` });
    return {
      kind: "hr",
      basis: `Karvonen %HRR · ${restHr}–${maxHr} bpm`,
      unit: "bpm",
      zones: [z("Z1", "Recovery", 0, 0.6), z("Z2", "Aerobic", 0.6, 0.7), z("Z3", "Tempo", 0.7, 0.8), z("Z4", "Threshold", 0.8, 0.9), z("Z5", "VO₂max", 0.9, 1)],
    };
  }
  if (maxHr) {
    const z = (id: string, name: string, a: number, b: number): Zone => ({ id, name, lo: a * maxHr, hi: b >= 1 ? 999 : b * maxHr, purpose: `${a * 100}–${b * 100}% HRmax` });
    return {
      kind: "hr",
      basis: `%HRmax · max ${maxHr} bpm`,
      unit: "bpm",
      zones: [z("Z1", "Recovery", 0, 0.68), z("Z2", "Aerobic", 0.68, 0.78), z("Z3", "Tempo", 0.78, 0.88), z("Z4", "Threshold", 0.88, 0.94), z("Z5", "VO₂max", 0.94, 1)],
    };
  }
  return undefined;
}

/**
 * Pace zones from threshold pace (Friel run pace zones, collapsed to five).
 * Bounds are pace in s/km, so a *higher* number is *slower*.
 */
export function paceZones(thresholdPaceS: number): ZoneSet {
  const z = (id: string, name: string, slowF: number, fastF: number, purpose: string): Zone => ({ id, name, lo: thresholdPaceS * fastF, hi: thresholdPaceS * slowF, purpose });
  return {
    kind: "pace",
    basis: `Threshold pace ${Math.floor(thresholdPaceS / 60)}:${String(Math.round(thresholdPaceS % 60)).padStart(2, "0")}/km`,
    unit: "s/km",
    zones: [
      z("Z1", "Recovery", 10, 1.29, "> 129% of threshold pace time"),
      z("Z2", "Aerobic", 1.29, 1.14, "114–129%"),
      z("Z3", "Tempo", 1.14, 1.06, "106–113% (typical marathon pace)"),
      z("Z4", "Threshold", 1.06, 0.99, "99–105%"),
      z("Z5", "VO₂max+", 0.99, 0, "< 99%"),
    ],
  };
}

export function zoneOf(set: ZoneSet, value: number): Zone | undefined {
  return set.zones.find((z) => value >= z.lo && value < z.hi);
}

export interface TimeInZone {
  zone: Zone;
  seconds: number;
  pct: number;
}

export interface ZoneDistribution {
  set: ZoneSet;
  rows: TimeInZone[];
  coveredS: number;
  method: string;
}

/**
 * Time in zone. With 1 Hz samples each second is binned; with laps each lap's
 * full duration is credited to the zone of its average, which hides
 * within-lap variation and is labelled as an approximation.
 */
export function timeInZone(set: ZoneSet, laps: Lap[], samples: readonly Sample[] = []): ZoneDistribution | undefined {
  const acc = new Map<string, number>();
  let covered = 0;
  let method: string;
  const pick = (x: { power?: number; hr?: number }) => (set.kind === "power" ? x.power : x.hr);
  const usable = samples.filter((s) => pick(s) !== undefined);
  if (set.kind !== "pace" && usable.length > 120) {
    method = `${usable.length.toLocaleString()} per-second samples binned individually.`;
    for (let i = 1; i < usable.length; i++) {
      const dt = usable[i].timeS - usable[i - 1].timeS;
      if (dt <= 0 || dt > 10) continue;
      const z = zoneOf(set, pick(usable[i])!);
      if (!z) continue;
      acc.set(z.id, (acc.get(z.id) ?? 0) + dt);
      covered += dt;
    }
  } else {
    method = "Lap-level approximation: each lap's time is credited to the zone of its average.";
    for (const l of laps) {
      const v = set.kind === "power" ? l.power : set.kind === "hr" ? l.avgHr : l.timeS / l.distanceKm;
      if (v === undefined || !Number.isFinite(v)) continue;
      const z = zoneOf(set, v);
      if (!z) continue;
      acc.set(z.id, (acc.get(z.id) ?? 0) + l.timeS);
      covered += l.timeS;
    }
  }
  if (!covered) return undefined;
  return {
    set,
    coveredS: covered,
    method,
    rows: set.zones.map((zone) => ({ zone, seconds: acc.get(zone.id) ?? 0, pct: ((acc.get(zone.id) ?? 0) / covered) * 100 })),
  };
}
