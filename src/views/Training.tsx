import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Empty, Pill, Stat } from "../components/Bits";
import { GlassTip, Interp, Legend, axisProps, gridProps } from "../components/charts/ChartBits";
import type { Analysis } from "../lib/analysis/analyze";
import { fmtDuration, fmtNum, fmtPace } from "../lib/units";

export function Training({ a }: { a: Analysis }) {
  const t = a.training;
  if (!t) return <div className="page"><Empty title="No training history">Import the Garmin activity summary (Activities export) on the Data tab.</Empty></div>;
  const w = t.analysis.windows;
  const weeks = t.weeks.map((x) => ({ ...x, label: x.weekStart.slice(5) }));
  const preWeeks = t.weeks.filter((x) => !x.eventKm && !x.incomplete);
  const baseline = preWeeks.length ? preWeeks.reduce((s, x) => s + x.totalKm, 0) / preWeeks.length : undefined;
  return (
    <div className="page">
      <div className="grid g4">
        {w.map((x) => (
          <Stat key={x.days} label={`${x.days} days pre-event`} value={x.km !== undefined ? x.km.toFixed(1) : "—"} unit={x.km !== undefined ? "km" : undefined} foot={<>{x.runs ?? 0} runs · <Pill kind={x.status === "Complete" ? "good" : "warn"}>{x.status}</Pill></>} />
        ))}
        <Stat label="Acute : chronic" value={t.analysis.acwr ? t.analysis.acwr.toFixed(2) : "—"} foot={t.analysis.loadLabel ?? "Needs a complete 28-day window"} />
      </div>

      <Card title="Graph 4 · Weekly running volume" sub={`Monday-start weeks from ${t.windowStart} (6-month window) · sources: ${t.sources.join(", ")}. Event and additional run are separated and never double-counted. Faded weeks are incomplete.`}>
        <Legend items={[{ label: "Training", color: "var(--s-pace)", box: true }, { label: "Main event", color: "var(--s-power)", box: true }, { label: "Additional run", color: "var(--s-cad)", box: true }]} />
        <div className="chart">
          <ResponsiveContainer>
            <BarChart data={weeks} maxBarSize={56} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis width={40} {...axisProps} unit="" />
              <Tooltip cursor={{ fill: "var(--grid)" }} content={({ payload }) => payload?.length ? (
                <GlassTip title={`Week of ${payload[0].payload.weekStart}${payload[0].payload.incomplete ? " (incomplete)" : ""}`} rows={[
                  { label: "Training", value: `${payload[0].payload.trainingKm.toFixed(1)} km`, color: "var(--s-pace)" },
                  { label: "Event", value: `${payload[0].payload.eventKm.toFixed(1)} km`, color: "var(--s-power)" },
                  { label: "Additional", value: `${payload[0].payload.additionalKm.toFixed(1)} km`, color: "var(--s-cad)" },
                  { label: "Total", value: `${payload[0].payload.totalKm.toFixed(1)} km` },
                  { label: "Runs", value: String(payload[0].payload.runs) },
                ]} />) : null} />
              {(["trainingKm", "eventKm", "additionalKm"] as const).map((k, i) => (
                <Bar key={k} dataKey={k} stackId="v" fill={["var(--s-pace)", "var(--s-power)", "var(--s-cad)"][i]} stroke="var(--glass-solid)" strokeWidth={1} isAnimationActive={false} radius={k === "additionalKm" ? [4, 4, 0, 0] : 0}>
                  {weeks.map((wk) => <Cell key={wk.weekStart} fillOpacity={wk.incomplete ? 0.4 : 1} />)}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Interp>
          {baseline !== undefined ? <>Complete pre-event weeks averaged <b>{baseline.toFixed(1)} km</b>. </> : null}
          {t.analysis.loadLabel ? <>The 7 days before the event were <b>{t.analysis.loadLabel.toLowerCase()}</b> relative to the 28-day baseline (ratio {t.analysis.acwr!.toFixed(2)}). This describes load; it does not by itself establish fatigue or overtraining. </> : null}
          {t.analysis.daysSinceLastQuality !== undefined ? <>The most recent demanding session was {t.analysis.daysSinceLastQuality} day(s) before the event.</> : null}
        </Interp>
      </Card>

      <div className="grid g2">
        <Card title="Long-run comparison" sub="Runs ≥ 18 km in the six weeks before the event.">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Title</th><th className="num">km</th><th className="num">Pace</th><th className="num">HR</th></tr></thead>
              <tbody>
                {t.analysis.longRunComparison.map((r) => (
                  <tr key={r.date + r.title}><td>{r.date}</td><td>{r.title}</td><td className="num">{r.distanceKm.toFixed(1)}</td><td className="num">{fmtPace(r.timeS / r.distanceKm, "")}</td><td className="num">{fmtNum(r.avgHr, 0)}</td></tr>
                ))}
                {a.event && <tr><td><b>Event</b></td><td><b>This session</b></td><td className="num"><b>{a.event.summary.distanceKm.toFixed(1)}</b></td><td className="num"><b>{fmtPace(a.event.summary.paceS, "")}</b></td><td className="num"><b>{fmtNum(a.event.summary.avgHr, 0)}</b></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Demanding sessions & spacing" sub="Flagged when ≥24 km, at/faster than goal pace +10 s/km, or aerobic TE ≥ 4.">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th className="num">Days before</th><th>Why flagged</th></tr></thead>
              <tbody>
                {t.analysis.qualitySessions.slice(0, 8).map((q) => (
                  <tr key={q.record.date + q.record.title}><td>{q.record.date}<div className="small muted">{q.record.distanceKm.toFixed(1)} km · {fmtDuration(q.record.timeS)}</div></td><td className="num">{q.daysBefore}</td><td className="small">{q.reason}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {t.notes.map((n) => <p key={n} className="small muted">{n}</p>)}
        </Card>
      </div>
    </div>
  );
}
