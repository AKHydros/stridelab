import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Empty, Pill, Stat } from "../components/Bits";
import { GlassTip, Interp, axisProps, gridProps } from "../components/charts/ChartBits";
import type { Analysis } from "../lib/analysis/analyze";
import { cumulative, lapPace } from "../lib/analysis/aggregate";
import { decouplingBand } from "../lib/analysis/physiology";
import type { SessionData } from "../lib/types";
import { fmtNum, fmtPace, fmtSigned } from "../lib/units";

export function Effort({ s, a }: { s: SessionData; a: Analysis }) {
  const ev = a.event;
  if (!ev) return <div className="page"><Empty title="No event data">Import the Garmin split file for the main event.</Empty></div>;
  const rows = cumulative(ev.laps).map(({ lap, startKm, endKm }) => ({
    km: +(((startKm + endKm) / 2).toFixed(2)),
    lap: lap.index,
    hr: lap.avgHr,
    power: lap.power,
    cadence: lap.cadence,
    pace: lapPace(lap),
    gct: lap.gctMs,
    lss: lap.lss,
    fp: lap.formPower,
  }));
  const hasHr = rows.some((r) => r.hr !== undefined);
  const hasPw = rows.some((r) => r.power !== undefined);
  const hasCad = rows.some((r) => r.cadence !== undefined);
  const cp = s.context.criticalPowerW ?? s.stryd?.criticalPowerW;
  const pw = ev.power;
  const d = ev.decouplingPace;
  const dp = ev.decouplingPower;
  const aligned = ev.powerAlignment.source === "stryd-laps" || ev.powerAlignment.source === "garmin-laps";

  const panel = (key: "hr" | "power" | "cadence", color: string, title: string, ref?: number, refLabel?: string) => (
    <>
      <div className="eyebrow" style={{ marginTop: 8 }}>{title}</div>
      <div className="chart sm">
        <ResponsiveContainer>
          <LineChart data={rows} syncId="effort" margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="km" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${Math.round(v)} km`} {...axisProps} />
            <YAxis domain={["auto", "auto"]} width={48} {...axisProps} tickFormatter={(v) => `${Math.round(v)}`} />
            {ref && <ReferenceLine y={ref} stroke="var(--s-neutral)" strokeDasharray="5 4" label={{ value: refLabel, position: "insideTopRight", fill: "var(--text-3)", fontSize: 11 }} />}
            <Tooltip content={({ payload }) => payload?.length ? (
              <GlassTip title={`Lap ${payload[0].payload.lap} · ${payload[0].payload.km} km`} rows={[
                { label: "HR", value: fmtNum(payload[0].payload.hr, 0, "bpm"), color: "var(--s-hr)" },
                { label: "Power", value: fmtNum(payload[0].payload.power, 0, "W"), color: "var(--s-power)" },
                { label: "Cadence", value: fmtNum(payload[0].payload.cadence, 0, "spm"), color: "var(--s-cad)" },
                { label: "Pace", value: fmtPace(payload[0].payload.pace) },
              ]} />) : null} />
            <Line dataKey={key} stroke={color} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: color }} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );

  return (
    <div className="page">
      <div className="grid g4">
        <Stat label="Average HR" value={fmtNum(ev.summary.avgHr, 0)} unit="bpm" foot={ev.intensity.value ? `${ev.intensity.value.toFixed(0)} ${ev.intensity.basis}` : ev.intensity.basis} />
        <Stat label="HR change, 2nd half" value={fmtSigned(ev.hrDriftBpm, 0, "")} unit="bpm" foot="Equal elapsed-time halves" />
        <Stat label="Average power" value={fmtNum(pw.avgPower, 0)} unit="W" foot={pw.pctCp ? `${pw.pctCp.toFixed(0)}% of CP ${cp} W` : "%CP: CP not supplied"} />
        <Stat label="Power variability" value={pw.variabilityIndex ? pw.variabilityIndex.toFixed(2) : fmtNum(pw.lapPowerCvPct, 1)} unit={pw.variabilityIndex ? "VI" : pw.lapPowerCvPct !== undefined ? "% CV" : undefined} foot={pw.variabilityIndex ? "Normalised ÷ average (1 Hz samples)" : "Lap-to-lap, time-weighted"} />
      </div>

      <Card title="Graph 2 · Heart rate and running power" sub="Separate aligned panels, one unit each, sharing the distance axis. Hover any panel to read all three.">
        <div className="callout small">
          <Pill kind={aligned ? "info" : "warn"}>{aligned ? "Lap-aligned" : "Approximate alignment"}</Pill>
          <span>{ev.powerAlignment.note}</span>
        </div>
        {hasHr && panel("hr", "var(--s-hr)", "Heart rate · bpm")}
        {hasPw && panel("power", "var(--s-power)", "Running power · W", cp, cp ? `CP ${cp} W` : undefined)}
        {hasCad && panel("cadence", "var(--s-cad)", "Cadence · steps/min")}
        {!hasHr && !hasPw && <p className="muted">No heart-rate or power data available.</p>}
        <Interp>
          {ev.hrDriftBpm !== undefined && pw.divergence
            ? <>HR rose {fmtSigned(ev.hrDriftBpm, 0, " bpm")} between halves while power changed {fmtSigned(pw.divergence.powerPct, 1, "%")} first-to-final third. {ev.hrDriftBpm > 4 && Math.abs(pw.divergence.powerPct) < 2 ? "Cardiovascular demand rose at similar external workload — consistent with cardiac drift. Heat, hydration, fuelling or fitness could each contribute; these files cannot separate them." : "HR and external workload moved broadly in proportion."}</>
            : "Insufficient combined HR and power data to compare internal and external load."}
        </Interp>
      </Card>

      <div className="grid g2">
        <Card title="Aerobic decoupling" sub={d.method}>
          {d.available ? (
            <>
              <div className="row" style={{ alignItems: "baseline" }}>
                <span style={{ font: "700 34px var(--font-display)" }}>{d.pct!.toFixed(1)}%</span>
                <Pill kind={d.pct! < 5 ? "good" : d.pct! < 10 ? "info" : "warn"}>{d.pct! < 5 ? "Below 5%" : d.pct! < 10 ? "5–10%" : "Above 10%"}</Pill>
              </div>
              <p className="small">EF first half {d.firstHalfEf!.toFixed(3)} → second half {d.secondHalfEf!.toFixed(3)} (m/min per bpm). {decouplingBand(d.pct!)}.</p>
              {dp.available && <p className="small">Power:HR decoupling {dp.pct!.toFixed(1)}% (W per bpm) — less sensitive to terrain than pace.</p>}
              {d.approximated && <p className="small muted">The halfway point falls inside a lap; that lap is apportioned.</p>}
            </>
          ) : (
            <p className="muted">Not available — {d.reason}</p>
          )}
        </Card>

        <Card title="Stryd power analysis" sub="Primary power source. No zones or power-duration curve are inferred.">
          {pw.available ? (
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr><td>Average power</td><td className="num">{fmtNum(pw.avgPower, 0, "W")}</td></tr>
                  <tr><td>Normalised power / VI</td><td className="num">{pw.normalizedPower ? `${pw.normalizedPower.toFixed(0)} W / ${pw.variabilityIndex!.toFixed(2)}` : "Not available (needs 1 Hz samples)"}</td></tr>
                  <tr><td>Lap power CV</td><td className="num">{fmtNum(pw.lapPowerCvPct, 1, "%")}</td></tr>
                  <tr><td>% of critical power</td><td className="num">{pw.pctCp ? `${pw.pctCp.toFixed(0)}%` : "Not available"}</td></tr>
                  <tr><td>Speed per 100 W, early → late</td><td className="num">{pw.speedPerWatt ? `${pw.speedPerWatt.early.toFixed(3)} → ${pw.speedPerWatt.late.toFixed(3)} (${fmtSigned(pw.speedPerWatt.changePct, 1, "%")})` : "—"}</td></tr>
                  <tr><td>Running effectiveness</td><td className="num">{pw.runningEffectiveness ? pw.runningEffectiveness.toFixed(3) : "Needs body mass"}</td></tr>
                  {rows.some((r) => r.fp) && <tr><td>Form power, first → last lap</td><td className="num">{fmtNum(rows.find((r) => r.fp)?.fp, 0)} → {fmtNum([...rows].reverse().find((r) => r.fp)?.fp, 0)} W</td></tr>}
                  {rows.some((r) => r.lss) && <tr><td>Leg spring stiffness, first → last</td><td className="num">{fmtNum(rows.find((r) => r.lss)?.lss, 1)} → {fmtNum([...rows].reverse().find((r) => r.lss)?.lss, 1)} kN/m</td></tr>}
                  {rows.some((r) => r.gct) && <tr><td>Ground contact, first → last</td><td className="num">{fmtNum(rows.find((r) => r.gct)?.gct, 0)} → {fmtNum([...rows].reverse().find((r) => r.gct)?.gct, 0)} ms</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Not available — no power in the Stryd or Garmin files.</p>
          )}
          <p className="small muted">Changes in running dynamics describe what changed, not why. A falling speed-per-watt can come from terrain, wind or surface as well as from mechanics.</p>
        </Card>
      </div>
    </div>
  );
}
