import { distanceM } from './geo'
import { liveStop, stopCode } from './city'

// "Buradaki otobüs durakları": the bus stops under one cluster bubble on the map, grouped by name
// (Kızılay x 3, Meşrutiyet Caddesi x 2), nearest group to the bubble first.

export type ClusterStop = { id: string; name: string; lat: number; lon: number; lines: string[] }
export type ClusterGroup<T extends ClusterStop = ClusterStop> = { name: string; stops: T[] }

/**
 * The number a rider can read on the stop: the Ankara stop number, an Istanbul İETT stop code, or the
 * Bursa stop number; null when the stop has none.
 */
export function rowCode(id: string): string | null {
  return stopCode(id) ?? (/^\d{3,7}$/.test(id) ? id : null) ?? liveStop(id)
}

const byNumber = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true, sensitivity: 'base' })

/** Line ids of a stop in reading order: 131, 131-5, 143, 185-2, 339 (numbers as numbers). */
export function sortedLines(lines: string[]): string[] {
  return [...new Set(lines)].sort(byNumber)
}

/** Stops grouped by name (case and spacing ignored); groups nearest `center` first, stops by code inside. */
export function groupClusterStops<T extends ClusterStop>(stops: T[], center: { lat: number; lon: number }): ClusterGroup<T>[] {
  const groups = new Map<string, { group: ClusterGroup<T>; dist: number }>()
  for (const s of stops) {
    const key = s.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr')
    const d = distanceM(center.lat, center.lon, s.lat, s.lon)
    const g = groups.get(key)
    if (g) {
      g.group.stops.push(s)
      g.dist = Math.min(g.dist, d)
    } else groups.set(key, { group: { name: s.name.trim(), stops: [s] }, dist: d })
  }
  const out = [...groups.values()].sort((a, b) => a.dist - b.dist || byNumber(a.group.name, b.group.name))
  for (const { group } of out) group.stops.sort((a, b) => byNumber(rowCode(a.id) ?? a.id, rowCode(b.id) ?? b.id))
  return out.map((g) => g.group)
}
