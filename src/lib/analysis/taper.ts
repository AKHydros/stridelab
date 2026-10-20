import { addDays, daysBetween } from "../units";
import type { PmcDay } from "./load";

/** Share of a week's load on each weekday, Monday first (a typical 5–6 run week). */
export const WEEK_PATTERN = [0.05, 0.18, 0.12, 0.18, 0.04, 0.13, 0.3];

export interface TaperPlan {
  /** Percent of baseline weekly load, index 0 = race week, 1 = the week before, … */
  weekPct: number[];
}

export const TAPER_PRESETS: { name: string; plan: TaperPlan; note: string }[] = [
  { name: "Classic 3-week", plan: { weekPct: [45, 65, 80] }, note: "≈ 20–55% volume reduction, intensity kept (Mujika & Padilla 2003; Bosquet 2007)" },
  { name: "Short 2-week", plan: { weekPct: [50, 75, 100] }, note: "For lower-mileage runners or a B-race" },
  { name: "Deep 3-week", plan: { weekPct: [35, 55, 70] }, note: "Larger reduction — more freshness, more fitness loss" },
];

export interface TaperDay extends PmcDay {
  projected: boolean;
}

export interface TaperResult {
  days: TaperDay[];
  baselineWeekly: number;
  raceDay?: TaperDay;
  ctlChangePct?: number;
  verdict: string;
}

/**
 * Continue the Performance Manager Chart past the last recorded day using a
 * planned weekly load. Baseline weekly load is the mean of the 28 days before
 * `fromDate` (the event), so the event itself does not inflate it.
 */
export function simulateTaper(history: PmcDay[], fromDate: string, raceDate: string, plan: TaperPlan): TaperResult {
  if (!history.length || !raceDate || raceDate <= fromDate) return { days: [], baselineWeekly: 0, verdict: "Needs training history and a marathon date after the event." };
  const before = history.filter((d) => d.date < fromDate && d.date >= addDays(fromDate, -28));
  const baselineWeekly = (before.reduce((a, d) => a + d.load, 0) / Math.max(1, before.length)) * 7;
  const lastHist = history[history.length - 1];
  const kC = 1 - Math.exp(-1 / 42);
  const kA = 1 - Math.exp(-1 / 7);
  let ctl = lastHist.ctl;
  let atl = lastHist.atl;
  const days: TaperDay[] = history.map((d) => ({ ...d, projected: false }));
  for (let d = addDays(lastHist.date, 1); d <= raceDate; d = addDays(d, 1)) {
    const weeksOut = Math.floor((daysBetween(d, raceDate) - 1) / 7);
    const pct = d === raceDate ? 0 : (plan.weekPct[weeksOut] ?? 100) / 100;
    const dow = (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;
    const load = baselineWeekly * pct * WEEK_PATTERN[dow];
    const tsb = ctl - atl;
    ctl += (load - ctl) * kC;
    atl += (load - atl) * kA;
    days.push({ date: d, load, ctl, atl, tsb, isEvent: false, projected: true });
  }
  const raceDay = days[days.length - 1];
  const atEvent = history.find((h) => h.date === fromDate) ?? lastHist;
  const ctlChangePct = atEvent.ctl ? ((raceDay.ctl - atEvent.ctl) / atEvent.ctl) * 100 : undefined;
  const tsb = raceDay.tsb;
  const verdict =
    tsb < 0 ? "Still carrying fatigue on race day — reduce load further in the final two weeks."
      : tsb < 5 ? "Slightly under-tapered: form is neutral. Consider a deeper race week."
        : tsb <= 20 ? "Form in the commonly targeted +5 to +20 range on race day."
          : "Very fresh, but fitness (CTL) is falling — a shorter or shallower taper may keep more fitness.";
  return { days, baselineWeekly, raceDay, ctlChangePct, verdict };
}

/** Grid-search the last three weeks for the highest race-day CTL with TSB in [+5, +15]. */
export function suggestTaper(history: PmcDay[], fromDate: string, raceDate: string): TaperPlan | undefined {
  let best: { plan: TaperPlan; ctl: number } | undefined;
  for (let w0 = 30; w0 <= 80; w0 += 5)
    for (let w1 = w0; w1 <= 90; w1 += 5)
      for (let w2 = w1; w2 <= 100; w2 += 5) {
        const plan = { weekPct: [w0, w1, w2] };
        const r = simulateTaper(history, fromDate, raceDate, plan);
        if (!r.raceDay || r.raceDay.tsb < 5 || r.raceDay.tsb > 15) continue;
        if (!best || r.raceDay.ctl > best.ctl) best = { plan, ctl: r.raceDay.ctl };
      }
  return best?.plan;
}
