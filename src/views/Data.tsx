import { useState } from "react";
import { Card, Pill } from "../components/Bits";
import { Glass } from "../components/glass/Glass";
import { icons } from "../components/Icons";
import { demoContext, demoSession } from "../lib/demo";
import { parseRouteXml } from "../lib/parse/gpx";
import { type DistanceUnit, LAP_COLUMNS, parseLapTable } from "../lib/parse/laps";
import { parseStryd } from "../lib/parse/stryd";
import { type RawTable, findCol, readBestTable } from "../lib/parse/table";
import { gunzipSync } from "fflate";
import { parseFit } from "../lib/parse/fit";
import { readHistoryFiles } from "../lib/parse/history";
import { mergeDays, parseRecovery } from "../lib/parse/recovery";
import type { AthleteContext, SessionData } from "../lib/types";
import { fmtPace, parseDuration } from "../lib/units";

type Slot = "event" | "stryd" | "training" | "strava" | "cooldown" | "route" | "recovery";

const TABLE = ".csv,.tsv,.txt,.xlsx";
const SLOTS: { id: Slot; title: string; hint: string; accept: string; multiple?: boolean }[] = [
  { id: "event", title: "1 · Main event", hint: "Garmin splits CSV/XLSX (+ notes column) or the activity's .fit file.", accept: `${TABLE},.fit,.gz` },
  { id: "stryd", title: "2 · Stryd", hint: "Stryd laps, per-second PowerCenter CSV, or Stryd .fit.", accept: `${TABLE},.fit,.gz` },
  { id: "cooldown", title: "4 · Additional 5K", hint: "Splits CSV/XLSX or .fit of the post-event run.", accept: `${TABLE},.fit,.gz` },
  { id: "training", title: "3a · Garmin Connect history", hint: "Activities CSV export and/or many .fit/.gpx files (up to 6 months used).", accept: `${TABLE},.fit,.gz,.gpx,.tcx,.zip`, multiple: true },
  { id: "strava", title: "3b · Strava history", hint: "Strava bulk-export .zip, its activities.csv, or .fit/.gpx files.", accept: `${TABLE},.fit,.gz,.gpx,.tcx,.zip`, multiple: true },
  { id: "recovery", title: "Recovery (HRV & sleep)", hint: "Garmin HRV/Sleep, Oura, Whoop or any CSV with date + HRV/RHR/sleep. Several files merge by date.", accept: TABLE, multiple: true },
  { id: "route", title: "Route (optional)", hint: "GPX/TCX of the event or marathon course (a .fit event adds its own route).", accept: ".gpx,.tcx,.xml" },
];

const recoveryScore = (t: RawTable) => [["date", "calendar date", "cycle start time"], ["hrv", "overnight hrv", "heart rate variability ms", "average hrv"], ["resting heart rate", "resting hr"], ["sleep score", "sleep duration", "asleep duration min", "total sleep"]].filter((a) => findCol(t.headers, a) >= 0).length;
const lapScore = (t: RawTable) => ["time", "distance", "pace", "avgHr", "power"].filter((k) => findCol(t.headers, LAP_COLUMNS[k as keyof typeof LAP_COLUMNS]) >= 0).length;

export function emptySession(): SessionData {
  return { context: { ...demoContext(), athleteName: "", eventName: "", eventDate: new Date().toISOString().slice(0, 10), gapMinutes: undefined, warmupNote: "", criticalPowerW: undefined, maxHr: undefined, restHr: undefined, weightKg: undefined } };
}

export function Data({ s, setSession, onOpen }: { s?: SessionData; setSession: (s: SessionData | undefined) => void; onOpen: () => void }) {
  const [unit, setUnit] = useState<DistanceUnit>("auto");
  const [busy, setBusy] = useState<Slot | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Slot, string>>>({});
  const [over, setOver] = useState<Slot | null>(null);
  const session = s ?? emptySession();
  const c = session.context;

  const ctx = (patch: Partial<AthleteContext>) => setSession({ ...session, context: { ...c, ...patch } });

  const load = async (slot: Slot, files: File[]) => {
    const file = files[0];
    setBusy(slot);
    setErrors((e) => ({ ...e, [slot]: undefined }));
    try {
      const base = session.isDemo ? emptySession() : session;
      const next: SessionData = { ...base, context: session.isDemo ? base.context : c, isDemo: false };
      const isFit = /\.fit(\.gz)?$/i.test(file.name);
      if (slot === "route") next.route = parseRouteXml(file.name, await file.text());
      else if (slot === "training" || slot === "strava") next[slot] = await readHistoryFiles(files, slot === "strava" ? "Strava" : "Garmin Connect", unit);
      else if (slot === "recovery") {
        const parts = await Promise.all(files.map(async (f) => parseRecovery(f.name, await readBestTable(f, recoveryScore))));
        next.recovery = { name: files.map((f) => f.name).join(", "), days: mergeDays(parts.flatMap((p) => p.days)), warnings: parts.flatMap((p) => p.warnings) };
      } else if (isFit) {
        let bytes = new Uint8Array(await file.arrayBuffer());
        if (/\.gz$/i.test(file.name)) bytes = gunzipSync(bytes);
        const fit = parseFit(file.name, bytes);
        if (slot === "stryd") next.stryd = { name: file.name, laps: fit.activity.laps, samples: fit.activity.samples ?? [], warnings: fit.activity.warnings };
        else next[slot] = fit.activity;
        if (slot === "event" && fit.route && !next.route) next.route = fit.route;
        if (slot === "event" && fit.summary && !s?.event) next.context = { ...next.context, eventDate: fit.summary.date };
      } else {
        const t = await readBestTable(file, lapScore);
        if (slot === "stryd") next.stryd = parseStryd(file.name, t, unit);
        else next[slot] = parseLapTable(file.name, t, unit);
      }
      setSession(next);
    } catch (e) {
      setErrors((x) => ({ ...x, [slot]: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  const describe = (slot: Slot): string | undefined => {
    if (slot === "route") return session.route && `${session.route.points.length} points · ${session.route.points.at(-1)?.distKm.toFixed(2)} km`;
    if (slot === "training" || slot === "strava") {
      const t = session[slot];
      return t && `${t.records.length} runs · ${t.records[0]?.date ?? ""} → ${t.records.at(-1)?.date ?? ""}`;
    }
    if (slot === "recovery") return session.recovery && `${session.recovery.days.length} days · ${session.recovery.days[0]?.date ?? ""} → ${session.recovery.days.at(-1)?.date ?? ""}`;
    if (slot === "stryd") return session.stryd && (session.stryd.samples.length ? `${session.stryd.samples.length.toLocaleString()} samples` : `${session.stryd.laps.length} laps`) + (session.stryd.criticalPowerW ? ` · CP ${session.stryd.criticalPowerW} W` : "");
    const f = session[slot];
    return f && `${f.laps.length} laps · ${f.laps.reduce((a, l) => a + l.distanceKm, 0).toFixed(2)} km${f.samples?.length ? ` · ${f.samples.length.toLocaleString()} s of FIT records` : ""}${f.laps.some((l) => l.note) || f.looseNotes.length ? " · notes found" : ""}`;
  };
  const fileName = (slot: Slot) => session[slot]?.name;
  const warnings = (slot: Slot) => (slot === "route" ? [] : session[slot]?.warnings ?? []);

  // Suggest the event date from the activity summary when a same-distance run exists.
  const evKm = session.event?.laps.reduce((x, l) => x + l.distanceKm, 0);
  const detected = evKm ? [...(session.training?.records ?? []), ...(session.strava?.records ?? [])].find((r) => Math.abs(r.distanceKm - evKm) <= Math.max(0.3, evKm * 0.03)) : undefined;

  return (
    <div className="page">
      <Glass className="hero">
        <div className="eyebrow">Import · validate · reconcile</div>
        <h1>{s ? "Session data" : "Welcome to StrideLab"}</h1>
        <p>Drop the four files from your master prompt — spreadsheets or Garmin <b>.fit</b> files — plus your Garmin Connect and Strava histories (up to 6 months are used), recovery data and a route. Files are parsed entirely in your browser — nothing is uploaded. Units are normalised to km, seconds, bpm and watts.</p>
        <div className="row" style={{ marginTop: 14 }}>
          {s?.event && <button className="btn primary" onClick={onOpen}>View analysis →</button>}
          <button className={`btn ${s?.event ? "" : "primary"}`} onClick={() => { setSession(demoSession()); onOpen(); }}>Load synthetic demo</button>
          {s && <button className="btn" onClick={() => { if (confirm("Clear all imported data from this browser?")) setSession(undefined); }}>Clear session</button>}
          <div className="segmented" role="group" aria-label="Distance unit in files">
            {(["auto", "km", "mi"] as const).map((u) => <button key={u} aria-pressed={unit === u} onClick={() => setUnit(u)}>{u === "auto" ? "Auto units" : u}</button>)}
          </div>
          {session.isDemo && <span className="chip demo">{icons.warn} Demo data is synthetic</span>}
        </div>
      </Glass>

      <div className="grid g3">
        {SLOTS.map((slot) => {
          const d = describe(slot.id);
          return (
            <label
              key={slot.id}
              className={`drop glass ${over === slot.id ? "over" : ""} ${d ? "filled" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(slot.id); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const fs = Array.from(e.dataTransfer.files); if (fs.length) load(slot.id, slot.multiple ? fs : fs.slice(0, 1)); }}
            >
              <input type="file" accept={slot.accept} multiple={slot.multiple} hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) load(slot.id, fs); e.target.value = ""; }} />
              <span className="title">{icons.file}{slot.title}</span>
              <span className="meta">{busy === slot.id ? "Reading…" : d ? <>{fileName(slot.id)}<br />{d}</> : slot.hint}</span>
              {d ? <Pill kind="good">Loaded</Pill> : <span className="meta">Drop a file or tap to choose</span>}
              {errors[slot.id] && <span className="small" style={{ color: "var(--bad)" }}>{errors[slot.id]}</span>}
              {warnings(slot.id).map((w) => <span key={w} className="small" style={{ color: "var(--warn)" }}>⚠ {w}</span>)}
            </label>
          );
        })}
      </div>

      {detected && detected.date !== c.eventDate && (
        <div className="callout glass">
          <Pill kind="info">Event date</Pill>
          <span style={{ flex: 1 }}>The activity summary has a {detected.distanceKm.toFixed(2)} km run on <b>{detected.date}</b> matching the event file. The event date is currently {c.eventDate}; weekly totals and pre-event windows depend on it.</span>
          <button className="btn" onClick={() => ctx({ eventDate: detected.date })}>Use {detected.date}</button>
        </div>
      )}

      <Card title="Athlete & event context" sub="Supplied context is used exactly as entered; leave unknowns blank and the analysis reports “Not available”.">
        <div className="form-grid">
          <label className="field">Athlete<input value={c.athleteName} onChange={(e) => ctx({ athleteName: e.target.value })} /></label>
          <label className="field">Event name<input value={c.eventName} onChange={(e) => ctx({ eventName: e.target.value })} /></label>
          <label className="field">Event date<input type="date" value={c.eventDate} onChange={(e) => ctx({ eventDate: e.target.value })} /></label>
          <label className="field">Planned total running (km)<input type="number" step="0.1" value={c.plannedTotalKm} onChange={(e) => ctx({ plannedTotalKm: +e.target.value })} /></label>
          <label className="field">Marathon date<input type="date" value={c.marathonDate} onChange={(e) => ctx({ marathonDate: e.target.value })} /></label>
          <label className="field">Goal marathon pace (min/km)<input defaultValue={fmtPace(c.goalPaceS, "")} key={c.goalPaceS} onBlur={(e) => { const v = parseDuration(e.target.value); if (v && v > 120 && v < 600) ctx({ goalPaceS: v }); }} /></label>
          <label className="field">Critical power (W)<input type="number" value={c.criticalPowerW ?? ""} placeholder={session.stryd?.criticalPowerW ? `${session.stryd.criticalPowerW} (from Stryd)` : "optional"} onChange={(e) => ctx({ criticalPowerW: e.target.value ? +e.target.value : undefined })} /></label>
          <label className="field">Max HR (bpm)<input type="number" value={c.maxHr ?? ""} placeholder="optional" onChange={(e) => ctx({ maxHr: e.target.value ? +e.target.value : undefined })} /></label>
          <label className="field">Resting HR (bpm)<input type="number" value={c.restHr ?? ""} placeholder="optional" onChange={(e) => ctx({ restHr: e.target.value ? +e.target.value : undefined })} /></label>
          <label className="field">Body mass (kg)<input type="number" value={c.weightKg ?? ""} placeholder="optional" onChange={(e) => ctx({ weightKg: e.target.value ? +e.target.value : undefined })} /></label>
          <label className="field">LTHR (bpm)<input type="number" value={c.lthr ?? ""} placeholder="optional" onChange={(e) => ctx({ lthr: e.target.value ? +e.target.value : undefined })} /></label>
          <label className="field">Threshold pace (min/km)<input defaultValue={c.thresholdPaceS ? fmtPace(c.thresholdPaceS, "") : ""} key={`tp${c.thresholdPaceS}`} placeholder="≈ 1-hour race pace" onBlur={(e) => { const v = parseDuration(e.target.value); ctx({ thresholdPaceS: v && v > 120 && v < 600 ? v : undefined }); }} /></label>
          <label className="field">W′ (joules)<input type="number" value={c.wPrimeJ ?? ""} placeholder="optional, e.g. 16500" onChange={(e) => ctx({ wPrimeJ: e.target.value ? +e.target.value : undefined })} /></label>
          <label className="field">Gap event → additional run (min)<input type="number" value={c.gapMinutes ?? ""} placeholder="if known" onChange={(e) => ctx({ gapMinutes: e.target.value ? +e.target.value : undefined })} /></label>
        </div>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <label className="field">Warm-up / logistics note<textarea value={c.warmupNote} onChange={(e) => ctx({ warmupNote: e.target.value })} /></label>
          <label className="field">Extra athlete observations (one per line)<textarea value={c.observations} onChange={(e) => ctx({ observations: e.target.value })} placeholder="Anything not already in the split file's notes" /></label>
        </div>
      </Card>
    </div>
  );
}
