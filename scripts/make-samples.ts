/**
 * Regenerate sample-data/ from the synthetic demo session so every import path
 * (FIT, Garmin CSV, Strava ZIP, recovery CSV, GPX) can be tried end to end.
 * Run with `npm run samples`.
 */
import { writeFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { DEMO_EVENT_DATE, demoSession } from "../src/lib/demo";
import { buildFitFromLaps } from "./fit-fixture";

const out = (name: string, data: string | Uint8Array) => writeFileSync(`sample-data/${name}`, data); // run from the project root
const hms = (s: number) => {
  const r = Math.round(s);
  return `${String(Math.floor(r / 3600)).padStart(2, "0")}:${String(Math.floor((r % 3600) / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
};
const s = demoSession();

// Event and additional run as FIT files.
out("1-garmin-event.fit", buildFitFromLaps(new Date(`${DEMO_EVENT_DATE}T08:00:00Z`), s.event!.laps));
out("4-garmin-cooldown-5k.fit", buildFitFromLaps(new Date(`${DEMO_EVENT_DATE}T10:30:00Z`), s.cooldown!.laps));

// Garmin Connect "Activities" CSV (6 months + a non-running row + the event day).
const g = ["Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Aerobic TE,Avg Run Cadence,Avg Pace,Total Ascent,Avg Power"];
const eventT = s.event!.laps.reduce((a, l) => a + l.timeS, 0);
const coolT = s.cooldown!.laps.reduce((a, l) => a + l.timeS, 0);
for (const r of s.training!.records) {
  const pace = r.timeS / r.distanceKm;
  g.push(["Running", `${r.date} 07:00:00`, "false", r.title, r.distanceKm.toFixed(2), Math.round(r.distanceKm * 70), hms(r.timeS), r.avgHr ?? "", r.avgHr ? r.avgHr + 10 : "", "", r.cadence ?? "", hms(pace).slice(3), "", r.power ?? ""].join(","));
}
g.push(`Strength,${DEMO_EVENT_DATE.slice(0, 8)}16 18:00:00,false,Gym,0.00,250,00:45:00,110,140,1.2,,,,`);
g.push(`Running,${DEMO_EVENT_DATE} 08:00:00,false,Autumn 26.2K,26.20,1900,${hms(eventT)},157,171,4.4,177,${hms(eventT / 26.2).slice(3)},82,264`);
g.push(`Running,${DEMO_EVENT_DATE} 10:30:00,false,Cool Down 5K,5.02,380,${hms(coolT)},149,153,2.4,171,${hms(coolT / 5.02).slice(3)},8,228`);
out("3-garmin-activities.csv", g.join("\n") + "\n");

// Strava bulk export: activities.csv inside a ZIP (dates in Strava's format).
const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const st = ["Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance,Max Heart Rate,Moving Time,Average Heart Rate"];
s.strava!.records.forEach((r, i) => st.push([1000 + i, `"${fmt.format(new Date(r.date + "T12:00:00Z"))}, 7:00:00 AM"`, r.title, "Run", Math.round(r.timeS), r.distanceKm.toFixed(2), r.avgHr ? r.avgHr + 10 : "", Math.round(r.timeS), r.avgHr ?? ""].join(",")));
out("strava-export.zip", zipSync({ "export_12345/activities.csv": strToU8(st.join("\n") + "\n") }));

// Recovery in Garmin-like columns.
const rc = ["Date,Overnight HRV,Resting Heart Rate,Sleep Duration,Sleep Score"];
for (const d of s.recovery!.days) rc.push([d.date, d.hrv, d.restingHr, `${Math.floor(d.sleepHours!)}h ${Math.round((d.sleepHours! % 1) * 60)}min`, d.sleepScore].join(","));
out("recovery-hrv-sleep.csv", rc.join("\n") + "\n");
console.log("sample-data regenerated");
