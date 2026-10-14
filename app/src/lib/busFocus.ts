// Lines of a tapped stop that are drawn stop to stop on the map (native FocusLayer, Istanbul branch).
import { loadJson, loadLines, loadStops, type StopRow } from './data'
import type { LineDetail } from './lineDetail'
import { busShapes } from './city'

/** Modes drawn as network lines. Any other line of a tapped stop is a bus (native NETWORK_MODES). */
export const NETWORK_MODES = new Set(['metro', 'rail', 'tram', 'funicular', 'cablecar'])

/** A tapped stop has at most this many lines drawn (native MAX_LINES). */
const MAX_LINES = 30

/** The lines not drawn in the network: buses and ferries (native focusBus). */
export function stopToStopIds(lineIds: string[], modeOf: (id: string) => string | undefined): string[] {
  return lineIds.filter((id) => !NETWORK_MODES.has(modeOf(id) ?? 'bus'))
}

/** Stop-to-stop path of each direction, as [lon, lat]. Stops without a position are skipped; paths of one point are dropped. */
export function directionPaths(details: (LineDetail | null)[], stops: StopRow[]): [number, number][][] {
  const byId = new Map(stops.map((s) => [s.id, s]))
  const paths: [number, number][][] = []
  for (const d of details) {
    for (const dir of d?.directions ?? []) {
      const coords = dir.stops
        .map((id) => byId.get(id))
        .filter((s): s is StopRow => !!s)
        .map((s): [number, number] => [s.lon, s.lat])
      if (coords.length > 1) paths.push(coords)
    }
  }
  return paths
}

/**
 * Paths for the bus and ferry lines of a tapped stop, drawn stop to stop. Ankara and Bursa have real
 * route shapes in the network layer instead, so they get none here.
 */
export async function stopToStopPaths(lineIds: string[]): Promise<[number, number][][]> {
  if (busShapes() || !lineIds.length) return []
  const modes = new Map((await loadLines()).map((l) => [l.id, String(l.mode)]))
  const ids = stopToStopIds(lineIds, (id) => modes.get(id)).slice(0, MAX_LINES)
  // stops.json is large: only fetched when a bus or ferry line is really there (a rail station needs none).
  if (!ids.length) return []
  const [details, stops] = await Promise.all([
    Promise.all(ids.map((id) => loadJson<LineDetail>(`lines/${id}.json`).catch(() => null))),
    loadStops(),
  ])
  return directionPaths(details, stops)
}
