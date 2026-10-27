import { useEffect, useMemo, useState } from 'react'
import { LIVE_BASE } from './config'
import { directLineVehicles, directStatus } from './ibbDirect'
import { CITY } from './city'
import { lang } from '../i18n'

export type Vehicle = {
  id: string
  lat: number
  lon: number
  line: string
  headsign: string
  at: string
  // Ankara (EGO) and Bursa (BURULAŞ) extras
  plate?: string | null
  speed?: number | null
  features?: string[]
  /** Bursa: card taps on this trip so far (nobody taps out), for the crowding estimate. */
  tripBoardings?: number | null
}
export type LineStatus = { line: string; message: string; updated: string }
export type Announcement = { title: string; text: string; lines: string[] }
export type Status = { lines: LineStatus[]; announcements: Announcement[]; stale: boolean }

// Ankara (EGO) and Bursa (BURULAŞ), see live/src/providers/ego.ts and burulas.ts.
type CityVehicle = {
  id: string
  line: string
  lat: number
  lon: number
  plate: string | null
  speed: number | null
  features: string[]
  updatedAt: string
  tripBoardings?: number | null
}
/** A bus coming to a stop (same shape for Ankara and Bursa). */
export type LiveArrival = {
  line: string
  lineName: string
  plate: string | null
  features: string[]
  speed: number | null
  etaSeconds: number
  stopsAway: number | null
}

// The server waits up to 8 s for EGO/BURULAŞ/İETT; the app waits a little longer so a slow answer still arrives.
async function get<T>(path: string): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12_000)
  try {
    const r = await fetch(LIVE_BASE + path, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

const POLL_MS = 15_000

/** Live server path per city, e.g. "/live/bursa/". */
const cityPath = () => (CITY.live === 'burulas' ? '/live/bursa/' : '/live/ankara/')

/** Live vehicles of one line: İETT in Istanbul, EGO in Ankara, BURULAŞ in Bursa. */
function lineVehicles(line: string): Promise<Vehicle[]> {
  const q = encodeURIComponent(line)
  if (CITY.live !== 'iett')
    return get<{ vehicles: CityVehicle[] }>(`${cityPath()}vehicles?line=${q}`).then((r) =>
      r.vehicles.map((v) => ({
        id: v.id,
        lat: v.lat,
        lon: v.lon,
        line: v.line,
        headsign: '',
        at: v.updatedAt,
        plate: v.plate,
        speed: v.speed,
        features: v.features,
        tripBoardings: v.tripBoardings ?? null,
      })),
    )
  // Our server reaches İBB through a relay in Turkey; when that fails, the device (in Turkey) asks İBB itself,
  // and keeps doing so for a minute instead of waiting on the server at every refresh (native live.ts).
  if (Date.now() < serverDownUntil) return directLineVehicles(line)
  return get<{ vehicles: Vehicle[] }>(`/live/vehicles?line=${q}`).then(
    (r) => r.vehicles,
    () => {
      serverDownUntil = Date.now() + 60_000
      return directLineVehicles(line)
    },
  )
}
let serverDownUntil = 0

/** Live vehicles of the given lines, refreshed every 15 s while the app is in front. */
export function useLiveVehicles(lines: string[]): Vehicle[] {
  const [state, setState] = useState<{ key: string; vehicles: Vehicle[] }>({ key: '', vehicles: [] })
  const key = [...new Set(lines)].sort().join(',')
  useEffect(() => {
    if (!LIVE_BASE || !key) return
    let alive = true
    const load = async () => {
      if (document.hidden) return
      const all = await Promise.all(
        key.split(',').map((l) => lineVehicles(l).catch(() => [] as Vehicle[])),
      )
      if (alive) setState({ key, vehicles: all.flat() })
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [key])
  // While a changed set of lines loads, the buses of lines still in it stay on the map.
  return useMemo(() => {
    if (!key) return NONE
    if (state.key === key) return state.vehicles
    const keep = new Set(key.split(','))
    return state.vehicles.filter((v) => keep.has(v.line))
  }, [key, state])
}

const NONE: Vehicle[] = []

let statusPromise: Promise<Status> | null = null
// The language the cached status was asked in: its text is localized, so a language change asks again.
let statusLang: string | null = null

/** Metro İstanbul line problems. Cached for the session (per language); null when unavailable. */
export function useLineStatus(): Status | null {
  const [status, setStatus] = useState<Status | null>(null)
  useEffect(() => {
    if (!LIVE_BASE || CITY.live !== 'iett') return
    if (statusLang !== lang) {
      statusLang = lang
      statusPromise = null
    }
    statusPromise ??= get<Status>(`/live/status?lang=${lang}`).catch(() =>
      directStatus(lang).then((d) => ({ ...d, stale: false })),
    )
    statusPromise.then(setStatus, () => {
      statusPromise = null
    })
  }, [])
  return status
}

/** A line at the stop with no live bus coming. Ankara sends its next start; Bursa sends nothing more. */
export type LiveLineStatus = {
  line: string
  lineName: string
  nextStart: string | null
  nextStartInMin: number | null
  noMoreToday: boolean
}

export type ArrivalsState = {
  stop: string
  arrivals: LiveArrival[] | null
  lines: LiveLineStatus[]
  error: boolean
  at: number
}

// One poll per stop, shared by everyone watching it (the stop card and the map).
type ArrivalsEntry = { state: ArrivalsState | null; subs: Set<(s: ArrivalsState) => void>; stop: () => void }
const arrivalsFeeds = new Map<string, ArrivalsEntry>()

function watchArrivals(stop: string, fn: (s: ArrivalsState) => void): () => void {
  let entry = arrivalsFeeds.get(stop)
  if (!entry) {
    const e: ArrivalsEntry = { state: null, subs: new Set(), stop: () => {} }
    const publish = (s: ArrivalsState) => {
      e.state = s
      e.subs.forEach((f) => f(s))
    }
    const load = () => {
      if (document.hidden) return
      get<{ arrivals: LiveArrival[]; lines?: LiveLineStatus[] }>(`${cityPath()}arrivals?stop=${encodeURIComponent(stop)}`).then(
        (r) => arrivalsFeeds.get(stop) === e && publish({ stop, arrivals: r.arrivals, lines: r.lines ?? [], error: false, at: Date.now() }),
        () =>
          arrivalsFeeds.get(stop) === e &&
          publish({ stop, arrivals: e.state?.arrivals ?? null, lines: e.state?.lines ?? [], error: true, at: Date.now() }),
      )
    }
    load()
    const timer = setInterval(load, POLL_MS)
    e.stop = () => clearInterval(timer)
    arrivalsFeeds.set(stop, e)
    entry = e
  }
  const feed = entry
  feed.subs.add(fn)
  if (feed.state) fn(feed.state)
  return () => {
    feed.subs.delete(fn)
    if (feed.subs.size === 0) {
      feed.stop()
      arrivalsFeeds.delete(stop)
    }
  }
}

/** Ankara and Bursa: live buses coming to one stop (see liveStop), refreshed every 15 s. */
export function useLiveArrivals(stop: string | null): ArrivalsState | null {
  const [state, setState] = useState<ArrivalsState | null>(() => (stop ? arrivalsFeeds.get(stop)?.state ?? null : null))
  useEffect(() => {
    if (!LIVE_BASE || !stop || CITY.live === 'iett') return
    return watchArrivals(stop, setState)
  }, [stop])
  return state && state.stop === stop ? state : null
}

/** Plates vary in spacing: "06 ABC 123" = "06ABC123", "16 BJZ 19" = "16BJZ19". */
export const plateKey = (p: string | null | undefined) => (p ?? '').replace(/\s+/g, '').toUpperCase()

export type Crowding = 'low' | 'medium' | 'high'

/**
 * Rough crowding from boardings this trip (Bursa). Getting off is not counted, so this
 * only grows along the trip: an estimate. Thresholds are a first guess, tune on real rides.
 */
export function crowding(tripBoardings: number | null | undefined): Crowding | null {
  if (tripBoardings === null || tripBoardings === undefined || !Number.isFinite(tripBoardings) || tripBoardings < 0) return null
  return tripBoardings < 30 ? 'low' : tripBoardings <= 60 ? 'medium' : 'high'
}
