import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Empty, Pill, Stat } from "../components/Bits";
import { GlassTip, Interp, Legend, axisProps, gridProps } from "../components/charts/ChartBits";
import { Glass } from "../components/glass/Glass";
import type { Analysis } from "../lib/analysis/analyze";
import type { SessionData } from "../lib/types";
import { fmtDuration, fmtNum, fmtPace, fmtSigned } from "../lib/units";
import { TaperCard } from "./Taper";

const dur = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(s % 3600 ? 1 : 0)}h`);

export function Load({ s, a }: { s: SessionData; a: Analysis }) {
  const L = a.load;
  const pmc = L.pmc;
  const ev = pmc?.atEvent;
  const days = pmc?.days ?? [];
  const weekAgo = days.length > 7 && ev ? days[days.indexOf(ev) - 7] : undefined;
  const ramp = ev && weekAgo ? ev.ctl - weekAgo.ctl : undefined;
  const cp = s.context.criticalPowerW ?? s.stryd?.criticalPowerW;

  return (
    <div className="page">
      <Glass className="hero">
        <div className="eyebrow">Inspired by GoldenCheetah</div>
        <h1>Load & performance curves</h1>
        <p>Fitness, fatigue and form from your training log; best efforts and the mean-maximal power curve from the event; critical-power modelling and W′ balance — each shown only when the inputs support it.</p>
      </Glass>

      {pmc && pmc.days.length ? (
        <>
          <div className="grid g4">
            <Stat label="Fitness (CTL) at event" value={fmtNum(ev?.ctl, 0)} foot="42-day weighted load" />
            <Stat label="Fatigue (ATL) at event" value={fmtNum(ev?.atl, 0)} foot="7-day weighted load" />
            <Stat label="Form (TSB) entering event" value={fmtSigned(ev?.tsb, 0, "")} foot={ev ? (ev.tsb > 5 ? "Fresh" : ev.tsb > -10 ? "Neutral" : ev.tsb > -30 ? "Productive fatigue" : "High fatigue") : undefined} />
            <Stat label="CTL ramp, last 7 days" value={fmtSigned(ramp, 1, "")} foot="Per week; > 5–8 is aggressive" />
          </div>
          <Card title="Performance Manager Chart" sub={`${pmc.stress.basis} · ${pmc.stress.scored} runs scored${pmc.stress.skipped ? `, ${pmc.stress.skipped} skipped (missing inputs)` : ""}.`}>
            <Legend items={[{ label: "Fitness (CTL)", color: "var(--s-pace)" }, { label: "Fatigue (ATL)", color: "var(--s-hr)" }, { label: "Event day", color: "var(--s-neutral)", dashed: true }]} />
            <div className="chart">
              <ResponsiveContainer>
                <LineChart data={days} syncId="pmc" margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} minTickGap={28} {...axisProps} />
                  <YAxis width={40} {...axisProps} />
                  <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={payload[0].payload.date} rows={[{ label: "Load", value: payload[0].payload.load.toFixed(0) }, { label: "CTL", value: payload[0].payload.ctl.toFixed(1), color: "var(--s-pace)" }, { label: "ATL", value: payload[0].payload.atl.toFixed(1), color: "var(--s-hr)" }, { label: "TSB", value: fmtSigned(payload[0].payload.tsb, 1) }]} /> : null} />
                  {ev && <ReferenceLine x={ev.date} stroke="var(--s-neutral)" strokeDasharray="5 4" />}
                  <Line dataKey="ctl" stroke="var(--s-pace)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="atl" stroke="var(--s-hr)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="eyebrow">Form (TSB)</div>
            <div className="chart sm" style={{ height: 130 }}>
              <ResponsiveContainer>
                <AreaChart data={days} syncId="pmc" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} minTickGap={28} {...axisProps} />
                  <YAxis width={40} {...axisProps} />
                  <ReferenceLine y={0} stroke="var(--text-3)" />
                  {ev && <ReferenceLine x={ev.date} stroke="var(--s-neutral)" strokeDasharray="5 4" />}
                  <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={payload[0].payload.date} rows={[{ label: "TSB", value: fmtSigned(payload[0].payload.tsb, 1) }]} /> : null} />
                  <Area dataKey="tsb" stroke="var(--s-violet)" fill="var(--s-violet)" fillOpacity={0.2} strokeWidth={1.5} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <Interp>
              The first ~{pmc.rampInDays} days of the log are a ramp-in period: CTL starts from zero, so early values understate true fitness. {ev ? <>You entered the event at TSB <b>{fmtSigned(ev.tsb, 0)}</b>. </> : null}
              For a marathon, many athletes arrive at TSB around +5 to +15 after a 2–3 week taper — treat this as a model, not a measurement.
            </Interp>
          </Card>
          <TaperCard history={pmc.days} eventDate={s.context.eventDate} raceDate={s.context.marathonDate} />
        </>
      ) : (
        <Card title="Performance Manager Chart" sub="Not available">
          <p className="muted">{pmc?.stress.basis ?? "Import the Garmin activity summary"}{pmc ? "" : ", and add a threshold pace (or max + resting HR) on the Data tab."}</p>
        </Card>
      )}

      <div className="grid g2">
        <Card title="Best efforts in the event" sub="Fastest continuous span of each distance (uniform pace within a lap assumed).">
          {L.bestEfforts.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Distance</th><th className="num">Time</th><th className="num">Pace</th><th className="num">From</th></tr></thead>
                <tbody>
                  {L.bestEfforts.map((b) => (
                    <tr key={b.label}><td>{b.label}</td><td className="num">{b.timeS ? fmtDuration(b.timeS) : "—"}</td><td className="num">{b.paceS ? fmtPace(b.paceS, "") : "—"}</td><td className="num">{b.startKm !== undefined ? `km ${b.startKm.toFixed(1)}` : "Longer than event"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">Needs the main-event split file.</p>}
          <p className="small muted">These are best segments of a long, steady run — not race performances at those distances.</p>
        </Card>

        <Card title="Critical-power model" sub="Two-parameter model (work = CP·t + W′) fitted on 3–20 min mean-maximal power.">
          {L.cpFit.available ? (
            <>
              <div className="row"><Pill kind="info">Model estimate</Pill></div>
              <p>CP <b>{L.cpFit.cp!.toFixed(0)} W</b> · W′ <b>{(L.cpFit.wPrimeJ! / 1000).toFixed(1)} kJ</b> · R² {L.cpFit.r2!.toFixed(3)}</p>
              <p className="small muted">Supplied CP ({cp ?? "none"}) is still used for zones; compare the two rather than replacing one with the other.</p>
            </>
          ) : (
            <p className="muted">Not available — {L.cpFit.reason}</p>
          )}
        </Card>
      </div>

      {L.mmp.length > 1 ? (
        <Card title="Mean-maximal power curve" sub={`Best average power for each duration · ${L.mmpSource}.`}>
          <Legend items={[{ label: "Mean-maximal power", color: "var(--s-power)" }, ...(cp ? [{ label: `CP ${cp} W`, color: "var(--s-neutral)", dashed: true }] : [])]} />
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={L.mmp} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="durationS" type="number" scale="log" domain={["dataMin", "dataMax"]} ticks={L.mmp.map((m) => m.durationS).filter((_, i, arr) => arr.length < 10 || i % 2 === 0)} tickFormatter={dur} {...axisProps} />
                <YAxis width={44} domain={["auto", "auto"]} {...axisProps} />
                {cp && <ReferenceLine y={cp} stroke="var(--s-neutral)" strokeDasharray="5 4" />}
                <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={dur(payload[0].payload.durationS)} rows={[{ label: "Best avg power", value: `${payload[0].payload.power.toFixed(0)} W`, color: "var(--s-power)" }, ...(cp ? [{ label: "% CP", value: `${((payload[0].payload.power / cp) * 100).toFixed(0)}%` }] : [])]} /> : null} />
                <Line dataKey="power" stroke="var(--s-power)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--s-power)" }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Interp>A curve from one steady event is flat by nature — it shows what you held, not what you can do. Building it across all your runs (GoldenCheetah's approach) is on the roadmap.</Interp>
        </Card>
      ) : null}

      {L.wbal ? (
        <Card title="W′ balance through the event" sub={L.wbal.basis}>
          <div className="chart">
            <ResponsiveContainer>
              <AreaChart data={L.wbal.points.filter((_, i, arr) => arr.length < 1500 || i % Math.ceil(arr.length / 1500) === 0).map((p) => ({ min: p.timeS / 60, kj: p.wbal / 1000 }))} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="min" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${Math.round(v)} min`} {...axisProps} />
                <YAxis width={44} domain={[0, Math.ceil(L.wbal.wPrimeJ / 1000)]} tickFormatter={(v) => `${v} kJ`} {...axisProps} />
                <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={`${payload[0].payload.min.toFixed(1)} min`} rows={[{ label: "W′ balance", value: `${payload[0].payload.kj.toFixed(1)} kJ`, color: "var(--s-violet)" }]} /> : null} />
                <Area dataKey="kj" stroke="var(--s-violet)" fill="var(--s-violet)" fillOpacity={0.2} strokeWidth={1.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <Interp>
            Lowest W′ balance <b>{(L.wbal.minJ / 1000).toFixed(1)} kJ</b> ({((L.wbal.minJ / L.wbal.wPrimeJ) * 100).toFixed(0)}% of W′). {L.wbal.minJ / L.wbal.wPrimeJ < 0.5 ? "Deep dips mean surges above CP drew heavily on finite anaerobic capacity — costly in a marathon." : "Little of W′ was used: the effort stayed mostly at or below CP, as marathon pacing should."}
          </Interp>
        </Card>
      ) : (
        !cp ? null : <Empty title="W′ balance not available">Add your W′ (anaerobic capacity, in joules — Stryd reports it alongside CP) on the Data tab.</Empty>
      )}
    </div>
  );
}
