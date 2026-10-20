import { daysBetween } from "../units";

export const MARATHON_KM = 42.195;

/** Riegel (1981): T₂ = T₁ × (D₂/D₁)^k. */
export function riegel(timeS: number, fromKm: number, toKm: number, k = 1.06): number {
  return timeS * Math.pow(toKm / fromKm, k);
}

export interface Scenario {
  name: string;
  timeS: number;
  paceS: number;
  basis: string;
}

/**
 * Scenarios, not predictions. The event may have been submaximal and one long
 * run cannot establish marathon capability, so these bracket what the data
 * would imply under stated assumptions.
 */
export function marathonScenarios(eventTimeS: number, eventKm: number, finalThirdPaceS: number): Scenario[] {
  if (!eventKm || eventKm < 15) return [];
  const evenPace = eventTimeS / eventKm;
  const list: Scenario[] = [
    {
      name: "Riegel k = 1.06",
      timeS: riegel(eventTimeS, eventKm, MARATHON_KM, 1.06),
      paceS: 0,
      basis: "Classic endurance exponent; assumes the event was a maximal, race-specific effort.",
    },
    {
      name: "Conservative k = 1.08",
      timeS: riegel(eventTimeS, eventKm, MARATHON_KM, 1.08),
      paceS: 0,
      basis: "Steeper fatigue exponent typical of runners with limited marathon-specific durability.",
    },
    {
      name: "Durability-weighted",
      // First 26 km at event pace, the remainder at the event's final-third pace
      // slowed a further 3 % — a deliberately cautious late-race assumption.
      timeS: eventKm * evenPace + (MARATHON_KM - eventKm) * finalThirdPaceS * 1.03,
      paceS: 0,
      basis: "Event pace to the event distance, then final-third pace +3% for the remaining distance.",
    },
  ];
  return list.map((s) => ({ ...s, paceS: s.timeS / MARATHON_KM }));
}

export function daysToRace(fromIso: string, raceIso: string): number | undefined {
  if (!fromIso || !raceIso) return undefined;
  return daysBetween(fromIso, raceIso);
}

export function taperPhase(days?: number): string {
  if (days === undefined) return "Marathon date not supplied.";
  if (days < 0) return "The marathon date is before this session.";
  if (days <= 10) return "Final taper: no new fitness can be built; protect freshness, rehearse fuelling and logistics.";
  if (days <= 21) return "Taper window: reduce volume progressively; keep short goal-pace touches; avoid new high-fatigue sessions.";
  if (days <= 42) return "Late specific phase: one or two more marathon-pace long runs are still useful if recovery allows.";
  return "Build phase: there is time to develop durability and marathon-specific endurance.";
}
