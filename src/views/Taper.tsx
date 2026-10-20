import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Pill, Stat } from "../components/Bits";
import { GlassTip, Interp, Legend, axisProps, gridProps } from "../components/charts/ChartBits";
import type { PmcDay } from "../lib/analysis/load";
import { TAPER_PRESETS, type TaperPlan, simulateTaper, suggestTaper } from "../lib/analysis/taper";
import { addDays, daysBetween, fmtNum, fmtSigned } from "../lib/units";

/** Taper simulator: project the PMC from the event to race day under a weekly load plan. */
export function TaperCard({ history, eventDate, raceDate }: { history: PmcDay[]; eventDate: string; raceDate: string }) {
  const [plan, setPlan] = useState<TaperPlan>(() => suggestTaper(history, eventDate, raceDate) ?? TAPER_PRESETS[0].plan);
  const weeksOut = Math.max(1, Math.ceil(daysBetween(eventDate, raceDate) / 7));
  const editable = Math.min(4, weeksOut);
  const r = useMemo(() => simulateTaper(history, eventDate, raceDate, plan), [history, eventDate, raceDate, plan]);
  if (!r.raceDay) return <Card title="Taper simulator" sub="Not available"><p className="muted">{r.verdict}</p></Card>;

  const from = addDays(eventDate, -42);
  const rows = r.days
    .filter((d) => d.date >= from)
    .map((d, i, arr) => {
      const bridge = !d.projected && arr[i + 1]?.projected;
      return { ...d, ctlH: d.projected ? undefined : d.ctl, atlH: d.projected ? undefined : d.atl, ctlP: d.projected || bridge ? d.ctl : undefined, atlP: d.projected || bridge ? d.atl : undefined };
    });
  const set = (i: number, v: number) => setPlan({ weekPct: Array.from({ length: Math.max(plan.weekPct.length, i + 1) }, (_, k) => (k === i ? v : plan.weekPct[k] ?? 100)) });
  const label = (i: number) => (i === 0 ? "Race week" : `${i} week${i > 1 ? "s" : ""} out`);
  const tsb = r.raceDay.tsb;

  return (
    <Card title="Taper simulator" sub={`Projects fitness, fatigue and form from the event (${eventDate}) to race day (${raceDate}) using ${fmtNum(r.baselineWeekly, 0)} load/week (mean of the 4 weeks before the event) × your weekly percentages. Intensity is assumed to stay similar.`}>
      <div className="row" style={{ marginBottom: 12 }}>
        {TAPER_PRESETS.map((p) => <button key={p.name} className="btn" title={p.note} onClick={() => setPlan(p.plan)}>{p.name}</button>)}
        <button className="btn primary" onClick={() => { const s = suggestTaper(history, eventDate, raceDate); if (s) setPlan(s); }}>Suggest (max fitness, TSB +5…+15)</button>
      </div>
      <div className="form-grid">
        {Array.from({ length: editable }, (_, i) => (
          <label key={i} className="field">{label(i)} · {plan.weekPct[i] ?? 100}%
            <input type="range" min={20} max={120} step={5} value={plan.weekPct[i] ?? 100} onChange={(e) => set(i, +e.target.value)} />
          </label>
        ))}
      </div>
      <div className="grid g4" style={{ marginTop: 14 }}>
        <Stat label="Race-day form (TSB)" value={fmtSigned(tsb, 0, "")} foot={<Pill kind={tsb >= 5 && tsb <= 20 ? "good" : "warn"}>{tsb >= 5 && tsb <= 20 ? "In target band" : tsb < 5 ? "Under-tapered" : "Over-tapered"}</Pill>} />
        <Stat label="Race-day fitness (CTL)" value={fmtNum(r.raceDay.ctl, 0)} foot={`${fmtSigned(r.ctlChangePct, 1, "%")} vs event day`} />
        <Stat label="Race-day fatigue (ATL)" value={fmtNum(r.raceDay.atl, 0)} />
        <Stat label="Weeks event → race" value={weeksOut} foot={weeksOut > editable ? `Weeks beyond ${editable} run at 100%` : undefined} />
      </div>
      <Legend items={[{ label: "Fitness (CTL)", color: "var(--s-pace)" }, { label: "Fatigue (ATL)", color: "var(--s-hr)" }, { label: "Projected", color: "var(--s-neutral)", dashed: true }]} />
      <div className="chart">
        <ResponsiveContainer>
          <LineChart data={rows} syncId="taper" margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} minTickGap={28} {...axisProps} />
            <YAxis width={40} {...axisProps} />
            <ReferenceLine x={eventDate} stroke="var(--s-neutral)" strokeDasharray="5 4" label={{ value: "Event", fill: "var(--text-3)", fontSize: 11, position: "insideTopLeft" }} />
            <ReferenceLine x={raceDate} stroke="var(--s-neutral)" strokeDasharray="5 4" label={{ value: "Race", fill: "var(--text-3)", fontSize: 11, position: "insideTopRight" }} />
            <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={`${payload[0].payload.date}${payload[0].payload.projected ? " (projected)" : ""}`} rows={[{ label: "Load", value: payload[0].payload.load.toFixed(0) }, { label: "CTL", value: payload[0].payload.ctl.toFixed(1), color: "var(--s-pace)" }, { label: "ATL", value: payload[0].payload.atl.toFixed(1), color: "var(--s-hr)" }, { label: "TSB", value: fmtSigned(payload[0].payload.tsb, 1) }]} /> : null} />
            <Line dataKey="ctlH" stroke="var(--s-pace)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="atlH" stroke="var(--s-hr)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line dataKey="ctlP" stroke="var(--s-pace)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
            <Line dataKey="atlP" stroke="var(--s-hr)" strokeWidth={1.5} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="eyebrow">Form (TSB) · shaded band = +5 to +20</div>
      <div className="chart sm" style={{ height: 130 }}>
        <ResponsiveContainer>
          <AreaChart data={rows} syncId="taper" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} minTickGap={28} {...axisProps} />
            <YAxis width={40} {...axisProps} />
            <ReferenceArea y1={5} y2={20} fill="var(--good)" fillOpacity={0.08} />
            <ReferenceLine y={0} stroke="var(--text-3)" />
            <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={payload[0].payload.date} rows={[{ label: "TSB", value: fmtSigned(payload[0].payload.tsb, 1) }]} /> : null} />
            <Area dataKey="tsb" stroke="var(--s-violet)" fill="var(--s-violet)" fillOpacity={0.2} strokeWidth={1.5} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <Interp>
        <b>{r.verdict}</b> Tapers of 2–3 weeks that cut volume by roughly 40–60% while keeping some race-pace work tend to work best (Bosquet et al. 2007). The model only sees load numbers; how you feel and your HRV through the taper (Recovery tab) are the real-world check.
      </Interp>
    </Card>
  );
}
