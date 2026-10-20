import type { Sample, StrydFile } from "../types";
import { parseDuration, parseNumber } from "../units";
import { type DistanceUnit, parseLapTable } from "./laps";
import { type RawTable, findCol } from "./table";

/**
 * Stryd data arrives either as a per-second export (PowerCenter CSV) or as a
 * lap summary. Per-second data is detected by a timestamp column and many rows.
 */
export function parseStryd(name: string, t: RawTable, unit: DistanceUnit = "auto"): StrydFile {
  const h = t.headers;
  const warnings: string[] = [];
  const tsCol = findCol(h, ["timestamp", "time s", "elapsed seconds", "seconds", "elapsed time s", "time (s)"]);
  const powerCol = findCol(h, ["watts", "power", "power w", "power (w)", "stryd power"], ["form", "avg", "max"]);
  const cp = findCriticalPower(t);

  if (tsCol >= 0 && powerCol >= 0 && t.rows.length > 60) {
    const distCol = findCol(h, ["stryd distance meters", "stryd distance", "distance meters", "distance (m)", "distance"]);
    const speedCol = findCol(h, ["stryd speed m/s", "stryd speed", "speed m/s", "speed"]);
    const hrCol = findCol(h, ["heart rate", "hr", "heart rate bpm"]);
    const cadCol = findCol(h, ["cadence", "stryd cadence", "cadence spm"]);
    const fpCol = findCol(h, ["form power"]);
    const lssCol = findCol(h, ["leg spring stiffness", "lss"]);
    const eleCol = findCol(h, ["stryd elevation m", "stryd elevation", "elevation", "altitude"]);
    const gctCol = findCol(h, ["ground time ms", "ground time", "ground contact time"]);

    const rawTimes = t.rows.map((r) => r[tsCol]);
    const first = toSeconds(rawTimes[0]);
    const distInMetres = /met|\(m\)/i.test(h[distCol] ?? "") || (parseNumber(t.rows[t.rows.length - 1][distCol]) ?? 0) > 200;
    const samples: Sample[] = [];
    for (const r of t.rows) {
      const ts = toSeconds(r[tsCol]);
      const power = parseNumber(r[powerCol]);
      if (ts === undefined || first === undefined) continue;
      const d = distCol >= 0 ? parseNumber(r[distCol]) : undefined;
      samples.push({
        timeS: ts - first,
        power,
        distanceKm: d === undefined ? undefined : distInMetres ? d / 1000 : d,
        speedMps: speedCol >= 0 ? parseNumber(r[speedCol]) : undefined,
        hr: hrCol >= 0 ? parseNumber(r[hrCol]) : undefined,
        cadence: cadCol >= 0 ? parseNumber(r[cadCol]) : undefined,
        formPower: fpCol >= 0 ? parseNumber(r[fpCol]) : undefined,
        lss: lssCol >= 0 ? parseNumber(r[lssCol]) : undefined,
        elevationM: eleCol >= 0 ? parseNumber(r[eleCol]) : undefined,
        gctMs: gctCol >= 0 ? parseNumber(r[gctCol]) : undefined,
      });
    }
    if (samples.every((s) => s.distanceKm === undefined)) {
      // Integrate speed to recover distance when only speed is present.
      let acc = 0;
      samples.forEach((s, i) => {
        const dt = i ? s.timeS - samples[i - 1].timeS : 0;
        if (s.speedMps && dt > 0 && dt < 30) acc += (s.speedMps * dt) / 1000;
        s.distanceKm = acc;
      });
      if (acc === 0) warnings.push("No Stryd distance or speed column; samples can only be aligned by time.");
    }
    return { name, laps: [], samples, criticalPowerW: cp, warnings };
  }

  const lapFile = parseLapTable(name, t, unit);
  if (lapFile.laps.every((l) => l.power === undefined)) warnings.push("No power column found in the Stryd file.");
  // HR is not expected in a Stryd file, so that lap-parser warning is dropped.
  const lapWarnings = lapFile.warnings.filter((w) => !/heart-rate/.test(w));
  return { name, laps: lapFile.laps, samples: [], criticalPowerW: cp, warnings: [...lapWarnings, ...warnings] };
}

function toSeconds(v: unknown): number | undefined {
  if (v instanceof Date) return v.getTime() / 1000;
  if (typeof v === "number") return v; // unix seconds or elapsed seconds
  if (typeof v === "string") {
    const iso = Date.parse(v);
    if (!Number.isNaN(iso) && /\d{4}-\d{2}-\d{2}/.test(v)) return iso / 1000;
    return parseDuration(v);
  }
  return undefined;
}

/** CP may be a column ("Critical Power") or written in a title row ("CP: 285 W"). */
export function findCriticalPower(t: RawTable): number | undefined {
  const col = findCol(t.headers, ["critical power", "cp", "cp w", "critical power w"]);
  if (col >= 0) {
    const v = t.rows.map((r) => parseNumber(r[col])).find((x) => x !== undefined && x > 50);
    if (v) return v;
  }
  const text = [...t.preamble, ...t.rows].flat().filter((c) => typeof c === "string").join(" ");
  const m = text.match(/(?:critical power|\bCP\b)\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:w|watts)?/i);
  return m ? parseFloat(m[1]) : undefined;
}
