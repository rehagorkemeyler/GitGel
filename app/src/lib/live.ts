import { useEffect, useState } from 'react'
import { LIVE_BASE } from './config'
import { CITY } from './city'

export type Vehicle = {
  id: string
  lat: number
  lon: number
  line: string
  headsign: string
  at: string
  // Ankara (EGO) extras
  plate?: string | null
  speed?: number | null
  features?: string[]
}
export type LineStatus = { line: string; message: string; updated: string }
export type Announcement = { title: string; text: string; lines: string[] }
export type Status = { lines: LineStatus[]; announcements: Announcement[]; stale: boolean }

// Ankara (EGO), see live/src/providers/ego.ts.
type AnkaraVehicle = {
  id: string
  line: string
  lat: number
  lon: number
  plate: string | null
  speed: number | null
  features: string[]
  updatedAt: string
}
export type AnkaraArrival = {
  line: string
  lineName: string
  plate: string | null
  features: string[]
  speed: number | null
  etaSeconds: number
  stopsAway: number | null
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(LIVE_BASE + path, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() as Promise<T>
}

const POLL_MS = 15_000

/** Live vehicles of one line: İETT in Istanbul, EGO in Ankara. */
function lineVehicles(line: string): Promise<Vehicle[]> {
  const q = encodeURIComponent(line)
  if (CITY.ego)
    return get<{ vehicles: AnkaraVehicle[] }>(`/live/ankara/vehicles?line=${q}`).then((r) =>
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
      })),
    )
  return get<{ vehicles: Vehicle[] }>(`/live/vehicles?line=${q}`).then((r) => r.vehicles)
}

/** Live vehicles of the given lines, refreshed every 15 s while the page is visible. */
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
  return state.key === key && key ? state.vehicles : NONE
}

const NONE: Vehicle[] = []

let statusPromise: Promise<Status> | null = null

/** Metro İstanbul line problems. Cached for the session; null when unavailable. */
export function useLineStatus(): Status | null {
  const [status, setStatus] = useState<Status | null>(null)
  useEffect(() => {
    if (!LIVE_BASE || !CITY.iett) return
    statusPromise ??= get<Status>('/live/status')
    statusPromise.then(setStatus, () => {
      statusPromise = null
    })
  }, [])
  return status
}

export type ArrivalsState = { stop: string; arrivals: AnkaraArrival[] | null; error: boolean; at: number }

/** Ankara: live buses coming to one stop (EGO stop number), refreshed every 15 s. */
export function useAnkaraArrivals(stop: string | null): ArrivalsState | null {
  const [state, setState] = useState<ArrivalsState | null>(null)
  useEffect(() => {
    if (!LIVE_BASE || !stop || !CITY.ego) return
    let alive = true
    const load = () => {
      if (document.hidden) return
      get<{ arrivals: AnkaraArrival[] }>(`/live/ankara/arrivals?stop=${encodeURIComponent(stop)}`).then(
        (r) => alive && setState({ stop, arrivals: r.arrivals, error: false, at: Date.now() }),
        () => alive && setState((s) => ({ stop, arrivals: s?.stop === stop ? s.arrivals : null, error: true, at: Date.now() })),
      )
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [stop])
  return state && state.stop === stop ? state : null
}
