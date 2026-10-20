/**
 * Core data model. Everything is normalised on import:
 * distance → km, time → seconds, pace → s/km, HR → bpm, power → W.
 */

export interface Lap {
  index: number;
  distanceKm: number;
  /** Lap timer time (elapsed within the lap). */
  timeS: number;
  movingTimeS?: number;
  avgHr?: number;
  maxHr?: number;
  cadence?: number;
  power?: number;
  ascentM?: number;
  descentM?: number;
  gctMs?: number;
  strideM?: number;
  verticalOscCm?: number;
  formPower?: number;
  lss?: number;
  temperatureC?: number;
  /** Free-text athlete observation attached to this lap, if any. */
  note?: string;
}

export interface Sample {
  timeS: number;
  distanceKm?: number;
  power?: number;
  speedMps?: number;
  hr?: number;
  cadence?: number;
  formPower?: number;
  lss?: number;
  elevationM?: number;
  gctMs?: number;
}

export interface ActivityFile {
  name: string;
  laps: Lap[];
  /** Per-second records when imported from a FIT file (time-aligned HR/power/speed). */
  samples?: Sample[];
  /** Start time (ISO) when known from a FIT file. */
  startTime?: string;
  /** Summary row reported by the device, kept for reconciliation only. */
  deviceSummary?: Partial<Lap>;
  /** Notes found outside lap rows (e.g. trailing free text cells). */
  looseNotes: string[];
  warnings: string[];
}

export interface StrydFile {
  name: string;
  laps: Lap[];
  samples: Sample[];
  criticalPowerW?: number;
  warnings: string[];
}

export interface TrainingRecord {
  date: string; // ISO yyyy-mm-dd
  dateTime?: string;
  type: string;
  title: string;
  distanceKm: number;
  timeS: number;
  movingTimeS?: number;
  avgHr?: number;
  maxHr?: number;
  cadence?: number;
  power?: number;
  ascentM?: number;
  trainingEffect?: number;
  /** Where the record came from, e.g. "Garmin Connect", "Strava", "Garmin + Strava". */
  source?: string;
}

export interface TrainingFile {
  name: string;
  records: TrainingRecord[];
  warnings: string[];
}

export interface RecoveryDay {
  date: string;
  /** Overnight HRV, rMSSD in ms. */
  hrv?: number;
  restingHr?: number;
  sleepHours?: number;
  /** 0–100 sleep score from the wearable. */
  sleepScore?: number;
  /** Optional wearable readiness / body-battery style score, 0–100. */
  readiness?: number;
}

export interface RecoveryFile {
  name: string;
  days: RecoveryDay[];
  warnings: string[];
}

export interface RoutePoint {
  lat: number;
  lon: number;
  eleM?: number;
  time?: string;
  hr?: number;
  cadence?: number;
  /** Cumulative distance, computed on import. */
  distKm: number;
}

export interface RouteFile {
  name: string;
  points: RoutePoint[];
}

export interface AthleteContext {
  athleteName: string;
  eventName: string;
  eventDate: string; // ISO date
  plannedTotalKm: number;
  marathonDate: string;
  /** Goal marathon pace, s/km. 300 = 5:00/km. */
  goalPaceS: number;
  criticalPowerW?: number;
  maxHr?: number;
  restHr?: number;
  weightKg?: number;
  /** Lactate-threshold heart rate (bpm), for Friel HR zones and hrTSS. */
  lthr?: number;
  /** Threshold (≈ 1-hour race) pace, s/km, for pace zones and rTSS. */
  thresholdPaceS?: number;
  /** Anaerobic work capacity above CP (joules), for W′ balance. */
  wPrimeJ?: number;
  /** Gap between end of event and start of the additional run, minutes. */
  gapMinutes?: number;
  warmupNote: string;
  observations: string;
}

export interface SessionData {
  context: AthleteContext;
  event?: ActivityFile;
  cooldown?: ActivityFile;
  stryd?: StrydFile;
  /** Garmin Connect history (Activities CSV and/or FIT/GPX files). */
  training?: TrainingFile;
  /** Strava history (bulk-export ZIP, activities.csv and/or FIT/GPX files). */
  strava?: TrainingFile;
  recovery?: RecoveryFile;
  route?: RouteFile;
  isDemo?: boolean;
}

export type Confidence = "High" | "Medium" | "Low";

export interface Finding {
  priority: number;
  area: string;
  finding: string;
  evidence: string;
  recommendation: string;
  benefit: string;
  confidence: Confidence;
}
