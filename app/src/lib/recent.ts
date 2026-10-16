import { CITY } from './city'
import type { Station } from './network'
import type { Place } from './search'

// Recent searches, recently opened stops and use counts are kept on this phone (localStorage). Kept per city: Istanbul places and line ids
// mean nothing in Ankara or Bursa.
const KEY = `gitgel.recent.${CITY.id}`
const USAGE_KEY = `gitgel.usage.${CITY.id}`
/** Before recents were per city. Read once, keeping the places near this city. */
const OLD_KEY = 'gitgel.recent'
const MAX = 8
/** Counters kept per kind; the least used are forgotten beyond this. */
const MAX_TRACKED = 40
/** Something is "frequent" once it was used this many times. */
const MIN_USES = 2

/** A recent row. A stop opened as a card keeps its station so tapping it opens the card again. */
export type RecentPlace = Place & { station?: Station }

export type Use = { n: number; t: number }
type Usage = { places: Record<string, Use & { p: RecentPlace }>; lines: Record<string, Use> }

// A stop opened as a card and the same stop picked as a destination share one key:
// the latest use decides what tapping the row does.
function placeKey(p: RecentPlace): string {
  return `${p.name}|${p.lat.toFixed(4)},${p.lon.toFixed(4)}`
}

/** Adds one use of `key`, then forgets the least used entries beyond the cap (never `key` itself). */
export function countUse<T extends object>(
  map: Record<string, Use & T>,
  key: string,
  extra: T,
  now: number,
  cap = MAX_TRACKED,
): Record<string, Use & T> {
  const next: Record<string, Use & T> = { ...map, [key]: { ...extra, n: (map[key]?.n ?? 0) + 1, t: now } }
  const keys = Object.keys(next)
  if (keys.length <= cap) return next
  keys.sort((a, b) => next[a].n - next[b].n || next[a].t - next[b].t)
  let drop = keys.length - cap
  for (const k of keys) {
    if (drop === 0) break
    if (k === key) continue
    delete next[k]
    drop--
  }
  return next
}

/** Keys used at least MIN_USES times, most used first, the latest first among equals. */
export function topUsed(map: Record<string, Use>, k: number): string[] {
  return Object.keys(map)
    .filter((key) => map[key].n >= MIN_USES)
    .sort((a, b) => map[b].n - map[a].n || map[b].t - map[a].t)
    .slice(0, k)
}

function isNear(p: Place): boolean {
  // Within ~80 km of the city centre.
  return Math.abs(p.lat - CITY.center[1]) < 0.75 && Math.abs(p.lon - CITY.center[0]) < 1
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function recentPlaces(): RecentPlace[] {
  const v = readJson<RecentPlace[]>(KEY)
  if (Array.isArray(v)) return v
  const old = readJson<RecentPlace[]>(OLD_KEY)
  return Array.isArray(old) ? old.filter(isNear) : []
}

function usage(): Usage {
  const u = readJson<Usage>(USAGE_KEY)
  return { places: u?.places ?? {}, lines: u?.lines ?? {} }
}

export function rememberPlace(p: RecentPlace): void {
  if (p.kind === 'me') return
  const key = placeKey(p)
  try {
    const list = [p, ...recentPlaces().filter((x) => placeKey(x) !== key)]
    writeJson(KEY, list.slice(0, MAX))
    const u = usage()
    u.places = countUse(u.places, key, { p }, Date.now())
    writeJson(USAGE_KEY, u)
  } catch {
    // Storage full or disabled: recents are a convenience, ignore.
  }
}

/** A stop whose card was opened (map tap, nearby list, search). */
export function rememberStation(st: Station): void {
  rememberPlace({ name: st.name, kind: 'stop', lat: st.lat, lon: st.lon, station: st })
}

export function rememberLine(id: string): void {
  try {
    const u = usage()
    u.lines = countUse(u.lines, id, {}, Date.now())
    writeJson(USAGE_KEY, u)
  } catch {
    // ignore
  }
}

/** The places and stops used most often, for the top of "Nereye?". */
export function frequentPlaces(k = 3): RecentPlace[] {
  const u = usage()
  return topUsed(u.places, k).map((key) => u.places[key].p)
}

/** Line ids opened most often, for the top of the lines panel. */
export function frequentLines(k = 3): string[] {
  return topUsed(usage().lines, k)
}

/** Same place as another recent row (used to avoid showing it twice). */
export function samePlace(a: RecentPlace, b: RecentPlace): boolean {
  return placeKey(a) === placeKey(b)
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(USAGE_KEY)
    localStorage.removeItem(OLD_KEY)
  } catch {
    // ignore
  }
}
