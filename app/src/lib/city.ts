// Which city the app shows. Chosen by the user (home screen), remembered on the
// device only. Switching reloads the page so the map, layers and data caches
// start clean: simple and light on low-end phones.

export type CityId = 'istanbul' | 'ankara' | 'bursa'

export type City = {
  id: CityId
  center: [number, number]
  bounds: [[number, number], [number, number]]
  /** Folder of the nightly static JSON under DATA_BASE. */
  dataDir: string
  /** MOTIS prefixes stop ids with the dataset name from infra/motis/config.yml. */
  motisPrefix: string
  /**
   * Live source. 'iett': İETT GPS and Metro İstanbul line status (buses drawn stop to stop).
   * 'ego' (Ankara) and 'burulas' (Bursa): live buses and a live stop board, real bus shapes on the map.
   */
  live: 'iett' | 'ego' | 'burulas'
  /** GTFS stop id prefix of stops that have a live board ("eg_11654", "br_564"); null: none. */
  liveStopPrefix: string | null
  /** MOTIS has this city's timetables (route search, scheduled departures). */
  routing: boolean
}

export const CITIES: Record<CityId, City> = {
  istanbul: {
    id: 'istanbul',
    center: [28.98, 41.03],
    bounds: [
      [27.9, 40.7],
      [30.0, 41.7],
    ],
    dataDir: '',
    motisPrefix: 'istanbul_',
    live: 'iett',
    liveStopPrefix: null,
    routing: true,
  },
  ankara: {
    id: 'ankara',
    center: [32.854, 39.92],
    bounds: [
      [32.2, 39.5],
      [33.4, 40.3],
    ],
    dataDir: 'ankara/',
    motisPrefix: 'ankara_',
    live: 'ego',
    liveStopPrefix: 'eg_',
    routing: true,
  },
  bursa: {
    id: 'bursa',
    center: [29.06, 40.195],
    bounds: [
      [28.2, 39.7],
      [29.9, 40.55],
    ],
    dataDir: 'bursa/',
    motisPrefix: 'bursa_',
    live: 'burulas',
    liveStopPrefix: 'br_',
    routing: true,
  },
}

/** Ankara and Bursa: live stop boards and real bus shapes (Istanbul buses are drawn stop to stop). */
export const busShapes = (city: City = CITY) => city.live !== 'iett'

const KEY = 'gg-city'

function isCityId(v: unknown): v is CityId {
  return v === 'istanbul' || v === 'ankara' || v === 'bursa'
}

function saved(): CityId | null {
  try {
    const v = localStorage.getItem(KEY)
    return isCityId(v) ? v : null
  } catch {
    return null
  }
}

/** The city of this page load (Istanbul until the user picks one). */
export const CITY: City = CITIES[saved() ?? 'istanbul']

/** False until the user has picked a city on this device. */
export const CITY_CHOSEN: boolean = saved() !== null

/**
 * Remember the city without reloading: on first launch, when the phone is in a city already shown
 * (native setCity). The next load starts there.
 */
export function rememberCity(id: CityId): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Private mode: the choice is asked again on the next launch.
  }
}

/** Remember the choice and reload into it. */
export function switchCity(id: CityId) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Private mode: the switch still works for this load via the URL below.
  }
  const u = new URL(location.href)
  u.searchParams.delete('city')
  location.replace(u.toString())
}

export function inBounds(p: [number, number] | null, b: City['bounds']): boolean {
  return !!p && p[0] >= b[0][0] && p[0] <= b[1][0] && p[1] >= b[0][1] && p[1] <= b[1][1]
}

/** The city a position lies in, if any. */
export function cityAt(p: [number, number] | null): CityId | null {
  for (const c of Object.values(CITIES)) if (inBounds(p, c.bounds)) return c.id
  return null
}

/** The number shown at an Ankara stop ("eg_11654" -> "11654"); rail codes (M33), Istanbul and Bursa ids: null. */
export function stopCode(id: string | undefined, city: City = CITY): string | null {
  if (city.live !== 'ego' || !id) return null
  return /^eg_(\d{3,6})$/.exec(id)?.[1] ?? null
}

/** The stop id the live board takes: "eg_11654" -> "11654" (Ankara), "br_564" -> "564" (Bursa); else null. */
export function liveStop(id: string | undefined, city: City = CITY): string | null {
  const p = city.liveStopPrefix
  if (!p || !id?.startsWith(p)) return null
  const n = id.slice(p.length)
  return /^\d{1,6}$/.test(n) && (city.live !== 'ego' || n.length >= 3) ? n : null
}
