import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Empty, Stat } from "../components/Bits";
import { GlassTip, Interp, Legend, axisProps, gridProps, paceAxis, paceTick } from "../components/charts/ChartBits";
import type { Analysis } from "../lib/analysis/analyze";
import { cumulative, lapPace } from "../lib/analysis/aggregate";
import { gapPace } from "../lib/analysis/pacing";
import type { SessionData } from "../lib/types";
import { fmtNum, fmtPace, fmtSigned } from "../lib/units";

export function Pacing({ s, a }: { s: SessionData; a: Analysis }) {
  const ev = a.event;
  if (!ev) return <div className="page"><Empty title="No event data">Import the Garmin split file for the main event.</Empty></div>;
  const p = ev.pacing;
  let ele = 0;
  const rows = cumulative(ev.laps).map(({ lap, startKm, endKm }) => {
    ele += (lap.ascentM ?? 0) - (lap.descentM ?? 0);
    return {
      km: +(((startKm + endKm) / 2).toFixed(2)),
      endKm: +endKm.toFixed(2),
      lap: lap.index,
      pace: lapPace(lap),
      gap: lap.distanceKm >= 0.4 ? gapPace([lap]) : undefined,
      hr: lap.avgHr,
      power: lap.power,
      ele,
      partial: lap.distanceKm < 0.4,
    };
  });
  const full = rows.filter((r) => !r.partial);
  const hasEle = ev.laps.some((l) => l.ascentM !== undefined);
  const goal = s.context.goalPaceS;
  const yAxis = paceAxis([...rows.flatMap((r) => [r.pace, r.gap]), goal]);

  const early = p.firstThird;
  const late = p.finalThird;
  const pct = (x?: number, y?: number) => (x !== undefined && y !== undefined && y ? ((x - y) / y) * 100 : undefined);
  const deltas = [
    { metric: "Pace", v: pct(late.paceS, early.paceS), note: "+ = slower" },
    { metric: "Grade-adj. pace", v: pct(late.gapPaceS, early.gapPaceS), note: "+ = slower" },
    { metric: "Heart rate", v: pct(late.avgHr, early.avgHr), note: "" },
    { metric: "Power", v: pct(late.avgPower, early.avgPower), note: "" },
    { metric: "Cadence", v: pct(late.avgCadence, early.avgCadence), note: "" },
  ].filter((d) => d.v !== undefined) as { metric: string; v: number; note: string }[];

  return (
    <div className="page">
      <div className="grid g4">
        <Stat label="Split" value={p.splitType} foot={`2nd half ${fmtSigned(p.splitDiffS, 0, " s")} vs 1st`} />
        <Stat label="First third" value={fmtPace(early.paceS, "")} unit="/km" foot={`${early.distanceKm.toFixed(2)} km`} />
        <Stat label="Final third" value={fmtPace(late.paceS, "")} unit="/km" foot={`Drift ${fmtSigned(p.driftPct, 1, "%")}`} />
        <Stat label="Lap pace variability" value={fmtNum(p.paceCvPct, 1)} unit="% CV" foot="Distance-weighted, laps ≥ 400 m" />
      </div>

      <Card title="Graph 1 · Main-event pace by distance" sub="Lap-level pace at each lap's midpoint. Faster is higher. Dashed line = goal marathon pace.">
        <Legend items={[{ label: "Lap pace", color: "var(--s-pace)" }, ...(hasEle ? [{ label: "Grade-adjusted pace (approx.)", color: "var(--s-violet)" }] : []), { label: "Goal pace", color: "var(--s-neutral)", dashed: true }]} />
        <div className="chart lg">
          <ResponsiveContainer>
            <LineChart data={rows} syncId="pace" margin={{ top: 18, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="km" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${Math.round(v)} km`} {...axisProps} />
              <YAxis reversed domain={yAxis.domain} ticks={yAxis.ticks} tickFormatter={paceTick} width={48} {...axisProps} />
              <Tooltip content={({ payload }) => payload?.length ? (
                <GlassTip title={`Lap ${payload[0].payload.lap} · ${payload[0].payload.km} km`} rows={[
                  { label: "Pace", value: fmtPace(payload[0].payload.pace), color: "var(--s-pace)" },
                  ...(payload[0].payload.gap ? [{ label: "GAP", value: fmtPace(payload[0].payload.gap), color: "var(--s-violet)" }] : []),
                  { label: "HR", value: fmtNum(payload[0].payload.hr, 0, "bpm") },
                  { label: "Power", value: fmtNum(payload[0].payload.power, 0, "W") },
                ]} />) : null} />
              <ReferenceLine y={goal} stroke="var(--s-neutral)" strokeDasharray="5 4" />
              {hasEle && <Line dataKey="gap" stroke="var(--s-violet)" strokeWidth={1.5} dot={false} isAnimationActive={false} strokeOpacity={0.8} />}
              <Line dataKey="pace" stroke="var(--s-pace)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--s-pace)" }} activeDot={{ r: 5 }} isAnimationActive={false} />
              {p.changes.map((ch) => {
                const r = rows.find((x) => x.lap === ch.lap.index);
                return r ? <ReferenceDot key={ch.lap.index} x={r.km} y={r.pace} r={6} fill="none" stroke="var(--text)" strokeWidth={1.5} label={{ value: `${ch.deltaPct > 0 ? "+" : ""}${ch.deltaPct.toFixed(0)}%`, position: "top", fill: "var(--text-2)", fontSize: 11 }} /> : null;
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {hasEle && (
          <div className="chart sm" style={{ height: 120 }}>
            <ResponsiveContainer>
              <AreaChart data={rows} syncId="pace" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                <XAxis dataKey="km" type="number" domain={[0, "dataMax"]} hide />
                <YAxis width={48} {...axisProps} tickFormatter={(v) => `${v} m`} />
                <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={`${payload[0].payload.km} km`} rows={[{ label: "Net elevation", value: `${payload[0].payload.ele.toFixed(0)} m` }]} /> : null} />
                <Area dataKey="ele" stroke="var(--s-neutral)" fill="var(--s-neutral)" fillOpacity={0.18} strokeWidth={1.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <Interp>
          {p.driftPct > 3
            ? <>Pace held to roughly the {Math.round((2 * ev.summary.distanceKm) / 3)} km mark, then slowed materially: final third {fmtPace(late.paceS)} vs {fmtPace(early.paceS)} early ({fmtSigned(p.driftPct, 1, "%")}). </>
            : p.driftPct > 1
              ? <>A modest late fade: final third {fmtPace(late.paceS)} vs {fmtPace(early.paceS)} early ({fmtSigned(p.driftPct, 1, "%")}). </>
              : p.driftPct < -1
                ? <>The athlete finished faster than they started ({fmtSigned(p.driftPct, 1, "%")}), a controlled execution. </>
                : <>Pacing was essentially even ({fmtSigned(p.driftPct, 1, "%")} first-to-final third). </>}
          {p.changes.length ? <>Circled laps moved ≥4% vs the preceding three laps — check the elevation strip before attributing them to fatigue. </> : null}
          {full.length && Math.min(...full.map((r) => r.pace)) <= goal ? "Several laps were at or faster than goal pace." : "No full lap reached goal marathon pace."}
        </Interp>
      </Card>

      <div className="grid g2">
        <Card title="Graph 3 · Early vs late execution" sub={`Change from first third (0–${early.toKm.toFixed(1)} km) to final third (${late.fromKm.toFixed(1)}–${late.toKm.toFixed(1)} km). Faded bars: < 2% change.`}>
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={deltas} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`} {...axisProps} domain={[(min: number) => Math.min(-4, Math.floor(min)), (max: number) => Math.max(4, Math.ceil(max))]} />
                <YAxis type="category" dataKey="metric" width={112} {...axisProps} />
                <ReferenceLine x={0} stroke="var(--text-3)" />
                <Tooltip cursor={{ fill: "var(--grid)" }} content={({ payload }) => payload?.length ? <GlassTip title={payload[0].payload.metric} rows={[{ label: "Change", value: fmtSigned(payload[0].payload.v, 1, "%") }, ...(payload[0].payload.note ? [{ label: "Convention", value: payload[0].payload.note }] : [])]} /> : null} />
                <Bar dataKey="v" radius={4} barSize={18} isAnimationActive={false} label={{ position: "right", formatter: (v: number) => fmtSigned(v, 1, "%"), fill: "var(--text-2)", fontSize: 11 }}>
                  {deltas.map((d) => <Cell key={d.metric} fill="var(--s-violet)" fillOpacity={Math.abs(d.v) >= 2 ? 1 : 0.35} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Interp>
            {ev.power.divergence
              ? Math.abs(ev.power.divergence.powerPct) <= 1.5 && ev.power.divergence.pacePct > 1
                ? "Power held while pace slowed: speed was lower for similar measured output. Check terrain, wind and surface before reading this as reduced efficiency."
                : ev.power.divergence.powerPct < -1.5 && ev.power.divergence.pacePct > 1
                  ? "Pace and power fell together late — output was reduced. The data cannot say whether that was fatigue, a decision, or conditions."
                  : "Pace and power moved together; no material divergence."
              : "Power not available; the comparison relies on pace, HR and grade."}
          </Interp>
        </Card>

        <Card title="5 km segments" sub="* boundary inside a lap → apportioned assuming uniform pace within the lap.">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Segment</th><th className="num">Pace</th><th className="num">GAP</th><th className="num">HR</th><th className="num">Power</th><th className="num">Cad.</th></tr></thead>
              <tbody>
                {p.segments.map((sg) => (
                  <tr key={sg.label}>
                    <td>{sg.label}{sg.approximated ? "*" : ""}</td>
                    <td className="num">{fmtPace(sg.paceS, "")}</td>
                    <td className="num">{sg.gapPaceS ? fmtPace(sg.gapPaceS, "") : "—"}</td>
                    <td className="num">{fmtNum(sg.avgHr, 0)}</td>
                    <td className="num">{fmtNum(sg.avgPower, 0)}</td>
                    <td className="num">{fmtNum(sg.avgCadence, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">GAP uses Minetti's energy-cost model on net lap grade (downhill benefit capped). It cannot see rolling terrain within a lap.</p>
        </Card>
      </div>
    </div>
  );
}
