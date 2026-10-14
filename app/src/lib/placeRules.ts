import type { IconName } from '../components/Icon'
import type { Line } from './data'
import { fold } from './search'

// Rules for the search and recent rows (native PlaceRow, SearchPanel).

/** Icon for a stop row, by the stop's main mode (native stationIcon). */
export function stationIcon(mode: string): IconName {
  if (mode === 'bus' || mode === 'metrobus') return 'bus'
  if (mode === 'ferry') return 'ship'
  return 'train'
}

/** Place search (Google or free) starts from three letters of the folded text (native places.loading). */
export function searchesPlaces(query: string): boolean {
  return fold(query).length >= 3
}

/** Lines whose name starts with the typed text, shortest name first, at most three (native lineHits). */
export function lineHits(lines: Line[], query: string): Line[] {
  const f = fold(query)
  if (!f) return []
  return lines
    .filter((l) => fold(l.name).startsWith(f))
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, 3)
}

/** Secondary line of a stop row: its code, then up to five line names (native SearchPanel subline). */
export function stopSubline(code: string | undefined, lines: string[] = []): string {
  return [code, lines.slice(0, 5).join(', ')].filter(Boolean).join(' · ')
}
