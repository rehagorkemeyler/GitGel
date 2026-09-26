// Which city the app shows. Chosen by the user (home screen), remembered on the
// device only. Switching reloads the page so the map, layers and data caches
// start clean: simple and light on low-end phones.

export type CityId = 'istanbul' | 'ankara'

export type City = {
  id: CityId
  center: [number, number]
  bounds: [[number, number], [number, number]]
  /** Folder of the nightly static JSON under DATA_BASE. */
  dataDir: string
  /** MOTIS prefixes stop ids with the dataset name from infra/motis/config.yml. */
  motisPrefix: string
  /** Istanbul-only live sources: İETT GPS and Metro İstanbul line status. */
  iett: boolean
  /** Ankara: EGO live buses and stop arrivals; thin bus network on the map. */
  ego: boolean
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
    iett: true,
    ego: false,
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
    iett: false,
    ego: true,
    routing: false,
  },
}

const KEY = 'gg-city'

function saved(): CityId | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'istanbul' || v === 'ankara' ? v : null
  } catch {
    return null
  }
}

/** The city of this page load (Istanbul until the user picks one). */
export const CITY: City = CITIES[saved() ?? 'istanbul']

/** False until the user has picked a city on this device. */
export const CITY_CHOSEN: boolean = saved() !== null

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

/** EGO stop number of an Ankara stop id ("eg_11654" -> "11654"); rail codes (M33) and Istanbul ids: null. */
export function stopCode(id: string | undefined): string | null {
  if (!CITY.ego || !id) return null
  return /^eg_(\d{3,6})$/.exec(id)?.[1] ?? null
}
