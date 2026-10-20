import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Pill, Stat } from "../components/Bits";
import { GlassTip, Interp, axisProps } from "../components/charts/ChartBits";
import { Glass } from "../components/glass/Glass";
import type { Analysis } from "../lib/analysis/analyze";
import { heatBand, windBand } from "../lib/analysis/environment";
import { MARATHON_KM } from "../lib/analysis/readiness";
import { type Conditions, heatAdjustment } from "../lib/conditions";
import type { SessionData } from "../lib/types";
import { fmtDuration, fmtPace, fmtSigned, parseDuration } from "../lib/units";
import { type HourlyWeather, type Place, compass, geocode, hourlyWeather } from "../lib/weather";

interface Props {
  s: SessionData;
  a: Analysis;
  conditions: Conditions;
  setConditions: (c: Conditions) => void;
  updateContext: (patch: Partial<SessionData["context"]>) => void;
}

export function RaceLab({ s, a, conditions, setConditions, updateContext }: Props) {
  const c = s.context;
  const r = a.readiness;
  const ev = a.event;
  const heat = heatAdjustment(conditions);
  const hb = heatBand(heat.pct);
  const wb = windBand(conditions.windKmh);
  const goalT = c.goalPaceS * MARATHON_KM;
  const adjPace = c.goalPaceS * (1 + heat.pct / 100);
  const [timeText, setTimeText] = useState(fmtDuration(goalT));

  const scen = (r?.scenarios ?? []).map((x) => ({ ...x, diffMin: (x.timeS - goalT) / 60 }));

  return (
    <div className="page">
      <Glass className="hero">
        <div className="eyebrow">Module H · Marathon readiness</div>
        <h1>Race Lab</h1>
        <p>Goal pace, scenarios, and race-day conditions in one place. Scenarios are assumption-driven brackets — one long run cannot predict a marathon.</p>
      </Glass>

      <div className="grid g2">
        <Card title="Goal" sub="Edit either field; the other updates.">
          <div className="form-grid">
            <label className="field">Goal pace (min/km)
              <input defaultValue={fmtPace(c.goalPaceS, "")} key={c.goalPaceS} onBlur={(e) => { const v = parseDuration(e.target.value); if (v && v > 120 && v < 600) { updateContext({ goalPaceS: v }); setTimeText(fmtDuration(v * MARATHON_KM)); } }} />
            </label>
            <label className="field">Goal finish (h:mm:ss)
              <input value={timeText} onChange={(e) => setTimeText(e.target.value)} onBlur={() => { const v = parseDuration(timeText); if (v && v > 3600) updateContext({ goalPaceS: v / MARATHON_KM }); }} />
            </label>
            <label className="field">Marathon date
              <input type="date" value={c.marathonDate} onChange={(e) => updateContext({ marathonDate: e.target.value })} />
            </label>
          </div>
          <p className="small" style={{ marginTop: 12 }}>
            Half split at even pace: <b>{fmtDuration(goalT / 2)}</b> · 5 km splits: <b>{fmtDuration(c.goalPaceS * 5)}</b> · 30 km: <b>{fmtDuration(c.goalPaceS * 30)}</b>
          </p>
          {r?.daysToMarathon !== undefined && <p className="interp"><b>{r.daysToMarathon} days to race · </b>{r.phase}</p>}
        </Card>

        <div className="grid g3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))" }}>
          <Stat label="Event avg vs goal" value={fmtSigned(r?.eventVsGoalPct, 1, "")} unit="%" foot={ev ? fmtPace(ev.summary.paceS) : undefined} />
          <Stat label="Final third vs goal" value={fmtSigned(r?.finalThirdVsGoalPct, 1, "")} unit="%" foot={ev ? fmtPace(ev.pacing.finalThird.paceS) : undefined} />
          <Stat label="Final 5 km of event" value={ev?.finalFiveKm ? fmtPace(ev.finalFiveKm.paceS, "") : "—"} unit="/km" foot="Late-run durability" />
          <Stat label="Additional run" value={a.extra ? fmtPace(a.extra.summary.paceS, "") : "—"} unit="/km" foot={a.extra?.character.split(":")[0]} />
        </div>
      </div>

      <Card title="Marathon scenarios" sub="Bars show minutes vs your goal finish (left of zero = faster than goal). Each scenario states its assumption.">
        {scen.length ? (
          <>
            <div className="chart sm">
              <ResponsiveContainer>
                <BarChart data={scen} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" horizontal={false} />
                  <XAxis type="number" {...axisProps} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v} min`} domain={[(m: number) => Math.min(-2, Math.floor(m)), (m: number) => Math.max(2, Math.ceil(m))]} />
                  <YAxis type="category" dataKey="name" width={150} {...axisProps} />
                  <ReferenceLine x={0} stroke="var(--text-3)" label={{ value: `Goal ${fmtDuration(goalT)}`, position: "top", fill: "var(--text-3)", fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "var(--grid)" }} content={({ payload }) => payload?.length ? <GlassTip title={payload[0].payload.name} rows={[{ label: "Finish", value: fmtDuration(payload[0].payload.timeS) }, { label: "Pace", value: fmtPace(payload[0].payload.paceS) }]} /> : null} />
                  <Bar dataKey="diffMin" radius={4} barSize={16} isAnimationActive={false} label={{ position: "right", formatter: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`, fill: "var(--text-2)", fontSize: 11 }}>
                    {scen.map((x) => <Cell key={x.name} fill="var(--s-violet)" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Scenario</th><th className="num">Finish</th><th className="num">Pace</th><th>Assumption</th></tr></thead>
                <tbody>{scen.map((x) => <tr key={x.name}><td>{x.name}</td><td className="num">{fmtDuration(x.timeS)}</td><td className="num">{fmtPace(x.paceS, "")}</td><td className="small">{x.basis}</td></tr>)}</tbody>
              </table>
            </div>
            <Interp>The event was {ev?.summary.distanceKm.toFixed(1)} km, possibly sub-maximal and started without a running warm-up. Use the spread between scenarios as the uncertainty, not any single number.</Interp>
          </>
        ) : <p className="muted">Insufficient data (needs an event of at least 15 km).</p>}
      </Card>

      <WeatherCard conditions={conditions} setConditions={setConditions} date={c.marathonDate} />

      <div className="grid g3">
        <Stat label="Temp + dew point" value={`${Math.round((conditions.tempC * 9) / 5 + 32 + (heat.dewC * 9) / 5 + 32)}`} unit="°F" foot={<><Pill kind={heat.pct < 1 ? "good" : heat.pct < 3 ? "info" : "warn"}>{hb.label}</Pill> dew point {heat.dewC.toFixed(1)} °C</>} />
        <Stat label="Expected heat slowdown" value={heat.pct.toFixed(1)} unit="%" foot={hb.advice} />
        <Stat label="Heat-adjusted goal pace" value={fmtPace(adjPace, "")} unit="/km" foot={`≈ ${fmtDuration(adjPace * MARATHON_KM)} · wind: ${wb.label.toLowerCase()} — ${wb.advice}`} />
      </div>
      <p className="small muted">Heat model: the temperature + dew-point (°F) rule of thumb used by many US coaches, interpolated between bands. Treat it as an estimate; individual heat tolerance varies widely.</p>
    </div>
  );
}

function WeatherCard({ conditions, setConditions, date }: { conditions: Conditions; setConditions: (c: Conditions) => void; date: string }) {
  const [q, setQ] = useState(conditions.place ?? "");
  const [places, setPlaces] = useState<Place[]>([]);
  const [hours, setHours] = useState<HourlyWeather[]>([]);
  const [source, setSource] = useState("");
  const [startHour, setStartHour] = useState(7);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [place, setPlace] = useState<Place | undefined>();

  const pickHours = (hs: HourlyWeather[], h: number, p: Place | undefined, src: string) => {
    // Average the expected race window (start hour + 3.5 h).
    const win = hs.filter((x) => { const hr = +x.time.slice(11, 13); return hr >= h && hr <= h + 3; });
    if (!win.length) return;
    const avg = (f: (x: HourlyWeather) => number) => win.reduce((s, x) => s + f(x), 0) / win.length;
    // Vector-average the wind direction so 350° and 10° average to 0°, not 180°.
    const u = avg((x) => Math.sin((x.windDir * Math.PI) / 180));
    const v = avg((x) => Math.cos((x.windDir * Math.PI) / 180));
    const dir = Math.round(((Math.atan2(u, v) * 180) / Math.PI + 360) % 360);
    setConditions({ tempC: +avg((x) => x.tempC).toFixed(1), rh: Math.round(avg((x) => x.rh)), windKmh: Math.round(avg((x) => x.windKmh)), windDirDeg: dir, source: `${src}, ${h}:00–${h + 3}:59 average`, place: p ? `${p.name}${p.admin1 ? ", " + p.admin1 : ""}` : undefined });
  };

  return (
    <Card title="Race-day weather" sub="Search a city to pull Open-Meteo data for the marathon date (forecast up to ~16 days ahead; past dates use the historical archive), or enter conditions manually.">
      <div className="row">
        <div className="field" style={{ flex: "1 1 220px" }}>
          <input placeholder="City, e.g. Chicago" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={async (e) => { if (e.key === "Enter") { setErr(""); try { setPlaces(await geocode(q)); } catch (x) { setErr(String((x as Error).message)); } } }} aria-label="City" />
        </div>
        <button className="btn" onClick={async () => { setErr(""); try { setPlaces(await geocode(q)); } catch (x) { setErr((x as Error).message); } }}>Search</button>
        <label className="field" style={{ gridAutoFlow: "column", alignItems: "center" }}>Start
          <select value={startHour} onChange={(e) => { setStartHour(+e.target.value); pickHours(hours, +e.target.value, place, source); }}>
            {Array.from({ length: 12 }, (_, i) => i + 5).map((h) => <option key={h} value={h}>{h}:00</option>)}
          </select>
        </label>
      </div>
      {places.length > 0 && (
        <div className="row" style={{ marginTop: 10 }}>
          {places.map((p) => (
            <button key={`${p.latitude},${p.longitude}`} className="btn" disabled={busy} onClick={async () => {
              setBusy(true); setErr(""); setPlace(p);
              try { const w = await hourlyWeather(p.latitude, p.longitude, date); setHours(w.hours); setSource(w.source); pickHours(w.hours, startHour, p, w.source); setPlaces([]); }
              catch (x) { setErr((x as Error).message); }
              finally { setBusy(false); }
            }}>{p.name}{p.admin1 ? `, ${p.admin1}` : ""}{p.country ? ` · ${p.country}` : ""}</button>
          ))}
        </div>
      )}
      {err && <p className="small" style={{ color: "var(--bad)" }}>{err}</p>}
      <div className="form-grid" style={{ marginTop: 14 }}>
        <label className="field">Temperature (°C)<input type="number" step="0.5" value={conditions.tempC} onChange={(e) => setConditions({ ...conditions, tempC: +e.target.value, source: "Manual entry" })} /></label>
        <label className="field">Relative humidity (%)<input type="number" min={1} max={100} value={conditions.rh} onChange={(e) => setConditions({ ...conditions, rh: +e.target.value, source: "Manual entry" })} /></label>
        <label className="field">Wind (km/h)<input type="number" min={0} value={conditions.windKmh} onChange={(e) => setConditions({ ...conditions, windKmh: +e.target.value, source: "Manual entry" })} /></label>
        <label className="field">Wind from (° · {compass(conditions.windDirDeg)})<input type="number" min={0} max={359} value={conditions.windDirDeg} onChange={(e) => setConditions({ ...conditions, windDirDeg: ((+e.target.value % 360) + 360) % 360, source: "Manual entry" })} /></label>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>Source: {conditions.source}{conditions.place ? ` · ${conditions.place}` : ""}</p>
      {hours.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 6 }}>
          <table>
            <thead><tr><th>Hour</th><th className="num">Temp</th><th className="num">Dew pt</th><th className="num">RH</th><th className="num">Wind</th><th className="num">Rain</th></tr></thead>
            <tbody>
              {hours.filter((h) => { const x = +h.time.slice(11, 13); return x >= startHour - 1 && x <= startHour + 4; }).map((h) => (
                <tr key={h.time}><td>{h.time.slice(11, 16)}</td><td className="num">{h.tempC.toFixed(1)} °C</td><td className="num">{h.dewC.toFixed(1)} °C</td><td className="num">{h.rh}%</td><td className="num">{Math.round(h.windKmh)} km/h {compass(h.windDir)}</td><td className="num">{h.precipProb !== undefined ? `${h.precipProb}%` : h.precipMm !== undefined ? `${h.precipMm} mm` : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
