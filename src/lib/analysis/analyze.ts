import type { Finding, Lap, SessionData } from "../types";
import { fmtPace, fmtSigned } from "../units";
import { summarize, type Summary } from "./aggregate";
import { crossCheck, type CommentaryItem } from "./commentary";
import { bestEfforts, fitCriticalPower, meanMaxPower, performanceManager, wPrimeBalance, type BestEffort, type CpFit, type MmpPoint, type Pmc, type WbalPoint } from "./load";
import { analyzePacing, makeSegment, type PacingAnalysis, type Segment } from "./pacing";
import { decoupling, hrDrift, relativeIntensity, type Decoupling } from "./physiology";
import { alignPower, analyzePower, type AlignedPower, type PowerAnalysis } from "./power";
import { daysToRace, marathonScenarios, MARATHON_KM, taperPhase, type Scenario } from "./readiness";
import { mergeHistory } from "../parse/history";
import { analyzeRecovery, type RecoveryAnalysis } from "./recovery";
import { hrZones, paceZones, powerZones, timeInZone, type ZoneDistribution, type ZoneSet } from "./zones";
import { analyzeTraining, tagRecords, weeklyVolume, type TaggedRecord, type TrainingAnalysis, type WeekBucket } from "./training";

export interface Reconciliation {
  item: string;
  value: string;
  status: "ok" | "warn" | "info";
}

export interface Analysis {
  event?: {
    laps: Lap[];
    summary: Summary;
    pacing: PacingAnalysis;
    decouplingPace: Decoupling;
    decouplingPower: Decoupling;
    hrDriftBpm?: number;
    intensity: { value?: number; basis: string };
    power: PowerAnalysis;
    powerAlignment: AlignedPower;
    finalFiveKm?: Segment;
    commentary: CommentaryItem[];
  };
  extra?: {
    laps: Lap[];
    summary: Summary;
    paceVsEventPct?: number;
    paceVsFinalThirdPct?: number;
    hrVsEventBpm?: number;
    character: string;
  };
  combined?: {
    distanceKm: number;
    movingTimeS?: number;
    timerTimeS: number;
    paceS: number;
    avgHr?: number;
    avgPower?: number;
    vsPlannedKm: number;
  };
  training?: {
    records: TaggedRecord[];
    weeks: WeekBucket[];
    analysis: TrainingAnalysis;
    notes: string[];
    sources: string[];
    windowStart: string;
  };
  readiness?: {
    goalPaceS: number;
    goalTimeS: number;
    eventVsGoalPct?: number;
    finalThirdVsGoalPct?: number;
    scenarios: Scenario[];
    daysToMarathon?: number;
    phase: string;
  };
  zones: {
    power?: ZoneSet;
    hr?: ZoneSet;
    pace?: ZoneSet;
    event: { power?: ZoneDistribution; hr?: ZoneDistribution; pace?: ZoneDistribution };
    extra: { power?: ZoneDistribution; hr?: ZoneDistribution; pace?: ZoneDistribution };
  };
  load: {
    pmc?: Pmc;
    bestEfforts: BestEffort[];
    mmp: MmpPoint[];
    mmpSource: string;
    cpFit: CpFit;
    wbal?: { points: WbalPoint[]; cp: number; wPrimeJ: number; minJ: number; basis: string };
  };
  recovery?: RecoveryAnalysis;
  reconciliation: Reconciliation[];
  findings: Finding[];
  dataGaps: string[];
}

export function analyze(session: SessionData): Analysis {
  const ctx = session.context;
  const reconciliation: Reconciliation[] = [];
  const dataGaps: string[] = [];
  const out: Analysis = { reconciliation, findings: [], dataGaps, zones: { event: {}, extra: {} }, load: { bestEfforts: [], mmp: [], mmpSource: "", cpFit: { available: false } } };

  if (session.event?.laps.length) {
    const alignment = alignPower(session.event.laps, session.stryd);
    const laps = alignment.laps;
    const summary = summarize(laps);
    const pacing = analyzePacing(laps);
    const total = summary.distanceKm;
    out.event = {
      laps,
      summary,
      pacing,
      decouplingPace: decoupling(laps, "pace"),
      decouplingPower: decoupling(laps, "power"),
      hrDriftBpm: hrDrift(laps),
      intensity: relativeIntensity(summary.avgHr, ctx.maxHr, ctx.restHr),
      power: analyzePower(laps, session.stryd?.samples?.length ? session.stryd.samples : session.event.samples ?? [], ctx.criticalPowerW ?? session.stryd?.criticalPowerW, ctx.weightKg),
      powerAlignment: alignment,
      finalFiveKm: total > 10 ? makeSegment(laps, total - 5, total, "Final 5 km") : undefined,
      commentary: crossCheck(laps, session.event.looseNotes, ctx.observations),
    };
    reconciliation.push({ item: "Main event (Garmin laps)", value: `${laps.length} laps · ${total.toFixed(2)} km`, status: "ok" });
    const dev = session.event.deviceSummary;
    if (dev?.distanceKm && Number.isFinite(dev.distanceKm)) {
      const diff = Math.abs(dev.distanceKm - total);
      reconciliation.push({
        item: "Lap sum vs device summary row",
        value: `${total.toFixed(2)} km vs ${dev.distanceKm.toFixed(2)} km`,
        status: diff < 0.05 ? "ok" : "warn",
      });
    }
    if (alignment.strydDistanceKm) {
      const d = ((alignment.strydDistanceKm - total) / total) * 100;
      reconciliation.push({ item: "Stryd vs Garmin distance", value: `${alignment.strydDistanceKm.toFixed(2)} km vs ${total.toFixed(2)} km (${fmtSigned(d, 1, "%")})`, status: Math.abs(d) < 2 ? "ok" : "warn" });
    }
    reconciliation.push({ item: "Power alignment", value: alignment.note, status: alignment.source === "none" ? "warn" : "info" });
    if (summary.movingTimeS === undefined) dataGaps.push("Moving time per lap (elapsed timer time used for pace).");
  } else {
    dataGaps.push("Main-event Garmin split file.");
  }

  if (session.cooldown?.laps.length) {
    const laps = session.cooldown.laps;
    const summary = summarize(laps);
    const ev = out.event;
    const paceVsEventPct = ev ? ((summary.paceS - ev.summary.paceS) / ev.summary.paceS) * 100 : undefined;
    const paceVsFinalThirdPct = ev ? ((summary.paceS - ev.pacing.finalThird.paceS) / ev.pacing.finalThird.paceS) * 100 : undefined;
    const hrVsEventBpm = ev?.summary.avgHr !== undefined && summary.avgHr !== undefined ? summary.avgHr - ev.summary.avgHr : undefined;
    let character = "Insufficient data to characterise effort.";
    if (paceVsEventPct !== undefined) {
      if (paceVsEventPct > 8 && (hrVsEventBpm === undefined || hrVsEventBpm < -5)) character = "Easy relative to the event (clearly slower, lower HR).";
      else if (paceVsEventPct > 3) character = "Moderate: slower than the event but still a sustained aerobic stimulus.";
      else character = "Demanding: at or near event pace on pre-fatigued legs.";
    }
    out.extra = { laps, summary, paceVsEventPct, paceVsFinalThirdPct, hrVsEventBpm, character };
    reconciliation.push({ item: "Additional run", value: `${laps.length} laps · ${summary.distanceKm.toFixed(2)} km`, status: "ok" });
  } else {
    dataGaps.push("Additional (post-event) run split file.");
  }

  if (out.event && out.extra) {
    const a = out.event.summary;
    const b = out.extra.summary;
    const distanceKm = a.distanceKm + b.distanceKm;
    const timerTimeS = a.timeS + b.timeS;
    const hrW = (a.avgHr !== undefined ? a.timeS * a.hrCoverage : 0) + (b.avgHr !== undefined ? b.timeS * b.hrCoverage : 0);
    out.combined = {
      distanceKm,
      timerTimeS,
      movingTimeS: a.movingTimeS !== undefined && b.movingTimeS !== undefined ? a.movingTimeS + b.movingTimeS : undefined,
      paceS: timerTimeS / distanceKm,
      avgHr: a.avgHr !== undefined && b.avgHr !== undefined ? (a.avgHr * a.timeS * a.hrCoverage + b.avgHr * b.timeS * b.hrCoverage) / hrW : undefined,
      avgPower: a.avgPower !== undefined && b.avgPower !== undefined ? (a.avgPower * a.timeS + b.avgPower * b.timeS) / timerTimeS : undefined,
      vsPlannedKm: distanceKm - ctx.plannedTotalKm,
    };
    reconciliation.push({
      item: "Recorded running vs planned",
      value: `${distanceKm.toFixed(2)} km vs ${ctx.plannedTotalKm.toFixed(1)} km (${fmtSigned(distanceKm - ctx.plannedTotalKm, 2, " km")}); pre-event walk excluded`,
      status: Math.abs(distanceKm - ctx.plannedTotalKm) < 0.5 ? "ok" : "warn",
    });
  }

  const history = mergeHistory(ctx.eventDate, session.training, session.strava);
  if (history.records.length) {
    const tagged = tagRecords(
      history.records,
      ctx.eventDate,
      out.event && { distanceKm: out.event.summary.distanceKm, timeS: out.event.summary.timeS },
      out.extra && { distanceKm: out.extra.summary.distanceKm, timeS: out.extra.summary.timeS },
    );
    out.training = {
      records: tagged.records,
      weeks: weeklyVolume(tagged.records, ctx.eventDate),
      analysis: analyzeTraining(tagged.records, ctx.eventDate, ctx.goalPaceS),
      notes: [...history.notes, ...tagged.notes],
      sources: Array.from(new Set(history.records.map((r) => r.source ?? "Upload"))),
      windowStart: history.windowStart,
    };
    history.notes.forEach((n) => reconciliation.push({ item: "History merge (Garmin + Strava, 6 months)", value: n, status: "info" }));
    tagged.notes.forEach((n) => reconciliation.push({ item: "Activity summary de-duplication", value: n, status: "info" }));
  } else {
    dataGaps.push("Recent training history (Garmin Connect or Strava export).");
  }

  if (out.event) {
    const goalTimeS = ctx.goalPaceS * MARATHON_KM;
    const days = daysToRace(ctx.eventDate, ctx.marathonDate);
    out.readiness = {
      goalPaceS: ctx.goalPaceS,
      goalTimeS,
      eventVsGoalPct: ((out.event.summary.paceS - ctx.goalPaceS) / ctx.goalPaceS) * 100,
      finalThirdVsGoalPct: ((out.event.pacing.finalThird.paceS - ctx.goalPaceS) / ctx.goalPaceS) * 100,
      scenarios: marathonScenarios(out.event.summary.timeS, out.event.summary.distanceKm, out.event.pacing.finalThird.paceS),
      daysToMarathon: days,
      phase: taperPhase(days),
    };
  }

  // Zones are only built from anchors the athlete supplied (never invented).
  const cp = ctx.criticalPowerW ?? session.stryd?.criticalPowerW;
  const z = out.zones;
  z.power = cp ? powerZones(cp) : undefined;
  z.hr = hrZones(ctx);
  z.pace = ctx.thresholdPaceS ? paceZones(ctx.thresholdPaceS) : undefined;
  // Stryd stream is the power source; a FIT event file supplies time-aligned HR (and power if recorded).
  const samples = session.stryd?.samples?.length ? session.stryd.samples : session.event?.samples ?? [];
  const hrSamples = session.event?.samples?.some((x) => x.hr !== undefined) ? session.event.samples : samples;
  for (const [key, laps, smp] of [["event", out.event?.laps, samples], ["extra", out.extra?.laps, []]] as const) {
    if (!laps) continue;
    z[key].power = z.power && timeInZone(z.power, laps, smp);
    z[key].hr = z.hr && timeInZone(z.hr, laps, key === "event" ? hrSamples : smp);
    z[key].pace = z.pace && timeInZone(z.pace, laps);
  }

  // GoldenCheetah-style load and performance curves.
  if (out.training) out.load.pmc = performanceManager(out.training.records, ctx);
  if (out.event) {
    out.load.bestEfforts = bestEfforts(out.event.laps, [
      { label: "1 km", km: 1 },
      { label: "5 km", km: 5 },
      { label: "10 km", km: 10 },
      { label: "Half marathon", km: 21.0975 },
    ]);
    if (samples.some((x) => x.power !== undefined)) {
      out.load.mmp = meanMaxPower(samples);
      out.load.mmpSource = "Stryd per-second samples";
    } else {
      // Coarse curve from whole laps: best average over n consecutive laps.
      const laps = out.event.laps.filter((l) => l.power !== undefined);
      const pts = new Map<number, number>();
      for (let n = 1; n <= laps.length; n++) {
        for (let i = 0; i + n <= laps.length; i++) {
          const win = laps.slice(i, i + n);
          const t = win.reduce((a, l) => a + l.timeS, 0);
          const p = win.reduce((a, l) => a + l.power! * l.timeS, 0) / t;
          const key = Math.round(t / 60) * 60;
          pts.set(key, Math.max(pts.get(key) ?? 0, p));
        }
      }
      out.load.mmp = [...pts.entries()].sort((a, b) => a[0] - b[0]).map(([durationS, power]) => ({ durationS, power }));
      out.load.mmpSource = "Lap averages (coarse — durations below one lap are not visible)";
    }
    out.load.cpFit = samples.length ? fitCriticalPower(out.load.mmp) : { available: false, reason: "Needs per-second Stryd power; lap averages are too coarse to fit CP/W′." };
    const wPrime = ctx.wPrimeJ ?? (out.load.cpFit.available ? out.load.cpFit.wPrimeJ : undefined);
    if (cp && wPrime) {
      const usable = samples.filter((x) => x.power !== undefined);
      const steps = usable.length > 120
        ? usable.map((x, i) => ({ dt: i ? x.timeS - usable[i - 1].timeS : 0, power: x.power }))
        : out.event.laps.map((l) => ({ dt: l.timeS, power: l.power }));
      const points = wPrimeBalance(steps, cp, wPrime);
      out.load.wbal = {
        points,
        cp,
        wPrimeJ: wPrime,
        minJ: Math.min(...points.map((p) => p.wbal)),
        basis: `${usable.length > 120 ? "Per-second samples" : "Lap steps (smooths surges)"} · CP ${Math.round(cp)} W · W′ ${(wPrime / 1000).toFixed(1)} kJ ${ctx.wPrimeJ ? "(supplied)" : "(model fit)"}`,
      };
    }
  }

  if (session.recovery?.days.length) {
    out.recovery = analyzeRecovery(session.recovery.days, ctx.eventDate, out.training?.records.filter((r) => r.role === "training") ?? [], out.load.pmc?.days ?? []);
  } else {
    dataGaps.push("Overnight HRV, resting HR and sleep for the weeks before the event.");
  }

  if (!ctx.maxHr) dataGaps.push("Maximum (and resting) heart rate for relative-intensity analysis.");
  if (!(ctx.criticalPowerW ?? session.stryd?.criticalPowerW)) dataGaps.push("Current Stryd critical power (CP) to express effort as %CP.");
  dataGaps.push("Fuelling and fluid intake (type, amount, timing) during the event.");
  if (!session.route) dataGaps.push("GPS track (GPX/TCX) and weather at the event for terrain and heat context.");

  out.findings = buildFindings(out, session);
  out.dataGaps = Array.from(new Set(dataGaps)).slice(0, 5);
  return out;
}

/** Rule-based coach findings, each with the evidence that triggered it. */
export function buildFindings(a: Analysis, s: SessionData): Finding[] {
  const f: Omit<Finding, "priority">[] = [];
  const ev = a.event;
  const goal = s.context.goalPaceS;
  if (ev) {
    const p = ev.pacing;
    if (p.driftPct > 3) {
      f.push({
        area: "Race execution",
        finding: "Material late-event slowdown",
        evidence: `Final-third pace ${fmtPace(p.finalThird.paceS)} vs first-third ${fmtPace(p.firstThird.paceS)} (drift ${fmtSigned(p.driftPct, 1, "%")}).${ev.power.divergence ? ` Power changed ${fmtSigned(ev.power.divergence.powerPct, 1, "%")} over the same comparison.` : ""}`,
        recommendation: "Start the marathon 5–8 s/km slower than goal pace for the first 5 km, then settle to goal pace; cap early power/HR.",
        benefit: "Reduces the cost of early surges and protects the final 10 km.",
        confidence: ev.power.available ? "High" : "Medium",
      });
    } else if (p.driftPct < -1) {
      f.push({
        area: "Race execution",
        finding: "Finished faster than started",
        evidence: `Final-third pace ${fmtPace(p.finalThird.paceS)} vs first-third ${fmtPace(p.firstThird.paceS)} (drift ${fmtSigned(p.driftPct, 1, "%")}).`,
        recommendation: "Repeat the controlled start; rehearse goal pace from km 5 rather than building late.",
        benefit: "Preserves durability while moving average pace toward the goal.",
        confidence: "High",
      });
    }
    if (ev.decouplingPace.available && ev.decouplingPace.pct !== undefined && ev.decouplingPace.pct >= 5) {
      f.push({
        area: "Training",
        finding: "Cardiovascular drift relative to speed",
        evidence: `Pa:HR decoupling ${ev.decouplingPace.pct.toFixed(1)}%; HR change between halves ${fmtSigned(ev.hrDriftBpm, 0, " bpm")}.`,
        recommendation: "Progress long runs with the final 8–12 km at goal pace, keeping HR drift under ~5%; log heat and fluids to separate causes.",
        benefit: "Builds the durability that keeps marathon pace sustainable after 30 km.",
        confidence: "Medium",
      });
    }
    if (ev.power.available && ev.power.lapPowerCvPct !== undefined && ev.power.lapPowerCvPct > 5) {
      f.push({
        area: "Race execution",
        finding: "Uneven effort distribution",
        evidence: `Lap-to-lap power CV ${ev.power.lapPowerCvPct.toFixed(1)}%${ev.power.variabilityIndex ? `, VI ${ev.power.variabilityIndex.toFixed(2)}` : ""}.`,
        recommendation: "Set a power ceiling for climbs (≈ +5% of target) and a floor for descents; pace by power on rolling terrain.",
        benefit: "More even metabolic cost for the same average pace.",
        confidence: "Medium",
      });
    }
    const late = ev.finalFiveKm;
    if (late && late.paceS > goal) {
      f.push({
        area: "Marathon readiness",
        finding: "Late-run pace above goal marathon pace",
        evidence: `Final 5 km of the event at ${fmtPace(late.paceS)} vs goal ${fmtPace(goal)}.`,
        recommendation: "Add goal-pace blocks late in long runs (e.g. 3 × 3 km at goal pace from km 20) if the calendar allows.",
        benefit: "Specific rehearsal of goal pace on tired legs.",
        confidence: "Medium",
      });
    }
    const strain = ev.commentary.filter((c) => c.sentiment === "strain");
    if (strain.length) {
      f.push({
        area: "Mental performance",
        finding: "Late-race strain reported",
        evidence: `${strain.length} observation(s) of strain; objective support: ${strain.map((c) => c.support.toLowerCase()).join(", ")}.`,
        recommendation: "Pre-plan cue words and a segment strategy for km 30–42 (count down 5 km blocks; fuel on a fixed schedule).",
        benefit: "Turns late discomfort into planned decisions rather than reactive slowing.",
        confidence: strain.some((c) => c.support === "Supports") ? "Medium" : "Low",
      });
    }
  }
  const pre = a.recovery?.preEvent;
  if (pre && (pre.nights.some((n) => n.status === "Below normal") || (pre.sleepAvg !== undefined && pre.sleepAvg < 6.5))) {
    f.push({
      area: "Recovery",
      finding: "Recovery markers suppressed before the event",
      evidence: pre.summary,
      recommendation: "Protect sleep (≥ 8 h opportunity) in the final 7–10 days before the marathon and keep the last hard session ≥ 10 days out; track HRV through the taper.",
      benefit: "Arrive with HRV in or above its normal band, which tends to accompany better readiness.",
      confidence: "Low",
    });
  }
  if (s.context.warmupNote.trim()) {
    f.push({
      area: "Race execution",
      finding: "Warm-up logistics",
      evidence: `Athlete note: “${s.context.warmupNote.trim()}”.${ev ? ` First 5 km at ${fmtPace(ev.pacing.segments[0]?.paceS)}.` : ""}`,
      recommendation: "Schedule arrival so a 10–15 min easy jog + 3–4 strides is possible; for the marathon, the first 2–3 km at the easy end of goal pace can double as the warm-up.",
      benefit: "Smoother early pacing and less early HR spike.",
      confidence: "Low",
    });
  }
  const tr = a.training?.analysis;
  if (tr?.acwr !== undefined && tr.acwr > 1.3) {
    f.push({
      area: "Recovery",
      finding: "Acute load above recent baseline",
      evidence: `7-day pre-event volume ÷ 28-day weekly mean = ${tr.acwr.toFixed(2)}.`,
      recommendation: "Plan 2–3 easy days after this session before the next quality workout.",
      benefit: "Absorbs the session without stacking fatigue.",
      confidence: "Low",
    });
  }
  if (a.readiness?.daysToMarathon !== undefined && a.readiness.daysToMarathon <= 21 && a.readiness.daysToMarathon >= 0) {
    f.push({
      area: "Training",
      finding: "Marathon is close",
      evidence: `${a.readiness.daysToMarathon} days from this session to the marathon.`,
      recommendation: "Do not add new high-fatigue sessions; keep frequency, reduce volume, retain short goal-pace segments.",
      benefit: "Arrive fresh; fitness gains this late are minimal.",
      confidence: "High",
    });
  }
  f.push({
    area: "Fuelling",
    finding: "Fuelling and hydration not recorded",
    evidence: "No intake data in the supplied files.",
    recommendation: "Log carbohydrate (g/h), fluid and sodium in the next long run; rehearse the race-day plan (commonly 60–90 g/h).",
    benefit: "Removes a major unknown in late-race slowdown.",
    confidence: "Low",
  });
  // Rules are pushed in order of consequence; keep the five most consequential.
  return f.slice(0, 5).map((x, i) => ({ ...x, priority: i + 1 }));
}
