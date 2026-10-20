import { Card, Pill, Stat } from "../components/Bits";
import { Glass } from "../components/glass/Glass";
import type { Analysis } from "../lib/analysis/analyze";
import type { SessionData } from "../lib/types";
import { fmtDuration, fmtNum, fmtPace, fmtSigned } from "../lib/units";

export function Overview({ s, a }: { s: SessionData; a: Analysis }) {
  const ev = a.event;
  const ex = a.extra;
  const cm = a.combined;
  const c = s.context;
  return (
    <div className="page">
      <Glass className="hero">
        <div className="eyebrow">{c.eventDate} · Executive performance summary</div>
        <h1>{c.eventName || "Your session"}</h1>
        <p>
          {ev
            ? `${ev.summary.distanceKm.toFixed(2)} km event at ${fmtPace(ev.summary.paceS)} — ${ev.pacing.splitType.toLowerCase()}, pacing drift ${fmtSigned(ev.pacing.driftPct, 1, "%")} first-to-final third.${ex ? ` Followed by ${ex.summary.distanceKm.toFixed(2)} km of additional running.` : ""}`
            : "Import your main-event split file to begin."}
        </p>
      </Glass>

      {ev && (
        <div className="grid g4">
          <Stat label="Event distance" value={ev.summary.distanceKm.toFixed(2)} unit="km" foot={`${ev.summary.lapCount} laps`} />
          <Stat label="Event time" value={fmtDuration(ev.summary.timeS)} foot={ev.summary.movingTimeS ? `Moving ${fmtDuration(ev.summary.movingTimeS)}` : "Timer time"} />
          <Stat label="Average pace" value={fmtPace(ev.summary.paceS, "")} unit="/km" foot={a.readiness ? `${fmtSigned(a.readiness.eventVsGoalPct, 1, "%")} vs goal ${fmtPace(c.goalPaceS)}` : undefined} />
          <Stat label="Pacing drift" value={fmtSigned(ev.pacing.driftPct, 1, "")} unit="%" foot="Final vs first third · negative = faster late" />
          <Stat label="Average HR" value={fmtNum(ev.summary.avgHr, 0)} unit={ev.summary.avgHr ? "bpm" : undefined} foot={ev.hrDriftBpm !== undefined ? `${fmtSigned(ev.hrDriftBpm, 0, " bpm")} 2nd half` : undefined} />
          <Stat label="Average power" value={fmtNum(ev.summary.avgPower, 0)} unit={ev.summary.avgPower ? "W" : undefined} foot={ev.power.pctCp ? `${ev.power.pctCp.toFixed(0)}% of CP` : "CP not supplied"} />
          <Stat label="Decoupling (Pa:HR)" value={ev.decouplingPace.available ? ev.decouplingPace.pct!.toFixed(1) : "—"} unit={ev.decouplingPace.available ? "%" : undefined} foot={ev.decouplingPace.available ? "First vs second half" : ev.decouplingPace.reason} />
          <Stat label="Session total" value={cm ? cm.distanceKm.toFixed(2) : "—"} unit={cm ? "km" : undefined} foot={cm ? `${fmtSigned(cm.vsPlannedKm, 2, " km")} vs ${c.plannedTotalKm} km plan` : "Needs additional-run file"} />
        </div>
      )}

      <div className="grid g2">
        <Card title="Performance dashboard" sub="Aggregate pace = total time ÷ total distance. Combined values are time-weighted and exclude the gap between recordings.">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Metric</th><th className="num">Main event</th><th className="num">Additional</th><th className="num">Combined</th></tr>
              </thead>
              <tbody>
                <tr><td>Distance</td><td className="num">{ev ? `${ev.summary.distanceKm.toFixed(2)} km` : "—"}</td><td className="num">{ex ? `${ex.summary.distanceKm.toFixed(2)} km` : "—"}</td><td className="num">{cm ? `${cm.distanceKm.toFixed(2)} km` : "—"}</td></tr>
                <tr><td>Moving time</td><td className="num">{fmtDuration(ev?.summary.movingTimeS)}</td><td className="num">{fmtDuration(ex?.summary.movingTimeS)}</td><td className="num">{fmtDuration(cm?.movingTimeS)}</td></tr>
                <tr><td>Elapsed (timer)</td><td className="num">{fmtDuration(ev?.summary.timeS)}</td><td className="num">{fmtDuration(ex?.summary.timeS)}</td><td className="num">{cm ? fmtDuration(cm.timerTimeS) : "—"}</td></tr>
                <tr><td>Average pace</td><td className="num">{fmtPace(ev?.summary.paceS)}</td><td className="num">{fmtPace(ex?.summary.paceS)}</td><td className="num">{fmtPace(cm?.paceS)}</td></tr>
                <tr><td>Average HR</td><td className="num">{fmtNum(ev?.summary.avgHr, 0, "bpm")}</td><td className="num">{fmtNum(ex?.summary.avgHr, 0, "bpm")}</td><td className="num">{fmtNum(cm?.avgHr, 0, "bpm")}</td></tr>
                <tr><td>Average power</td><td className="num">{fmtNum(ev?.summary.avgPower, 0, "W")}</td><td className="num">{fmtNum(ex?.summary.avgPower, 0, "W")}</td><td className="num">{fmtNum(cm?.avgPower, 0, "W")}</td></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Three key findings" sub="Rule-based from the computed metrics. Full action plan in Report.">
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
            {a.findings.slice(0, 3).map((f) => (
              <li key={f.finding}>
                <b>{f.finding}</b> <Pill kind={f.confidence === "High" ? "good" : f.confidence === "Medium" ? "info" : "warn"}>{f.confidence} confidence</Pill>
                <div className="small muted">{f.evidence}</div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card title="Activity reconstruction & data quality" sub="Validation runs before any interpretation.">
        <div className="table-wrap">
          <table>
            <tbody>
              {a.reconciliation.map((r, i) => (
                <tr key={i}>
                  <td style={{ width: "28%" }}><b>{r.item}</b></td>
                  <td>{r.value}</td>
                  <td className="num"><Pill kind={r.status === "ok" ? "good" : r.status === "warn" ? "warn" : "info"}>{r.status === "ok" ? "Reconciled" : r.status === "warn" ? "Check" : "Note"}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {c.warmupNote && <p className="interp"><b>Context · </b>{c.warmupNote} The walk is not counted as running; the post-event run is not a warm-up.</p>}
      </Card>
    </div>
  );
}
