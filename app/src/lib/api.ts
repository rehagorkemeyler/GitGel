import { API_BASE } from './config'
import type { Mode, Place } from './search'

// MOTIS API client. Every call has a timeout; callers show a calm message on failure.

async function get<T>(path: string, params: Record<string, string>, timeoutMs = 8000): Promise<T> {
  if (!API_BASE) throw new Error('no API configured')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(`${API_BASE}${path}?${new URLSearchParams(params)}`, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

type GeocodeMatch = {
  type: 'STOP' | 'PLACE' | 'ADDRESS'
  name: string
  lat: number
  lon: number
  street?: string
  houseNumber?: string
  areas?: { name: string; adminLevel: number; default?: boolean }[]
}

export async function geocode(text: string, lang: string): Promise<Place[]> {
  const res = await get<GeocodeMatch[]>('/api/v1/geocode', { text, language: lang })
  return res
    .filter((m) => m.type !== 'STOP') // stops come from the local index
    .slice(0, 5)
    .map((m) => {
      const area = m.areas?.find((a) => a.default)?.name ?? m.areas?.find((a) => a.adminLevel === 6)?.name
      const name = m.type === 'ADDRESS' && m.street ? `${m.street}${m.houseNumber ? ' ' + m.houseNumber : ''}` : m.name
      return { name, lat: m.lat, lon: m.lon, kind: m.type === 'ADDRESS' ? 'address' : 'place', sub: area } as Place
    })
}

export type LegPlace = {
  name: string
  lat: number
  lon: number
  stopId?: string
  departure?: string
  arrival?: string
}

export type Leg = {
  mode: string
  from: LegPlace
  to: LegPlace
  startTime: string
  endTime: string
  duration: number
  distance?: number
  routeShortName?: string
  routeColor?: string
  routeTextColor?: string
  headsign?: string
  agencyName?: string
  realTime?: boolean
  scheduled?: boolean
  intermediateStops?: LegPlace[]
  legGeometry?: { points: string; precision?: number }
}

export type Itinerary = {
  duration: number
  startTime: string
  endTime: string
  transfers: number
  legs: Leg[]
}

export async function plan(from: Place, to: Place, time: Date = new Date()): Promise<Itinerary[]> {
  const res = await get<{ itineraries: Itinerary[] }>(
    '/api/v5/plan',
    {
      fromPlace: `${from.lat},${from.lon}`,
      toPlace: `${to.lat},${to.lon}`,
      time: time.toISOString(),
      numItineraries: '5',
    },
    15000,
  )
  return res.itineraries ?? []
}

export const MODE_OF_LEG: Record<string, Mode | 'walk'> = {
  WALK: 'walk',
  BUS: 'bus',
  TRAM: 'tram',
  SUBWAY: 'metro',
  METRO: 'metro',
  RAIL: 'rail',
  REGIONAL_RAIL: 'rail',
  SUBURBAN: 'rail',
  FERRY: 'ferry',
  FUNICULAR: 'funicular',
  AERIAL_LIFT: 'cablecar',
}

export type StopTime = {
  place: LegPlace
  routeShortName?: string
  headsign?: string
  realTime?: boolean
}

/** Next departures at a stop (MOTIS groups nearby platforms of the same station). */
export async function stopTimes(stopId: string, time: Date, n = 10): Promise<StopTime[]> {
  const res = await get<{ stopTimes: StopTime[] }>('/api/v5/stoptimes', {
    stopId,
    time: time.toISOString(),
    n: String(n),
  })
  return res.stopTimes ?? []
}
