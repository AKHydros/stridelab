import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, type TooltipProps, XAxis, YAxis } from "recharts";
import { Card, Empty, Stat } from "../components/Bits";
import { GlassTip, Interp, Legend, axisProps, gridProps, paceAxis, paceTick } from "../components/charts/ChartBits";
import type { Analysis } from "../lib/analysis/analyze";
import { cumulative, lapPace } from "../lib/analysis/aggregate";
import type { SessionData } from "../lib/types";
import { fmtDuration, fmtNum, fmtPace, fmtSigned } from "../lib/units";

export function After({ s, a }: { s: SessionData; a: Analysis }) {
  const ex = a.extra;
  const ev = a.event;
  if (!ex || !ev) return <div className="page"><Empty title="Need both activities">Import the main-event and additional-run split files.</Empty></div>;
  const gapKnown = s.context.gapMinutes !== undefined;
  const gapMin = s.context.gapMinutes ?? 5;
  const evEnd = ev.summary.timeS / 60;
  const rows = [
    ...cumulative(ev.laps).map(({ lap, startS, endS }) => ({ t: +(((startS + endS) / 2 / 60).toFixed(2)), evPace: lapPace(lap), evHr: lap.avgHr, lap: `Event lap ${lap.index}` })),
    ...cumulative(ex.laps).map(({ lap, startS, endS }) => ({ t: +((evEnd + gapMin + (startS + endS) / 2 / 60).toFixed(2)), exPace: lapPace(lap), exHr: lap.avgHr, lap: `Additional lap ${lap.index}` })),
  ];
  const yAxis = paceAxis(rows.map((r) => ("evPace" in r ? r.evPace : r.exPace)));
  const tip = ({ payload }: TooltipProps<number, string>) =>
    payload?.length && payload[0].payload ? (
      <GlassTip title={payload[0].payload.lap} rows={[
        { label: "Pace", value: fmtPace(payload[0].payload.evPace ?? payload[0].payload.exPace) },
        { label: "HR", value: fmtNum(payload[0].payload.evHr ?? payload[0].payload.exHr, 0, "bpm") },
        { label: "Elapsed", value: `${payload[0].payload.t.toFixed(0)} min` },
      ]} />
    ) : null;
  const gapArea = <ReferenceArea x1={evEnd} x2={evEnd + gapMin} fill="var(--s-neutral)" fillOpacity={0.12} label={{ value: gapKnown ? `${gapMin} min not recorded` : "gap unknown", fill: "var(--text-3)", fontSize: 11, position: "insideTop" }} />;
  return (
    <div className="page">
      <div className="grid g4">
        <Stat label="Additional distance" value={ex.summary.distanceKm.toFixed(2)} unit="km" foot={fmtDuration(ex.summary.timeS)} />
        <Stat label="Additional pace" value={fmtPace(ex.summary.paceS, "")} unit="/km" foot={`${fmtSigned(ex.paceVsEventPct, 1, "%")} vs event avg`} />
        <Stat label="Additional HR" value={fmtNum(ex.summary.avgHr, 0)} unit="bpm" foot={`${fmtSigned(ex.hrVsEventBpm, 0, " bpm")} vs event`} />
        <Stat label="Combined running" value={a.combined ? a.combined.distanceKm.toFixed(2) : "—"} unit="km" foot={a.combined ? `${fmtSigned(a.combined.vsPlannedKm, 2, " km")} vs ${s.context.plannedTotalKm} km plan · walk excluded` : undefined} />
      </div>
      <Card title="Graph 5 · Main event vs additional run" sub="Two separate recordings on one elapsed-time axis. The shaded band is the unrecorded gap; lines are never joined across it.">
        <Legend items={[{ label: "Main event", color: "var(--s-pace)" }, { label: "Additional run", color: "var(--s-power)" }]} />
        <div className="eyebrow">Pace · min/km (faster is higher)</div>
        <div className="chart sm">
          <ResponsiveContainer>
            <LineChart data={rows} syncId="after" margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${Math.round(v)} min`} {...axisProps} />
              <YAxis reversed domain={yAxis.domain} ticks={yAxis.ticks} tickFormatter={paceTick} width={48} {...axisProps} />
              <Tooltip content={tip} />
              {gapArea}
              <Line dataKey="evPace" stroke="var(--s-pace)" strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: "var(--s-pace)" }} connectNulls={false} isAnimationActive={false} />
              <Line dataKey="exPace" stroke="var(--s-power)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--s-power)" }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="eyebrow">Heart rate · bpm</div>
        <div className="chart sm">
          <ResponsiveContainer>
            <LineChart data={rows} syncId="after" margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${Math.round(v)} min`} {...axisProps} />
              <YAxis domain={["auto", "auto"]} width={48} {...axisProps} tickFormatter={(v) => `${Math.round(v)}`} />
              <Tooltip content={tip} />
              {gapArea}
              <Line dataKey="evHr" stroke="var(--s-pace)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              <Line dataKey="exHr" stroke="var(--s-power)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--s-power)" }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <Interp>
          <b>{ex.character}</b> The additional run was {fmtSigned(ex.paceVsFinalThirdPct, 1, "%")} vs the event's final third ({fmtPace(ev.pacing.finalThird.paceS)}). It adds {ex.summary.distanceKm.toFixed(1)} km of running on pre-fatigued legs to the training stimulus; it is not part of the event's standalone result and was not a pre-event warm-up.
        </Interp>
      </Card>
      <Card title="Additional-run laps">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Lap</th><th className="num">km</th><th className="num">Time</th><th className="num">Pace</th><th className="num">HR</th><th className="num">Cadence</th><th className="num">Power</th></tr></thead>
            <tbody>
              {ex.laps.map((l) => (
                <tr key={l.index}><td>{l.index}</td><td className="num">{l.distanceKm.toFixed(2)}</td><td className="num">{fmtDuration(l.timeS)}</td><td className="num">{fmtPace(lapPace(l), "")}</td><td className="num">{fmtNum(l.avgHr, 0)}</td><td className="num">{fmtNum(l.cadence, 0)}</td><td className="num">{fmtNum(l.power, 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
