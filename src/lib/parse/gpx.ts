import type { RouteFile, RoutePoint } from "../types";

const R = 6371.0088;
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Parse GPX (trk/rte) or TCX trackpoints into a route with cumulative distance. */
export function parseRouteXml(name: string, xml: string): RouteFile {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("The route file is not valid XML.");
  const pts: Omit<RoutePoint, "distKm">[] = [];
  const gpx = [...Array.from(doc.getElementsByTagName("trkpt")), ...Array.from(doc.getElementsByTagName("rtept"))];
  if (gpx.length) {
    for (const el of gpx) {
      pts.push({
        lat: parseFloat(el.getAttribute("lat") ?? ""),
        lon: parseFloat(el.getAttribute("lon") ?? ""),
        eleM: num(child(el, "ele")),
        time: child(el, "time"),
        hr: num(child(el, "hr")),
        cadence: num(child(el, "cad")),
      });
    }
  } else {
    for (const el of Array.from(doc.getElementsByTagName("Trackpoint"))) {
      const lat = num(child(el, "LatitudeDegrees"));
      const lon = num(child(el, "LongitudeDegrees"));
      if (lat === undefined || lon === undefined) continue;
      pts.push({ lat, lon, eleM: num(child(el, "AltitudeMeters")), time: child(el, "Time"), hr: num(child(el, "Value")), cadence: num(child(el, "Cadence")) });
    }
  }
  return { name, points: withDistance(pts.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))) };
}

export function withDistance(pts: Omit<RoutePoint, "distKm">[]): RoutePoint[] {
  let acc = 0;
  return pts.map((p, i) => {
    if (i) acc += haversineKm(pts[i - 1], p);
    return { ...p, distKm: acc };
  });
}

function child(el: Element, tag: string): string | undefined {
  // Namespaced extension tags (gpxtpx:hr) match on local name.
  const all = el.getElementsByTagName("*");
  for (const c of Array.from(all)) if (c.localName === tag) return c.textContent ?? undefined;
  return undefined;
}
const num = (s?: string) => (s === undefined || s.trim() === "" ? undefined : Number.isFinite(parseFloat(s)) ? parseFloat(s) : undefined);
