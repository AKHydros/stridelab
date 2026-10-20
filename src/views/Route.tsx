import "leaflet/dist/leaflet.css";
import { useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip as LTooltip } from "react-leaflet";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Empty, Stat } from "../components/Bits";
import { GlassTip, Interp, Legend, axisProps, gridProps } from "../components/charts/ChartBits";
import { coursePlan, smoothElevation } from "../lib/analysis/coursePlan";
import { MARATHON_KM } from "../lib/analysis/readiness";
import { type Conditions, heatAdjustment } from "../lib/conditions";
import type { RoutePoint, SessionData } from "../lib/types";
import { fmtDuration, fmtNum, fmtPace, fmtSigned } from "../lib/units";
import { compass } from "../lib/weather";

/** Diverging grade colours: cool = downhill, neutral = flat, warm = uphill. */
function gradeColor(g: number): string {
  if (g > 0.04) return "#c2410c";
  if (g > 0.015) return "#f59e0b";
  if (g < -0.04) return "#1d4ed8";
  if (g < -0.015) return "#60a5fa";
  return "#9ca3af";
}

export function Route({ s, conditions }: { s: SessionData; conditions: Conditions }) {
  const route = s.route;
  const [effort, setEffort] = useState(0.6);
  const [useHeat, setUseHeat] = useState(true);
  const [planFor, setPlanFor] = useState<"marathon" | "route">("route");
  const [useWind, setUseWind] = useState(true);
  const [exposure, setExposure] = useState(0.7);
  const pts = route?.points ?? [];
  const total = pts.length ? pts[pts.length - 1].distKm : 0;
  const heat = heatAdjustment(conditions);
  const pace = s.context.goalPaceS * (useHeat ? 1 + heat.pct / 100 : 1);

  const { segments, profile, gain, loss } = useMemo(() => buildGeometry(pts), [pts]);
  // Scale the route to marathon length when planning a marathon on a different-length GPX.
  const scaled = useMemo(() => (planFor === "marathon" && total ? pts.map((p) => ({ ...p, distKm: (p.distKm * MARATHON_KM) / total })) : pts), [pts, planFor, total]);
  const planKm = planFor === "marathon" ? MARATHON_KM : total;
  const wind = useWind && conditions.windKmh > 0 ? { speedKmh: conditions.windKmh, fromDeg: conditions.windDirDeg, exposure } : undefined;
  const plan = useMemo(() => coursePlan(scaled, pace * planKm, effort, 1, wind), [scaled, pace, planKm, effort, wind?.speedKmh, wind?.fromDeg, wind?.exposure]);
  const windCost = plan.length && wind ? plan.reduce((a, p) => a + (p.windFactor ?? 1) * p.distanceKm, 0) / plan.reduce((a, p) => a + p.distanceKm, 0) : undefined;

  if (!pts.length) return <div className="page"><Empty title="No route loaded">Import a GPX or TCX file (your event recording or the marathon course) on the Data tab to see the map, elevation profile and a course-aware pacing plan.</Empty></div>;
  const bounds = pts.reduce<[[number, number], [number, number]]>((b, p) => [[Math.min(b[0][0], p.lat), Math.min(b[0][1], p.lon)], [Math.max(b[1][0], p.lat), Math.max(b[1][1], p.lon)]], [[90, 180], [-90, -180]]);
  const marks = Array.from({ length: Math.floor(total / 5) }, (_, i) => (i + 1) * 5).map((km) => pts.find((p) => p.distKm >= km)!).filter(Boolean);

  return (
    <div className="page">
      <div className="grid g4">
        <Stat label="Route distance" value={total.toFixed(2)} unit="km" foot={route!.name} />
        <Stat label="Elevation gain" value={fmtNum(gain, 0)} unit="m" foot="Smoothed (±5 points)" />
        <Stat label="Elevation loss" value={fmtNum(loss, 0)} unit="m" />
        <Stat label="Plan pace" value={fmtPace(pace, "")} unit="/km" foot={useHeat && heat.pct > 0 ? `Goal + ${heat.pct.toFixed(1)}% heat` : "Goal pace"} />
      </div>
      <Card title="Route" sub="Coloured by smoothed grade. Markers every 5 km.">
        <Legend items={[{ label: "Steep down", color: "#1d4ed8" }, { label: "Down", color: "#60a5fa" }, { label: "Flat", color: "#9ca3af" }, { label: "Up", color: "#f59e0b" }, { label: "Steep up", color: "#c2410c" }]} />
        <div className="map">
          <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {segments.map((sg, i) => <Polyline key={i} positions={sg.pts} pathOptions={{ color: gradeColor(sg.grade), weight: 5, opacity: 0.95 }} />)}
            {marks.map((p, i) => (
              <CircleMarker key={i} center={[p.lat, p.lon]} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#111", fillOpacity: 0.9 }}>
                <LTooltip>{(i + 1) * 5} km</LTooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
        <div className="chart sm" style={{ marginTop: 12 }}>
          <ResponsiveContainer>
            <AreaChart data={profile} margin={{ top: 6, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="km" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${Math.round(v)} km`} {...axisProps} />
              <YAxis width={48} domain={["auto", "auto"]} tickFormatter={(v) => `${Math.round(v)}`} {...axisProps} />
              <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={`${payload[0].payload.km.toFixed(2)} km`} rows={[{ label: "Elevation", value: `${payload[0].payload.ele.toFixed(0)} m` }]} /> : null} />
              <Area dataKey="ele" stroke="var(--s-neutral)" fill="var(--s-neutral)" fillOpacity={0.2} strokeWidth={1.5} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Course-aware pacing plan" sub="Splits blend even pace with even effort on grades (Minetti energy-cost model), and total exactly to the target time.">
        <div className="form-grid" style={{ alignItems: "end" }}>
          <label className="field">Even pace ← → even effort ({Math.round(effort * 100)}%)
            <input type="range" min={0} max={1} step={0.05} value={effort} onChange={(e) => setEffort(+e.target.value)} />
          </label>
          <div className="field">Plan distance
            <div className="segmented">
              <button aria-pressed={planFor === "route"} onClick={() => setPlanFor("route")}>This route ({total.toFixed(1)} km)</button>
              <button aria-pressed={planFor === "marathon"} onClick={() => setPlanFor("marathon")}>Scale to 42.2 km</button>
            </div>
          </div>
          <label className="row small"><input type="checkbox" checked={useHeat} onChange={(e) => setUseHeat(e.target.checked)} /> Apply heat adjustment from Race Lab ({heat.pct.toFixed(1)}%)</label>
          <label className="row small"><input type="checkbox" checked={useWind} onChange={(e) => setUseWind(e.target.checked)} /> Wind-aware: {conditions.windKmh} km/h from {compass(conditions.windDirDeg)} ({conditions.windDirDeg}°)</label>
          {useWind && (
            <label className="field">Exposure ({Math.round(exposure * 100)}% — lower if sheltered or running in a pack)
              <input type="range" min={0.2} max={1} step={0.05} value={exposure} onChange={(e) => setExposure(+e.target.value)} />
            </label>
          )}
        </div>
        <p className="small" style={{ marginTop: 10 }}>Target: <b>{fmtDuration(pace * planKm)}</b> for {planKm.toFixed(2)} km.{windCost !== undefined && <> Net wind cost over the course ≈ <b>{fmtSigned((windCost - 1) * 100, 1, "%")}</b> energy (a loop still costs: tailwinds repay only about half).</>}</p>
        <div className="table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Km</th><th className="num">Grade</th><th className="num">Gain / loss</th>{wind && <th className="num">Wind</th>}<th className="num">Target pace</th><th className="num">Split</th><th className="num">Cumulative</th></tr></thead>
            <tbody>
              {plan.map((p) => (
                <tr key={p.km}><td>{p.km}{p.distanceKm < 0.999 ? ` (${p.distanceKm.toFixed(2)})` : ""}</td><td className="num">{p.gradePct >= 0 ? "+" : ""}{p.gradePct.toFixed(1)}%</td><td className="num">+{p.gainM.toFixed(0)} / −{p.lossM.toFixed(0)} m</td>{wind && <td className="num">{p.headwindMps === undefined ? "—" : p.headwindMps > 0.3 ? `Head ${(p.headwindMps * 3.6).toFixed(0)} km/h` : p.headwindMps < -0.3 ? `Tail ${(-p.headwindMps * 3.6).toFixed(0)} km/h` : "Cross"}</td>}<td className="num"><b>{fmtPace(p.paceS, "")}</b></td><td className="num">{fmtDuration(p.splitS)}</td><td className="num">{fmtDuration(p.cumulativeS)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <Interp>{wind ? "Into-wind kilometres get a slower target and wind-assisted ones a faster one, using the same even-effort blend as hills; headwind is estimated at runner height (≈ 60% of the 10 m forecast) and scaled by exposure. " : ""}Run climbs by effort, not pace: the plan gives back a few seconds uphill and recovers them on descents. At 100% the plan is pure even-effort; most coaches recommend 50–70% because the model overstates downhill gains for tired legs.</Interp>
      </Card>
    </div>
  );
}

function buildGeometry(pts: RoutePoint[]) {
  if (!pts.length) return { segments: [], profile: [], gain: undefined, loss: undefined };
  const ele = smoothElevation(pts);
  const has = ele.some(Number.isFinite);
  const segments: { pts: [number, number][]; grade: number }[] = [];
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].distKm - pts[start].distKm >= 0.2 || i === pts.length - 1) {
      const d = (pts[i].distKm - pts[start].distKm) * 1000;
      const g = has && d > 0 ? (ele[i] - ele[start]) / d : 0;
      segments.push({ pts: pts.slice(start, i + 1).map((p) => [p.lat, p.lon]), grade: Number.isFinite(g) ? g : 0 });
      start = i;
    }
  }
  const step = Math.max(1, Math.floor(pts.length / 400));
  const profile = has ? pts.map((p, i) => ({ km: p.distKm, ele: ele[i] })).filter((_, i) => i % step === 0) : [];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < ele.length; i++) {
    const d = ele[i] - ele[i - 1];
    if (!Number.isFinite(d)) continue;
    if (d > 0) gain += d;
    else loss -= d;
  }
  return { segments, profile, gain: has ? gain : undefined, loss: has ? loss : undefined };
}
