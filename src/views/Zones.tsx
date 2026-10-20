import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Pill } from "../components/Bits";
import { GlassTip, Interp, Legend, axisProps } from "../components/charts/ChartBits";
import { Glass } from "../components/glass/Glass";
import type { Analysis } from "../lib/analysis/analyze";
import { type ZoneDistribution, type ZoneSet, zoneOf } from "../lib/analysis/zones";
import type { SessionData } from "../lib/types";
import { fmtDuration, fmtPace } from "../lib/units";

const ZC = ["var(--z1)", "var(--z2)", "var(--z3)", "var(--z4)", "var(--z5)"];

function range(set: ZoneSet, lo: number, hi: number): string {
  if (set.kind === "pace") {
    if (hi > 1000) return `slower than ${fmtPace(lo, "")}`;
    if (lo <= 0) return `faster than ${fmtPace(hi, "")}`;
    return `${fmtPace(hi, "")} – ${fmtPace(lo, "")}`;
  }
  if (lo <= 0) return `< ${Math.round(hi)} ${set.unit}`;
  if (hi > 900) return `≥ ${Math.round(lo)} ${set.unit}`;
  return `${Math.round(lo)} – ${Math.round(hi) - 1} ${set.unit}`;
}

function Distribution({ title, ev, ex }: { title: string; ev?: ZoneDistribution; ex?: ZoneDistribution }) {
  if (!ev) return null;
  // One stacked bar per activity, segments in zone order (sequential ramp).
  const data = [
    { name: "Main event", ...Object.fromEntries(ev.rows.map((r) => [r.zone.id, r.pct])), _s: Object.fromEntries(ev.rows.map((r) => [r.zone.id, r.seconds])) },
    ...(ex ? [{ name: "Additional", ...Object.fromEntries(ex.rows.map((r) => [r.zone.id, r.pct])), _s: Object.fromEntries(ex.rows.map((r) => [r.zone.id, r.seconds])) }] : []),
  ];
  return (
    <>
      <div className="eyebrow" style={{ marginTop: 14 }}>{title} · time in zone</div>
      <Legend items={ev.set.zones.map((z, i) => ({ label: `${z.id} ${z.name}`, color: ZC[i], box: true }))} />
      <div className="chart" style={{ height: ex ? 120 : 76 }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barSize={22}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="name" width={86} {...axisProps} />
            <Tooltip cursor={{ fill: "var(--grid)" }} content={({ payload }) => payload?.length ? (
              <GlassTip title={payload[0].payload.name} rows={ev.set.zones.map((z, i) => ({ label: `${z.id} ${z.name}`, value: `${(payload[0].payload[z.id] ?? 0).toFixed(0)}% · ${fmtDuration(payload[0].payload._s[z.id] ?? 0)}`, color: ZC[i] }))} />
            ) : null} />
            {ev.set.zones.map((z, i) => <Bar key={z.id} dataKey={z.id} stackId="z" fill={ZC[i]} stroke="var(--glass-solid)" strokeWidth={1} isAnimationActive={false} radius={i === 4 ? [0, 4, 4, 0] : i === 0 ? [4, 0, 0, 4] : 0} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="small muted" style={{ margin: 0 }}>{ev.method}</p>
    </>
  );
}

function ZoneCard({ title, set, missing, ev, ex, goal, goalLabel }: { title: string; set?: ZoneSet; missing: string; ev?: ZoneDistribution; ex?: ZoneDistribution; goal?: number; goalLabel?: string }) {
  if (!set) return <Card title={title} sub="Not available"><p className="muted">{missing}</p></Card>;
  const goalZone = goal !== undefined ? zoneOf(set, goal) : undefined;
  const top = ev ? [...ev.rows].sort((a, b) => b.seconds - a.seconds)[0] : undefined;
  return (
    <Card title={title} sub={set.basis}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Zone</th><th>Range</th><th>Purpose</th><th className="num">Event</th></tr></thead>
          <tbody>
            {set.zones.map((z, i) => (
              <tr key={z.id}>
                <td><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: ZC[i], marginRight: 8 }} /><b>{z.id}</b> {z.name}{goalZone?.id === z.id && <> <Pill kind="info">{goalLabel}</Pill></>}</td>
                <td>{range(set, z.lo, z.hi)}</td>
                <td className="small">{z.purpose}</td>
                <td className="num">{ev ? `${ev.rows[i].pct.toFixed(0)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Distribution title={title} ev={ev} ex={ex} />
      {top && (
        <Interp>
          Most event time was in <b>{top.zone.id} {top.zone.name}</b> ({top.pct.toFixed(0)}%).
          {goalZone ? <> {goalLabel} falls in <b>{goalZone.id} {goalZone.name}</b>{goalLabel === "Goal pace" ? " — marathon pace normally belongs in Z2–Z3; higher means the goal is ambitious relative to threshold." : "."}</> : null}
        </Interp>
      )}
    </Card>
  );
}

export function Zones({ s, a }: { s: SessionData; a: Analysis }) {
  const z = a.zones;
  const c = s.context;
  return (
    <div className="page">
      <Glass className="hero">
        <div className="eyebrow">Run zones · power, heart rate, pace</div>
        <h1>Training zones</h1>
        <p>Zones are built only from anchors you supply — critical power, LTHR / max & resting HR, threshold pace — and are never inferred. Time in zone uses per-second Stryd data when available, otherwise lap averages.</p>
      </Glass>
      <div className="grid g2">
        <ZoneCard title="Power zones" set={z.power} missing="Add critical power (Data tab, or a CP value in the Stryd file)." ev={a.zones.event.power} ex={a.zones.extra.power} goal={a.event?.summary.avgPower} goalLabel="Event avg" />
        <ZoneCard title="Heart-rate zones" set={z.hr} missing="Add LTHR, or max and resting HR, on the Data tab." ev={a.zones.event.hr} ex={a.zones.extra.hr} />
        <ZoneCard title="Pace zones" set={z.pace} missing="Add your threshold pace (≈ the pace you could race for one hour) on the Data tab." ev={a.zones.event.pace} ex={a.zones.extra.pace} goal={c.goalPaceS} goalLabel="Goal pace" />
      </div>
    </div>
  );
}
