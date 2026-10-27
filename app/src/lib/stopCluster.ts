import { distanceM } from './geo'
import { liveStop, stopCode } from './city'

// "Otobüs Durakları": the bus stops under one cluster bubble on the map, grouped by name
// (Kızılay x 3, Meşrutiyet Caddesi x 2), nearest group to the bubble first.

export type ClusterStop = { id: string; name: string; lat: number; lon: number; lines: string[]; code?: string }
export type ClusterGroup<T extends ClusterStop = ClusterStop> = { name: string; stops: T[] }

/** The number a rider can read on the stop: Ankara's stop number, Istanbul's İETT stop number, Bursa's; else null. */
export function rowCode(stop: { id: string; code?: string }): string | null {
  return stopCode(stop) ?? liveStop(stop)
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
  for (const { group } of out) group.stops.sort((a, b) => byNumber(rowCode(a) ?? a.id, rowCode(b) ?? b.id))
  return out.map((g) => g.group)
}
