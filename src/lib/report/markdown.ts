import type { Analysis } from "../analysis/analyze";
import { decouplingBand } from "../analysis/physiology";
import { simulateTaper, suggestTaper } from "../analysis/taper";
import type { SessionData } from "../types";
import { fmtDuration, fmtNum, fmtPace, fmtSigned } from "../units";

const na = "Not available";
const row = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;

/**
 * Deterministic report in the master prompt's required 10-section order.
 * Every number is computed by the analysis engine; narrative is rule-based.
 */
export function buildReport(s: SessionData, a: Analysis): string {
  const c = s.context;
  const ev = a.event;
  const ex = a.extra;
  const L: string[] = [];
  L.push(`# ${c.eventName || "Session"} — Performance Debrief`);
  L.push(`*${c.athleteName ? c.athleteName + " · " : ""}${c.eventDate}${s.isDemo ? " · **SYNTHETIC DEMO DATA**" : ""}*`);
  L.push("");
  L.push("> Labels used: **Observed** = recorded data · **Derived** = calculated from recorded data · **Hypothesis** = plausible interpretation · **Recommendation** = coaching action.");

  // 1
  L.push("\n## 1. Executive Performance Summary");
  if (ev) {
    const p = ev.pacing;
    L.push(
      `**Observed:** ${ev.summary.distanceKm.toFixed(2)} km in ${fmtDuration(ev.summary.timeS)} (${fmtPace(ev.summary.paceS)}), ${p.splitType.toLowerCase()} (${fmtSigned(p.splitDiffS, 0, " s")} second half). ` +
        `**Derived:** first-third to final-third pacing drift ${fmtSigned(p.driftPct, 1, "%")} (negative = faster late).` +
        (a.readiness ? ` Event pace was ${fmtSigned(a.readiness.eventVsGoalPct, 1, "%")} versus the ${fmtPace(a.readiness.goalPaceS)} marathon goal.` : ""),
    );
    L.push("\n**Key findings**");
    a.findings.slice(0, 3).forEach((f, i) => L.push(`${i + 1}. **${f.finding}** — ${f.evidence}`));
  } else L.push("Insufficient data: the main-event split file was not supplied.");

  // 2
  L.push("\n## 2. Activity Reconstruction and Data Quality");
  L.push(row(["Check", "Result", "Status"]));
  L.push(row(["---", "---", "---"]));
  a.reconciliation.forEach((r) => L.push(row([r.item, r.value, r.status === "ok" ? "✓" : r.status === "warn" ? "⚠" : "ℹ"])));
  if (c.warmupNote) L.push(`\n**Context:** ${c.warmupNote} The pre-event walk is excluded from running distance; the additional run is post-event and is not treated as a warm-up.`);
  const warns = [s.event, s.cooldown, s.stryd, s.training].flatMap((f) => f?.warnings ?? []);
  if (warns.length) L.push("\n**Import warnings:** " + warns.join(" "));

  // 3
  L.push("\n## 3. Race Performance Dashboard");
  L.push(row(["Metric", "Main event", "Additional run", "Combined running session"]));
  L.push(row(["---", "---", "---", "---"]));
  const cm = a.combined;
  L.push(row(["Distance", ev ? `${ev.summary.distanceKm.toFixed(2)} km` : na, ex ? `${ex.summary.distanceKm.toFixed(2)} km` : na, cm ? `${cm.distanceKm.toFixed(2)} km` : na]));
  L.push(row(["Moving time", fmtDuration(ev?.summary.movingTimeS), fmtDuration(ex?.summary.movingTimeS), fmtDuration(cm?.movingTimeS)]));
  L.push(row(["Timer (elapsed) time", fmtDuration(ev?.summary.timeS), fmtDuration(ex?.summary.timeS), cm ? `${fmtDuration(cm.timerTimeS)} (excl. gap between recordings)` : na]));
  L.push(row(["Average pace", fmtPace(ev?.summary.paceS), fmtPace(ex?.summary.paceS), fmtPace(cm?.paceS)]));
  L.push(row(["Average heart rate", fmtNum(ev?.summary.avgHr, 0, "bpm"), fmtNum(ex?.summary.avgHr, 0, "bpm"), cm?.avgHr ? `${cm.avgHr.toFixed(0)} bpm (time-weighted)` : na]));
  L.push(row(["Average power", fmtNum(ev?.summary.avgPower, 0, "W"), fmtNum(ex?.summary.avgPower, 0, "W"), cm?.avgPower ? `${cm.avgPower.toFixed(0)} W (time-weighted)` : na]));
  L.push(row(["Average cadence", fmtNum(ev?.summary.avgCadence, 0, "spm"), fmtNum(ex?.summary.avgCadence, 0, "spm"), na]));

  // 4
  L.push("\n## 4. Pacing and Race Execution");
  if (ev) {
    L.push(row(["Segment", "Distance", "Pace", "GAP (approx.)", "Avg HR", "Avg power"]));
    L.push(row(["---", "---", "---", "---", "---", "---"]));
    ev.pacing.segments.forEach((sg) =>
      L.push(row([sg.label + (sg.approximated ? "*" : ""), `${sg.distanceKm.toFixed(2)} km`, fmtPace(sg.paceS), fmtPace(sg.gapPaceS), fmtNum(sg.avgHr, 0), fmtNum(sg.avgPower, 0, "W")])),
    );
    if (ev.pacing.segments.some((x) => x.approximated)) L.push("\n\\* Segment boundary falls inside a lap; values apportioned assuming uniform pace within that lap.");
    L.push(`\n**Derived:** distance-weighted lap-pace variability (CV) ${fmtNum(ev.pacing.paceCvPct, 1, "%")}. Fastest full lap: ${ev.pacing.fastestLap ? `#${ev.pacing.fastestLap.index} ${fmtPace(ev.pacing.fastestLap.timeS / ev.pacing.fastestLap.distanceKm)}` : na}; slowest: ${ev.pacing.slowestLap ? `#${ev.pacing.slowestLap.index} ${fmtPace(ev.pacing.slowestLap.timeS / ev.pacing.slowestLap.distanceKm)}` : na}.`);
    if (ev.pacing.changes.length)
      L.push(`**Observed pace changes ≥4% vs the preceding three laps:** ${ev.pacing.changes.map((ch) => `km ${ch.atKm.toFixed(1)} (${fmtSigned(ch.deltaPct, 1, "%")})`).join(", ")}. Cross-check with elevation before attributing to fatigue.`);
  }

  // 5
  L.push("\n## 5. Heart Rate and Stryd Power");
  if (ev) {
    const d = ev.decouplingPace;
    L.push(`- **Heart rate (observed):** average ${fmtNum(ev.summary.avgHr, 0, "bpm")}, max ${fmtNum(ev.summary.maxHr, 0, "bpm")}; change between equal-time halves ${fmtSigned(ev.hrDriftBpm, 0, " bpm")}. Relative intensity: ${ev.intensity.value ? `${ev.intensity.value.toFixed(0)} ${ev.intensity.basis}` : ev.intensity.basis}.`);
    L.push(`- **Aerobic decoupling (derived):** ${d.available ? `${d.pct!.toFixed(1)}% — ${decouplingBand(d.pct!)}` : `${na} — ${d.reason}`}. Method: ${d.method}.`);
    const dp = ev.decouplingPower;
    if (dp.available) L.push(`- **Power:HR decoupling (derived):** ${dp.pct!.toFixed(1)}%. Method: ${dp.method}.`);
    const pw = ev.power;
    if (pw.available) {
      L.push(`- **Power (observed/derived):** average ${fmtNum(pw.avgPower, 0, "W")}${pw.normalizedPower ? `, normalised ${pw.normalizedPower.toFixed(0)} W (VI ${pw.variabilityIndex?.toFixed(2)})` : ""}; lap power CV ${fmtNum(pw.lapPowerCvPct, 1, "%")}; ${pw.pctCp ? `${pw.pctCp.toFixed(0)}% of supplied CP` : "%CP not available (CP not supplied)"}.`);
      if (pw.divergence) L.push(`- **Pace vs power, final vs first third:** pace ${fmtSigned(pw.divergence.pacePct, 1, "%")} (positive = slower), power ${fmtSigned(pw.divergence.powerPct, 1, "%")}. ${interpretDivergence(pw.divergence.pacePct, pw.divergence.powerPct)}`);
      if (pw.speedPerWatt) L.push(`- **Speed per watt:** ${pw.speedPerWatt.early.toFixed(3)} → ${pw.speedPerWatt.late.toFixed(3)} m·s⁻¹ per 100 W (${fmtSigned(pw.speedPerWatt.changePct, 1, "%")}). Terrain, wind and surface affect this; it is not proof of a biomechanical change.`);
      if (pw.runningEffectiveness) L.push(`- **Running effectiveness:** ${pw.runningEffectiveness.toFixed(3)} (speed ÷ W/kg, using supplied body mass).`);
    } else L.push("- **Power:** Not available.");
    L.push(`- **Alignment:** ${ev.powerAlignment.note}`);
    for (const [label, d] of [["Power", a.zones.event.power], ["Heart rate", a.zones.event.hr], ["Pace", a.zones.event.pace]] as const) {
      if (d) L.push(`- **${label} time in zone** (${d.set.basis}): ${d.rows.map((r) => `${r.zone.id} ${r.pct.toFixed(0)}%`).join(" · ")}. ${d.method}`);
    }
    if (a.load.wbal) L.push(`- **W′ balance (derived):** lowest ${(a.load.wbal.minJ / 1000).toFixed(1)} kJ of ${(a.load.wbal.wPrimeJ / 1000).toFixed(1)} kJ. ${a.load.wbal.basis}.`);
  }

  // 6
  L.push("\n## 6. Athlete Mental Commentary");
  if (ev?.commentary.length) {
    L.push(row(["Observation", "Where", "Objective evidence", "Assessment"]));
    L.push(row(["---", "---", "---", "---"]));
    ev.commentary.forEach((cm2) => L.push(row([`“${cm2.text.replace(/\|/g, "/")}”`, cm2.atKm ?? "Unlocated", cm2.evidence.join(" "), cm2.support])));
    L.push("\n*Assessments are heuristic (keyword sentiment × lap metrics) and should be reviewed by the coach. No medical interpretation is made.*");
  } else L.push("No athlete observations were found in the split file or entered in the app.");

  // 7
  L.push("\n## 7. Recent Training and Preparedness");
  const tr = a.training;
  if (tr) {
    L.push(row(["Window (before event day)", "Running km", "Runs", "Status"]));
    L.push(row(["---", "---", "---", "---"]));
    tr.analysis.windows.forEach((w) => L.push(row([`${w.days} days`, w.km !== undefined ? w.km.toFixed(1) : na, w.runs ?? na, w.status + (w.note ? ` — ${w.note}` : "")])));
    if (tr.analysis.acwr !== undefined) L.push(`\n**Derived:** acute:chronic distance ratio ${tr.analysis.acwr.toFixed(2)} → ${tr.analysis.loadLabel}. Descriptive only; it does not establish fatigue or injury risk.`);
    const pmc = a.load.pmc;
    if (pmc?.atEvent) L.push(`**Modelled load (${pmc.stress.basis}):** CTL ${pmc.atEvent.ctl.toFixed(0)}, ATL ${pmc.atEvent.atl.toFixed(0)}, TSB ${fmtSigned(pmc.atEvent.tsb, 0)} entering the event. The model needs ~42 days of history to settle.`);
    if (tr.sources.length) L.push(`**History sources:** ${tr.sources.join(", ")} (window from ${tr.windowStart}).`);
    const rec = a.recovery;
    if (rec) {
      L.push(`**Recovery (observed/derived):** ${rec.preEvent.summary}${rec.loadResponse?.r !== undefined ? ` Training load vs next-morning HRV: r = ${rec.loadResponse.r.toFixed(2)} (n = ${rec.loadResponse.n}); correlation only.` : ""}`);
    }
    if (tr.analysis.longestRuns.length) L.push(`**Longest recent runs:** ${tr.analysis.longestRuns.map((r) => `${r.date} ${r.distanceKm.toFixed(1)} km @ ${fmtPace(r.timeS / r.distanceKm)}`).join("; ")}.`);
    if (tr.analysis.qualitySessions.length) L.push(`**Most recent demanding sessions:** ${tr.analysis.qualitySessions.slice(0, 4).map((q) => `${q.record.date} (${q.daysBefore} d before; ${q.reason})`).join("; ")}.`);
    L.push("\n**Weekly running volume**");
    L.push(row(["Week of", "Training km", "Event km", "Additional km", "Total km", "Note"]));
    L.push(row(["---", "---", "---", "---", "---", "---"]));
    tr.weeks.forEach((w) => L.push(row([w.weekStart, w.trainingKm.toFixed(1), w.eventKm ? w.eventKm.toFixed(1) : "—", w.additionalKm ? w.additionalKm.toFixed(1) : "—", w.totalKm.toFixed(1), w.incomplete ? `Incomplete (${w.incompleteReason})` : ""])));
  } else L.push("Insufficient data: no activity summary supplied.");

  // 8
  L.push("\n## 8. The Additional Run");
  if (ex) {
    L.push(`**Observed:** ${ex.summary.distanceKm.toFixed(2)} km in ${fmtDuration(ex.summary.timeS)} (${fmtPace(ex.summary.paceS)}), average HR ${fmtNum(ex.summary.avgHr, 0, "bpm")}.`);
    L.push(`**Derived:** pace ${fmtSigned(ex.paceVsEventPct, 1, "%")} vs event average and ${fmtSigned(ex.paceVsFinalThirdPct, 1, "%")} vs event final third; HR ${fmtSigned(ex.hrVsEventBpm, 0, " bpm")} vs event. **Character:** ${ex.character}`);
    if (c.gapMinutes !== undefined) L.push(`Recorded gap between activities: ~${c.gapMinutes} min (athlete-supplied).`);
    if (cm) L.push(`Combined recorded running: ${cm.distanceKm.toFixed(2)} km vs ${c.plannedTotalKm} km planned (${fmtSigned(cm.vsPlannedKm, 2, " km")}).`);
  } else L.push("Insufficient data: no additional-run file supplied.");

  // 9
  L.push("\n## 9. Marathon Readiness");
  const r = a.readiness;
  if (r && ev) {
    L.push(`Goal: ${fmtPace(r.goalPaceS)} → ${fmtDuration(r.goalTimeS)}. Event average ${fmtPace(ev.summary.paceS)} (${fmtSigned(r.eventVsGoalPct, 1, "%")}); final third ${fmtPace(ev.pacing.finalThird.paceS)} (${fmtSigned(r.finalThirdVsGoalPct, 1, "%")}).`);
    if (r.daysToMarathon !== undefined) L.push(`Days to marathon: ${r.daysToMarathon}. ${r.phase}`);
    const pmcDays = a.load.pmc?.days;
    if (pmcDays?.length && s.context.marathonDate > s.context.eventDate) {
      const plan = suggestTaper(pmcDays, s.context.eventDate, s.context.marathonDate);
      const sim = plan && simulateTaper(pmcDays, s.context.eventDate, s.context.marathonDate, plan);
      if (plan && sim?.raceDay)
        L.push(`**Taper model (hypothesis):** weekly load at ${[...plan.weekPct].reverse().map((p) => `${p}%`).join(" → ")} of baseline over the final ${plan.weekPct.length} weeks projects race-day TSB ${fmtSigned(sim.raceDay.tsb, 0)} with CTL ${fmtSigned(sim.ctlChangePct, 1, "%")} vs event day.`);
    }
    if (r.scenarios.length) {
      L.push("\n**Scenarios (assumption-driven, not predictions):**");
      L.push(row(["Scenario", "Finish", "Pace", "Assumption"]));
      L.push(row(["---", "---", "---", "---"]));
      r.scenarios.forEach((sc) => L.push(row([sc.name, fmtDuration(sc.timeS), fmtPace(sc.paceS), sc.basis])));
      L.push("\nThe event may not have been maximal, it was not run with a full warm-up, and it is 16 km shorter than the marathon; treat these as a bracket for discussion only.");
    }
  }

  // 10
  L.push("\n## 10. Coach's Action Plan");
  L.push(row(["Priority", "Finding", "Supporting evidence", "Recommendation", "Expected benefit", "Confidence"]));
  L.push(row(["---", "---", "---", "---", "---", "---"]));
  a.findings.forEach((f) => L.push(row([f.priority, f.finding, f.evidence, f.recommendation, f.benefit, f.confidence])));

  L.push("\n### Coach's Final Verdict");
  L.push(verdict(a));
  L.push("\n### Data Required for a More Accurate Assessment");
  a.dataGaps.forEach((g) => L.push(`- ${g}`));
  return L.join("\n");
}

function interpretDivergence(pacePct: number, powerPct: number): string {
  if (pacePct > 1 && Math.abs(powerPct) <= 1.5) return "Speed fell at similar power — check elevation, wind and surface before reading this as reduced efficiency.";
  if (pacePct > 1 && powerPct < -1.5) return "Pace and power fell together — consistent with reduced output late (cause not determinable from these data).";
  if (pacePct < -1 && powerPct > 1) return "Faster late with higher power — a deliberate late increase in effort.";
  return "Pace and power moved broadly together.";
}

function verdict(a: Analysis): string {
  const ev = a.event;
  if (!ev) return "Insufficient data for a verdict.";
  const strength =
    ev.pacing.driftPct <= 1 ? "controlled, even pacing to the finish" : ev.decouplingPace.available && (ev.decouplingPace.pct ?? 99) < 5 ? "aerobic stability (low HR decoupling)" : "the ability to sustain a long continuous effort and add further running afterwards";
  const limit = ev.pacing.driftPct > 3 ? `the ${ev.pacing.driftPct.toFixed(1)}% late-event slowdown` : "the absence of fuelling, temperature and maximal-effort context";
  const top = a.findings[0]?.recommendation ?? "consistent long-run execution";
  return `The strongest demonstrated capability was ${strength}. The most important limitation or uncertainty is ${limit}. The highest-priority opportunity: ${top.charAt(0).toLowerCase() + top.slice(1)} ${a.readiness?.phase ?? ""}`.trim();
}
