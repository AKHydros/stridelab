import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Pill, Stat } from "../components/Bits";
import { GlassTip, Interp, Legend, axisProps, gridProps } from "../components/charts/ChartBits";
import { Glass } from "../components/glass/Glass";
import { DEFAULT_ASSUMPTIONS, simulateFuel } from "../lib/analysis/fuel";
import type { SessionData } from "../lib/types";
import { fmtPace } from "../lib/units";

/** Optional carbohydrate-loading and race-fuelling simulator. */
export function Fuel({ s }: { s: SessionData }) {
  const c = s.context;
  const [mass, setMass] = useState(c.weightKg ?? 70);
  const [loadG, setLoadG] = useState(10);
  const [days, setDays] = useState(2);
  const [breakfast, setBreakfast] = useState(Math.round((c.weightKg ?? 70) * 2));
  const [intake, setIntake] = useState(60);
  const [compare, setCompare] = useState(true);
  const threshold = c.thresholdPaceS ?? c.goalPaceS * 0.94;
  const inputs = { massKg: mass, loadGPerKg: loadG, loadDays: days, breakfastG: breakfast, intakeGPerH: intake, paceS: c.goalPaceS, thresholdPaceS: threshold };
  const r = useMemo(() => simulateFuel(inputs), [mass, loadG, days, breakfast, intake, c.goalPaceS, threshold]);
  const base = useMemo(() => simulateFuel({ ...inputs, loadGPerKg: 5, loadDays: 0, intakeGPerH: 0 }), [mass, breakfast, c.goalPaceS, threshold]);
  const rows = r.points.map((p, i) => ({ km: p.km, plan: p.remainingG, none: base.points[i]?.remainingG }));
  const raceH = (c.goalPaceS * 42.195) / 3600;
  const slider = (label: string, v: number, set: (n: number) => void, min: number, max: number, step: number, unit: string) => (
    <label className="field">{label} · <b>{v}{unit}</b><input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(+e.target.value)} /></label>
  );

  return (
    <div className="page">
      <Glass className="hero">
        <div className="eyebrow">Optional · educational model</div>
        <h1>Carb-load & race-fuel simulator</h1>
        <p>Estimates how carbohydrate loading, race breakfast and in-race carbs change when your glycogen could run low at goal pace {fmtPace(c.goalPaceS)}. Every coefficient is a published average and shown below — individual stores and needs vary widely. This is not a nutrition prescription; talk to a sports dietitian for a personal plan.</p>
      </Glass>
      <Card title="Your plan">
        <div className="form-grid">
          {slider("Body mass", mass, setMass, 45, 110, 1, " kg")}
          {slider("Carb-loading intake", loadG, setLoadG, 5, 12, 0.5, " g/kg/day")}
          {slider("Loading days", days, setDays, 0, 3, 1, " d")}
          {slider("Race breakfast (2–4 h before)", breakfast, setBreakfast, 0, 300, 10, " g")}
          {slider("In-race carbs", intake, setIntake, 0, 120, 5, " g/h")}
        </div>
        <label className="row small" style={{ marginTop: 10 }}><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with no loading and no in-race carbs</label>
      </Card>
      <div className="grid g4">
        <Stat label="Usable glycogen at start" value={Math.round(r.startG)} unit="g" foot={`Muscle ${Math.round(r.muscleG)} g + liver ${Math.round(r.liverG)} g`} />
        <Stat label="Marathon carb need" value={Math.round(r.totalNeedG)} unit="g" foot={`${Math.round(r.choFraction * 100)}% of energy from carbohydrate`} />
        <Stat label="Carbs taken in race" value={Math.round(r.totalIntakeG)} unit="g" foot={`${intake} g/h × ${raceH.toFixed(2)} h`} />
        <Stat label="Low-glycogen point" value={r.lowAtKm !== undefined ? `km ${Math.round(r.lowAtKm)}` : "None"} foot={<Pill kind={r.lowAtKm === undefined ? "good" : r.lowAtKm > 38 ? "info" : "warn"}>{r.lowAtKm === undefined ? "Above 15% at finish" : "Below 15% of start"}</Pill>} />
      </div>
      <Card title="Modelled carbohydrate remaining by km">
        <Legend items={[{ label: "Your plan", color: "var(--s-cad)" }, ...(compare ? [{ label: "No loading, no in-race carbs", color: "var(--s-neutral)", dashed: true }] : [])]} />
        <div className="chart">
          <ResponsiveContainer>
            <AreaChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="km" type="number" domain={[0, 42.195]} ticks={[0, 5, 10, 15, 20, 25, 30, 35, 40]} tickFormatter={(v) => `${v} km`} {...axisProps} />
              <YAxis width={48} tickFormatter={(v) => `${v} g`} {...axisProps} />
              <ReferenceLine y={0} stroke="var(--text-3)" />
              <ReferenceLine y={r.startG * 0.15} stroke="var(--warn)" strokeDasharray="5 4" label={{ value: "15% — low", fill: "var(--text-3)", fontSize: 11, position: "insideBottomRight" }} />
              <Tooltip content={({ payload }) => payload?.length ? <GlassTip title={`km ${payload[0].payload.km.toFixed(0)}`} rows={[{ label: "Your plan", value: `${Math.round(payload[0].payload.plan)} g`, color: "var(--s-cad)" }, ...(compare ? [{ label: "No fuelling", value: `${Math.round(payload[0].payload.none)} g` }] : [])]} /> : null} />
              {compare && <Area dataKey="none" stroke="var(--s-neutral)" strokeDasharray="5 4" fill="none" strokeWidth={1.5} isAnimationActive={false} />}
              <Area dataKey="plan" stroke="var(--s-cad)" fill="var(--s-cad)" fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <Interp>{r.advice.join(" ")}</Interp>
      </Card>
      <Card title="Assumptions" sub="Change the code constants in src/lib/analysis/fuel.ts to match lab data if you have it.">
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Muscle glycogen on a normal diet {DEFAULT_ASSUMPTIONS.baselineMuscleGPerKg} g/kg body mass; loading adds {DEFAULT_ASSUMPTIONS.loadGainPerGPerKgDay} g/kg per g/kg/day above 5, per day, up to +{DEFAULT_ASSUMPTIONS.maxLoadGainGPerKg} g/kg; {Math.round(DEFAULT_ASSUMPTIONS.locomotorShare * 100)}% sits in the running muscles.</li>
          <li>Liver {DEFAULT_ASSUMPTIONS.fastedLiverG} g after an overnight fast, topped up by a quarter of breakfast carbohydrate (max 110 g).</li>
          <li>Running costs {DEFAULT_ASSUMPTIONS.kcalPerKgPerKm} kcal/kg/km; the carbohydrate share rises with goal speed relative to threshold speed{c.thresholdPaceS ? "" : " (threshold pace not supplied — estimated as goal pace × 0.94)"}.</li>
          <li>In-race carbohydrate is assumed absorbed and used up to {DEFAULT_ASSUMPTIONS.gutLimitGPerH} g/h (glucose + fructose).</li>
        </ul>
      </Card>
    </div>
  );
}
