import type { Line } from './data'
import { fold, type Mode } from './search'

// The Lines panel rules (native Lines.tsx): network order, mode filter, row cap.

/** Rail first, buses last: the list reads like a network map (native ORDER). */
export const MODE_ORDER: Mode[] = ['metro', 'rail', 'tram', 'funicular', 'cablecar', 'metrobus', 'ferry', 'bus']

/** Unfiltered, typed-nothing list shows this many rows across all modes; the rest is found by typing. */
export const MAX_ROWS_UNFILTERED = 120

// One collator for the whole sort (numeric: "M2" before "M10").
const collator = new Intl.Collator('tr', { numeric: true })

/** Lines by mode order, then by name in Turkish numeric order (native sortedRows). */
export function sortLines(lines: Line[]): Line[] {
  return [...lines].sort((a, b) => MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode) || collator.compare(a.name, b.name))
}

/** Filter chip keys: the modes a city has, metrobus counted as bus (native). */
export type LineFilter = 'all' | 'metro' | 'tram' | 'bus' | 'ferry' | 'rail'

export function filterMatches(line: Line, filter: LineFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'bus') return line.mode === 'bus' || line.mode === 'metrobus'
  return line.mode === filter
}

/** The filter keys this city's lines have (`all` is always offered by the caller). */
export function modesPresent(lines: Line[]): Set<string> {
  return new Set(lines.map((l) => (l.mode === 'metrobus' ? 'bus' : l.mode)))
}

/**
 * Rows for the list. `sorted` must come from sortLines. Without a typed text and with the
 * "all" filter the list is capped (native MAX_ROWS_UNFILTERED).
 */
export function lineRows(sorted: Line[], query: string, filter: LineFilter): Line[] {
  const f = fold(query)
  const cap = f || filter !== 'all' ? Infinity : MAX_ROWS_UNFILTERED
  const out: Line[] = []
  for (const l of sorted) {
    if (out.length >= cap) break
    if (!filterMatches(l, filter)) continue
    if (f && !fold(l.name).startsWith(f) && !fold(l.long_name).includes(f)) continue
    out.push(l)
  }
  return out
}
