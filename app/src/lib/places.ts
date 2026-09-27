import { geocode } from './api'
import { CITY } from './city'
import { LIVE_BASE } from './config'
import type { Place } from './search'

type Row = { name: string; sub: string; lat: number; lon: number; kind: 'place' | 'address' | 'area'; distance: number }

/**
 * Places and addresses for "Nereye?": the live service's Photon search (nearest
 * first, "530 13" style street numbers, "coffeelab kızılay" style areas); MOTIS
 * geocoding when that is unreachable.
 */
export async function searchPlaces(q: string, lang: string, near: [number, number] | null): Promise<Place[]> {
  if (LIVE_BASE) {
    try {
      const params = new URLSearchParams({ q, city: CITY.id })
      if (near) {
        params.set('lat', near[1].toFixed(4))
        params.set('lon', near[0].toFixed(4))
      }
      const r = await fetch(`${LIVE_BASE}/live/search?${params}`, { signal: AbortSignal.timeout(8000) })
      if (r.ok) {
        const rows = ((await r.json()) as { results: Row[] }).results
        return rows.map((x) => ({
          name: x.name,
          sub: x.sub,
          lat: x.lat,
          lon: x.lon,
          kind: x.kind === 'address' ? 'address' : 'place',
          // The server measures from the city centre without a position: only show real distances.
          distance: near ? x.distance : undefined,
        }))
      }
    } catch {
      // Fall through to MOTIS.
    }
  }
  return geocode(q, lang)
}

/** "350 m" / "1,2 km". */
export function formatDistance(m: number): string {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`
  return `${(m / 1000).toLocaleString('tr-TR', { maximumFractionDigits: m < 9950 ? 1 : 0 })} km`
}
