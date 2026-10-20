import { dewPointC } from "./analysis/environment";

/** Open-Meteo: free, keyless forecast + historical archive. */
export interface HourlyWeather {
  time: string;
  tempC: number;
  rh: number;
  dewC: number;
  windKmh: number;
  windDir: number;
  precipMm?: number;
  precipProb?: number;
}

export interface Place {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

export async function geocode(query: string): Promise<Place[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const json = await res.json();
  return (json.results ?? []) as Place[];
}

export async function hourlyWeather(lat: number, lon: number, date: string): Promise<{ hours: HourlyWeather[]; source: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const ageDays = (Date.parse(today) - Date.parse(date)) / 86400000;
  const archive = ageDays > 5;
  const vars = ["temperature_2m", "relative_humidity_2m", "dew_point_2m", "wind_speed_10m", "wind_direction_10m", "precipitation"]
    .concat(archive ? [] : ["precipitation_probability"])
    .join(",");
  const host = archive ? "https://archive-api.open-meteo.com/v1/archive" : "https://api.open-meteo.com/v1/forecast";
  const url = `${host}?latitude=${lat}&longitude=${lon}&hourly=${vars}&start_date=${date}&end_date=${date}&timezone=auto&wind_speed_unit=kmh`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.reason ?? `Weather request failed (${res.status}). Forecasts reach ~16 days ahead.`);
  }
  const j = await res.json();
  const h = j.hourly;
  const hours: HourlyWeather[] = (h.time as string[]).map((time, i) => ({
    time,
    tempC: h.temperature_2m[i],
    rh: h.relative_humidity_2m[i],
    dewC: h.dew_point_2m?.[i] ?? dewPointC(h.temperature_2m[i], h.relative_humidity_2m[i]),
    windKmh: h.wind_speed_10m[i],
    windDir: h.wind_direction_10m[i],
    precipMm: h.precipitation?.[i],
    precipProb: h.precipitation_probability?.[i],
  }));
  return { hours: hours.filter((x) => x.tempC !== null), source: archive ? "Open-Meteo historical archive (ERA5 reanalysis)" : "Open-Meteo forecast" };
}

export function compass(deg: number): string {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}
