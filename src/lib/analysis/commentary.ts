import type { Lap } from "../types";
import { fmtPace } from "../units";
import { cumulative, lapPace, summarize } from "./aggregate";

export type Support = "Supports" | "Partially supports" | "Cannot substantiate" | "Context only";

export interface CommentaryItem {
  text: string;
  lap?: Lap;
  atKm?: string;
  sentiment: "strain" | "positive" | "neutral";
  evidence: string[];
  support: Support;
}

const STRAIN = /tir|fatigu|heavy|hard|struggl|pain|cramp|hurt|wall|dying|dead|slow|walk|sore|stitch|bonk|empty|tough|suffer|ache|tight|niggle|dizzy|hot|heat|thirst|quit|doubt|mental/i;
const POSITIVE = /strong|good|great|easy|comfortab|smooth|relax|controlled|fresh|push|kick|surge|felt fine|enjoy|confident|fast/i;

/**
 * Heuristic cross-check of each observation against the lap it was written on:
 * pace vs the preceding three laps and the event average, HR vs event average,
 * power vs event average. A coach should review every classification.
 */
export function crossCheck(laps: Lap[], looseNotes: string[], extraObservations: string): CommentaryItem[] {
  const ev = summarize(laps);
  const cum = cumulative(laps);
  const items: CommentaryItem[] = [];
  cum.forEach(({ lap, startKm, endKm }, i) => {
    if (!lap.note) return;
    const prev = cum.slice(Math.max(0, i - 3), i).map((c) => c.lap);
    const prevPace = prev.length ? prev.reduce((a, l) => a + l.timeS, 0) / prev.reduce((a, l) => a + l.distanceKm, 0) : undefined;
    const evidence: string[] = [];
    let strainSignals = 0;
    let positiveSignals = 0;
    const p = lapPace(lap);
    const vsAvg = ((p - ev.paceS) / ev.paceS) * 100;
    evidence.push(`Lap pace ${fmt(p)} vs event average ${fmt(ev.paceS)} (${sign(vsAvg)}%).`);
    if (vsAvg > 3) strainSignals++;
    if (vsAvg < -1) positiveSignals++;
    if (prevPace) {
      const vsPrev = ((p - prevPace) / prevPace) * 100;
      evidence.push(`Versus the preceding ${prev.length} laps: ${sign(vsPrev)}%.`);
      if (vsPrev > 3) strainSignals++;
      if (vsPrev < -2) positiveSignals++;
    }
    if (lap.avgHr !== undefined && ev.avgHr !== undefined) {
      const d = lap.avgHr - ev.avgHr;
      evidence.push(`Lap HR ${lap.avgHr.toFixed(0)} bpm vs event average ${ev.avgHr.toFixed(0)} (${d >= 0 ? "+" : ""}${d.toFixed(0)}).`);
      if (d >= 4) strainSignals++;
    }
    if (lap.power !== undefined && ev.avgPower !== undefined) {
      const d = ((lap.power - ev.avgPower) / ev.avgPower) * 100;
      evidence.push(`Lap power ${lap.power.toFixed(0)} W vs event average ${ev.avgPower.toFixed(0)} W (${sign(d)}%).`);
      if (d < -4) strainSignals++;
      if (d > 2) positiveSignals++;
    }
    const sentiment = STRAIN.test(lap.note) ? "strain" : POSITIVE.test(lap.note) ? "positive" : "neutral";
    const hits = sentiment === "strain" ? strainSignals : sentiment === "positive" ? positiveSignals : 0;
    items.push({
      text: lap.note,
      lap,
      atKm: `${startKm.toFixed(1)}–${endKm.toFixed(1)} km`,
      sentiment,
      evidence,
      support: sentiment === "neutral" ? "Context only" : hits >= 2 ? "Supports" : hits === 1 ? "Partially supports" : "Cannot substantiate",
    });
  });
  const free = [...looseNotes, ...extraObservations.split(/\n+/)].map((s) => s.trim()).filter(Boolean);
  for (const text of free) {
    items.push({
      text,
      sentiment: STRAIN.test(text) ? "strain" : POSITIVE.test(text) ? "positive" : "neutral",
      evidence: ["Not tied to a specific lap; cannot be cross-checked against a segment."],
      support: "Context only",
    });
  }
  return items;
}

const fmt = (s: number) => fmtPace(s);
const sign = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
