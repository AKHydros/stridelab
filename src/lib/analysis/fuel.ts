/**
 * Educational carbohydrate model for the marathon. Every coefficient is a
 * stated assumption drawn from sports-nutrition reviews (Burke et al. 2011;
 * Jeukendrup 2014; Rapoport 2010) and can be changed in the UI. It estimates
 * when carbohydrate stores could run low; it is not a nutrition prescription.
 */
export interface FuelInputs {
  massKg: number;
  /** Carb-loading intake, g/kg/day. ~5 = normal training diet. */
  loadGPerKg: number;
  loadDays: number;
  /** Pre-race breakfast carbohydrate (g), 2–4 h before the start. */
  breakfastG: number;
  /** In-race carbohydrate intake, g/h. */
  intakeGPerH: number;
  /** Goal marathon pace, s/km. */
  paceS: number;
  /** Threshold pace, s/km — sets relative intensity. */
  thresholdPaceS: number;
}

export interface FuelAssumptions {
  baselineMuscleGPerKg: number;
  loadGainPerGPerKgDay: number;
  maxLoadGainGPerKg: number;
  locomotorShare: number;
  fastedLiverG: number;
  kcalPerKgPerKm: number;
  gutLimitGPerH: number;
}

export const DEFAULT_ASSUMPTIONS: FuelAssumptions = {
  baselineMuscleGPerKg: 6, // whole-body muscle glycogen on a normal diet
  loadGainPerGPerKgDay: 0.35, // extra g/kg stored per (g/kg/day above 5) per day
  maxLoadGainGPerKg: 3, // supercompensation ceiling
  locomotorShare: 0.75, // fraction of muscle glycogen in the running muscles
  fastedLiverG: 60, // liver glycogen after an overnight fast
  kcalPerKgPerKm: 1.0, // running energy cost
  gutLimitGPerH: 90, // multiple-transportable-carb oxidation ceiling
};

export interface FuelPoint {
  km: number;
  remainingG: number;
  usedG: number;
  intakeG: number;
}

export interface FuelResult {
  startG: number;
  muscleG: number;
  liverG: number;
  choFraction: number;
  choPerKmG: number;
  totalNeedG: number;
  totalIntakeG: number;
  points: FuelPoint[];
  /** First km where usable stores fall below the 15% "low" threshold, if any. */
  lowAtKm?: number;
  emptyAtKm?: number;
  advice: string[];
}

/**
 * Carbohydrate share of energy rises with relative intensity (speed ÷ threshold
 * speed): ≈ 75 % at typical marathon pace (~ 94 % of threshold speed),
 * approaching 90 % at threshold (Romijn 1993; Rapoport 2010).
 */
export function choFraction(paceS: number, thresholdPaceS: number): number {
  const rel = thresholdPaceS / paceS;
  return Math.max(0.4, Math.min(0.9, 0.45 + (rel - 0.7) * 1.3));
}

export function simulateFuel(i: FuelInputs, a: FuelAssumptions = DEFAULT_ASSUMPTIONS, distanceKm = 42.195): FuelResult {
  const gain = Math.min(a.maxLoadGainGPerKg, Math.max(0, i.loadGPerKg - 5) * a.loadGainPerGPerKgDay * Math.min(3, i.loadDays));
  const muscleG = i.massKg * (a.baselineMuscleGPerKg + gain) * a.locomotorShare;
  const liverG = Math.min(110, a.fastedLiverG + i.breakfastG * 0.25);
  const startG = muscleG + liverG;
  const f = choFraction(i.paceS, i.thresholdPaceS);
  const choPerKmG = (i.massKg * a.kcalPerKgPerKm * f) / 4;
  const intakePerKm = (Math.min(i.intakeGPerH, a.gutLimitGPerH) * i.paceS) / 3600;
  const points: FuelPoint[] = [];
  let lowAtKm: number | undefined;
  let emptyAtKm: number | undefined;
  for (let km = 0; km <= Math.ceil(distanceKm); km++) {
    const d = Math.min(km, distanceKm);
    const used = choPerKmG * d;
    const intake = intakePerKm * d;
    const remaining = startG - used + intake;
    points.push({ km: d, remainingG: remaining, usedG: used, intakeG: intake });
    if (lowAtKm === undefined && remaining < startG * 0.15) lowAtKm = d;
    if (emptyAtKm === undefined && remaining <= 0) emptyAtKm = d;
  }
  const totalNeedG = choPerKmG * distanceKm;
  const totalIntakeG = intakePerKm * distanceKm;
  const advice: string[] = [];
  if (lowAtKm !== undefined) advice.push(`Modelled stores fall below 15% around km ${lowAtKm.toFixed(0)} — the classic "wall" zone. Raising in-race intake or loading more would move this later.`);
  else advice.push("Modelled stores stay above 15% to the finish under these assumptions.");
  if (i.intakeGPerH > a.gutLimitGPerH) advice.push(`Intake above ~${a.gutLimitGPerH} g/h is unlikely to be absorbed; the model caps it.`);
  if (i.intakeGPerH >= 60) advice.push("High in-race intake needs gut training: practise it in long runs first.");
  if (i.loadGPerKg >= 8) advice.push("Carb loading at this level usually means low-fibre foods for 36–48 h; expect 1–2 kg of water-weight gain.");
  return { startG, muscleG, liverG, choFraction: f, choPerKmG, totalNeedG, totalIntakeG, points, lowAtKm, emptyAtKm, advice };
}
