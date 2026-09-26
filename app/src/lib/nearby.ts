import type { StopRow } from './data'
import { distanceM } from './geo'
import { fold } from './search'

export type NearbyStop = StopRow & { distance: number }

const RAIL = new Set(['metro', 'rail', 'tram', 'funicular', 'cablecar', 'ferry', 'metrobus'])

/** Stations within 1.5 km and bus stops within 600 m; stations first, then by distance. */
export function nearestStops(stops: StopRow[], lat: number, lon: number, max = 12): NearbyStop[] {
  const out: NearbyStop[] = []
  for (const s of stops) {
    // Cheap box test before the exact distance.
    if (Math.abs(s.lat - lat) > 0.015 || Math.abs(s.lon - lon) > 0.02) continue
    const d = distanceM(lat, lon, s.lat, s.lon)
    if (d <= (RAIL.has(s.mode) ? 1500 : 600)) out.push({ ...s, distance: d })
  }
  out.sort((a, b) => a.distance - b.distance)
  // One row per station: same name within 300 m (one platform per line) merges.
  const merged: NearbyStop[] = []
  for (const s of out) {
    const same = merged.find(
      (m) => RAIL.has(m.mode) === RAIL.has(s.mode) && fold(m.name) === fold(s.name) && distanceM(m.lat, m.lon, s.lat, s.lon) < 300,
    )
    if (same) same.lines = [...same.lines, ...s.lines.filter((l) => !same.lines.includes(l))]
    else merged.push({ ...s, lines: [...s.lines] })
  }
  out.splice(0, out.length, ...merged)
  const stations = out.filter((s) => RAIL.has(s.mode)).slice(0, 5)
  const buses = out.filter((s) => !RAIL.has(s.mode))
  return [...stations, ...buses].slice(0, max)
}
