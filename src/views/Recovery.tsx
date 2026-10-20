import { Area, Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Card, Empty, Pill, Stat } from "../components/Bits";
import { GlassTip, Interp, Legend, axisProps, gridProps } from "../components/charts/ChartBits";
import { Glass } from "../components/glass/Glass";
import type { Analysis } from "../lib/analysis/analyze";
import type { Comparison } from "../lib/analysis/recovery";
import type { SessionData } from "../lib/types";
import { fmtNum, fmtSigned } from "../lib/units";

const lightPill = (l: string) => (l === "green" ? <Pill kind="good">Green · ready</Pill> : l === "amber" ? <Pill kind="warn">Amber · one flag</Pill> : l === "red" ? <Pill kind="bad">Red · several flags</Pill> : <Pill kind="info">Not enough data</Pill>);

function CompareRow({ c }: { c?: Comparison }) {
  if (!c) return null;
  return (
    <tr>
      <td>{c.label}</td>
      <td className="num">{c.good ? c.good.toFixed(3) : "—"} <span className="muted small">({c.goodLabel}, n={c.nGood})</span></td>
      <td className="num">{c.poor ? c.poor.toFixed(3) : "—"} <span className="muted small">({c.poorLabel}, n={c.nPoor})</span></td>
      <td className="num">{c.diffPct !== undefined ? fmtSigned(c.diffPct, 1, "%") : "Too few runs"}</td>
    </tr>
  );
}

export function Recovery({ s, a }: { s: SessionData; a: Analysis }) {
  const r = a.recovery;
  if (!r) return <div className="page"><Empty title="No recovery data">Import overnight HRV, resting HR and/or sleep on the Data tab (Garmin Connect HRV & Sleep exports, Oura, Whoop, or any CSV with a date column).</Empty></div>;
  const from = r.points.length > 120 ? r.points[r.points.length - 120].date : r.points[0]?.date;
  const rows = r.points
    .filter((p) => p.date >= from)
    .map((p) => ({ ...p, hrv7: p.ln7 !== undefined ? Math.exp(p.ln7) : undefined, band: p.bandLo !== undefined ? [Math.exp(p.bandLo), Math.exp(p.bandHi!)] : undefined }));
  const L = r.latest;
  const pe = r.preEvent;
  const corr = r.loadResponse;
  return (
    <div className="page">
      <Glass className="hero">
        <div className="eyebrow">Recovery · HRV, sleep, resting HR</div>
        <h1>Recovery dashboard</h1>
        <p>{r.method} The traffic light counts simple, visible flags; it is not a proprietary readiness score and never a diagnosis.</p>
      </Glass>
      <div className="grid g4">
        <Stat label={`Latest (${L?.date ?? "—"})`} value={L ? lightPill(L.light) : "—"} foot={L?.flags.join(" · ") || "No flags"} />
        <Stat label="HRV 7-day vs baseline" value={L?.ln7 !== undefined && L.baseline !== undefined ? fmtSigned((Math.exp(L.ln7 - L.baseline) - 1) * 100, 0, "") : "—"} unit="%" foot={L?.status} />
        <Stat label="Sleep, 7-night mean" value={fmtNum(L?.sleep7, 1)} unit="h" foot={L?.sleepScore ? `Last score ${L.sleepScore}` : undefined} />
        <Stat label="Resting HR vs 30-day" value={L?.restingHr !== undefined && L.rhr30 !== undefined ? fmtSigned(L.restingHr - L.rhr30, 0, "") : "—"} unit="bpm" foot={L?.restingHr ? `${L.restingHr} bpm` : undefined} />
      </div>

      <Card title="HRV trend" sub="Daily rMSSD (dots), 7-day rolling mean (line) and the normal band from the previous 60 days. Last ~4 months shown.">
        <Legend items={[{ label: "Daily HRV", color: "var(--s-neutral)" }, { label: "7-day mean", color: "var(--s-violet)" }, { label: "Normal band", color: "var(--good)", box: true }]} />
        <div className="chart">
          <ResponsiveContainer>
            <ComposedChart data={rows} syncId="rec" margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} minTickGap={28} {...axisProps} />
              <YAxis width={44} domain={["auto", "auto"]} tickFormatter={(v) => `${Math.round(v)}`} {...axisProps} />
              <ReferenceLine x={s.context.eventDate} stroke="var(--s-neutral)" strokeDasharray="5 4" label={{ value: "Event", fill: "var(--text-3)", fontSize: 11, position: "insideTopLeft" }} />
              <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={payload[0].payload.date} rows={[{ label: "HRV", value: fmtNum(payload[0].payload.hrv, 0, "ms") }, { label: "7-day mean", value: fmtNum(payload[0].payload.hrv7, 0, "ms"), color: "var(--s-violet)" }, { label: "Status", value: payload[0].payload.status }]} /> : null} />
              <Area dataKey="band" stroke="none" fill="var(--good)" fillOpacity={0.14} isAnimationActive={false} />
              <Line dataKey="hrv" stroke="none" dot={{ r: 2, fill: "var(--s-neutral)", strokeWidth: 0 }} isAnimationActive={false} />
              <Line dataKey="hrv7" stroke="var(--s-violet)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="eyebrow">Sleep · hours</div>
        <div className="chart sm" style={{ height: 140 }}>
          <ResponsiveContainer>
            <ComposedChart data={rows} syncId="rec" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} minTickGap={28} {...axisProps} />
              <YAxis width={44} domain={[0, 10]} {...axisProps} />
              <ReferenceLine y={7} stroke="var(--s-neutral)" strokeDasharray="5 4" />
              <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={payload[0].payload.date} rows={[{ label: "Sleep", value: fmtNum(payload[0].payload.sleepHours, 1, "h"), color: "var(--s-pace)" }, { label: "Score", value: fmtNum(payload[0].payload.sleepScore, 0) }]} /> : null} />
              <Bar dataKey="sleepHours" fill="var(--s-pace)" maxBarSize={6} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="eyebrow">Resting heart rate · bpm</div>
        <div className="chart sm" style={{ height: 130 }}>
          <ResponsiveContainer>
            <LineChart data={rows} syncId="rec" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} minTickGap={28} {...axisProps} />
              <YAxis width={44} domain={["auto", "auto"]} {...axisProps} />
              <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={payload[0].payload.date} rows={[{ label: "Resting HR", value: fmtNum(payload[0].payload.restingHr, 0, "bpm"), color: "var(--s-hr)" }]} /> : null} />
              <Line dataKey="restingHr" stroke="var(--s-hr)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <Interp><b>Entering the event:</b> {pe.summary}</Interp>
      </Card>

      <div className="grid g2">
        <Card title="Impact of training on recovery" sub={corr?.label ?? "Needs training load (threshold pace or HR inputs) and HRV"}>
          {corr ? (
            <>
              <div className="chart">
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke="var(--grid)" />
                    <XAxis type="number" dataKey="x" name="Load" {...axisProps} tickFormatter={(v) => `${Math.round(v)}`} />
                    <YAxis type="number" dataKey="y" name="HRV" width={44} {...axisProps} tickFormatter={(v) => `${Math.round(v)}%`} />
                    <ZAxis range={[28, 28]} />
                    <ReferenceLine y={0} stroke="var(--text-3)" />
                    <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={payload[0].payload.date} rows={[{ label: "Previous day load", value: payload[0].payload.x.toFixed(0) }, { label: "HRV vs baseline", value: fmtSigned(payload[0].payload.y, 0, "%") }]} /> : null} />
                    <Scatter data={corr.points} fill="var(--s-violet)" fillOpacity={0.7} isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <Interp>Pearson r = <b>{corr.r !== undefined ? corr.r.toFixed(2) : "n/a"}</b> (n = {corr.n}). {corr.note}</Interp>
            </>
          ) : <p className="muted">Not available.</p>}
        </Card>
        <Card title="Impact of recovery on training" sub="Aerobic efficiency (metres per minute per heartbeat) of runs on mornings after good vs poor recovery. Higher = more speed for the same HR.">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Comparison</th><th className="num">Good</th><th className="num">Poor</th><th className="num">Poor vs good</th></tr></thead>
              <tbody>
                <CompareRow c={r.sleepVsEf} />
                <CompareRow c={r.hrvVsEf} />
              </tbody>
            </table>
          </div>
          <p className="small muted">Mixes easy runs and workouts, so pace choice confounds it; treat a difference of a few percent as a hint to watch, not proof.</p>
        </Card>
      </div>
    </div>
  );
}
