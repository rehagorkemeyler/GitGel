import { loadJson } from './data'

// Base transit network from the nightly ETL (same files the PWA draws).

export type Station = {
  id: string
  ids: string[]
  name: string
  lat: number
  lon: number
  mode: string
  lines: string[]
  transfer?: boolean
}

export type NetworkLine = {
  key: string
  line: string
  name: string
  mode: string
  color: string
  coords: { latitude: number; longitude: number }[]
}

type Geo = {
  features: {
    properties: { line: string; name: string; mode: string; color: string }
    geometry: { type: string; coordinates: [number, number][] }
  }[]
}

let networkPromise: Promise<NetworkLine[]> | null = null

/** Rail, tram, cable car and ferry lines as map polylines. */
export function loadNetwork(): Promise<NetworkLine[]> {
  networkPromise ??= loadJson<Geo>('network.geojson').then((g) =>
    g.features
      .filter((f) => f.geometry.type === 'LineString' && f.geometry.coordinates.length > 1)
      .map((f, i) => ({
        key: `${f.properties.line}-${i}`,
        line: f.properties.line,
        name: f.properties.name,
        mode: f.properties.mode,
        color: f.properties.color || '#8e8e93',
        coords: f.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
      })),
  )
  networkPromise.catch(() => (networkPromise = null))
  return networkPromise
}

export const loadStations = () => loadJson<Station[]>('stations.json')

let busNetworkPromise: Promise<Map<string, NetworkLine[]>> | null = null

/** Ankara and Bursa: every bus route's real shape, by line id (Istanbul has none: stops are joined instead). */
export function loadBusNetwork(): Promise<Map<string, NetworkLine[]>> {
  busNetworkPromise ??= loadJson<Geo>('bus-network.geojson').then((g) => {
    const byLine = new Map<string, NetworkLine[]>()
    g.features.forEach((f, i) => {
      if (f.geometry.type !== 'LineString' || f.geometry.coordinates.length < 2) return
      const l: NetworkLine = {
        key: `bus-${f.properties.line}-${i}`,
        line: f.properties.line,
        name: f.properties.name,
        mode: 'bus',
        color: '',
        coords: f.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
      }
      byLine.set(l.line, [...(byLine.get(l.line) ?? []), l])
    })
    return byLine
  })
  busNetworkPromise.catch(() => (busNetworkPromise = null))
  return busNetworkPromise
}

export function resetNetworkCaches() {
  networkPromise = null
  busNetworkPromise = null
}
