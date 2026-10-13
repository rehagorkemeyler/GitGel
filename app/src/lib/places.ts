import { geocode } from './api'
import { LIVE_BASE } from './config'
import { CITY } from './city'
import type { Place } from './search'

// "Nereye?" places. Google Places goes through our server (the key never ships
// in the app, the server caps daily use). When Google is capped or down: the
// server's free Photon search, then MOTIS geocoding.

export type Suggestion = { id: string; name: string; sub: string; types: string[]; distance?: number }

export class Fallback extends Error {}

async function getJson<T>(path: string, params: URLSearchParams, timeoutMs = 7000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(`${LIVE_BASE}${path}?${params}`, { signal: ctrl.signal })
    if (r.status === 429 || r.status === 503) throw new Fallback()
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** A new token per search session: autocomplete calls plus the final details call bill as one. */
export function newSession(): string {
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${h()}-${h()}${h()}${h()}`
}

export async function googleSuggest(q: string, session: string, near: [number, number] | null): Promise<Suggestion[]> {
  if (!LIVE_BASE) throw new Fallback()
  const params = new URLSearchParams({ q: addressQuery(q), session, city: CITY.id })
  if (near) {
    params.set('lat', near[1].toFixed(3))
    params.set('lon', near[0].toFixed(3))
  }
  return nearestFirst((await getJson<{ results: Suggestion[] }>('/live/places/autocomplete', params)).results)
}

/**
 * How people type addresses in Turkish cities, rewritten the way maps know them:
 *   "530 13"     -> "530. Sokak No:13"
 *   "530/13"     -> "530. Sokak No:13"
 *   "sancak 530" -> "Sancak Mahallesi 530. Sokak"
 * Anything else is sent as typed.
 */
export function addressQuery(q: string): string {
  const s = q.trim().replace(/\s+/g, ' ')
  const house = s.match(/^(\d{1,5})\.?\s*(?:\/|\s+no\s*:?\s*|\s+)(\d{1,4}[a-zA-Z]?)$/i)
  if (house) return `${house[1]}. Sokak No:${house[2]}`
  const street = s.match(/^([^\d\s]{3,})\s+(\d{1,5})\.?$/)
  if (street) {
    const area = street[1].charAt(0).toLocaleUpperCase('tr') + street[1].slice(1)
    return `${area} Mahallesi ${street[2]}. Sokak`
  }
  return s
}

/**
 * Nearest first, with one exception: when the results are different places (not branches
 * of one chain like "mcd"), Google's best match stays on top ("tedu" -> TED Üniversitesi),
 * the rest follow by distance. Unknown distances go last.
 */
export function nearestFirst(list: Suggestion[]): Suggestion[] {
  const byDistance = (a: Suggestion, b: Suggestion) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
  const key = (x: Suggestion) => x.name.toLocaleLowerCase('tr')
  const chain = list.some((x, i) => list.findIndex((y) => key(y) === key(x)) !== i)
  if (chain || list.length < 2) return [...list].sort(byDistance)
  return [list[0], ...list.slice(1).sort(byDistance)]
}

export async function googlePlace(id: string, session: string): Promise<Place> {
  const p = (await getJson<{ place: { name: string; address: string; lat: number; lon: number } }>(
    '/live/places/details',
    new URLSearchParams({ id, session }),
  )).place
  return { name: p.name, sub: p.address, lat: p.lat, lon: p.lon, kind: 'place' }
}

type Row = { name: string; sub: string; lat: number; lon: number; kind: 'place' | 'address' | 'area'; distance: number }

/** Free places and addresses: the live service's Photon search, MOTIS geocoding when that is down. */
export async function freePlaces(q: string, lang: string, near: [number, number] | null): Promise<Place[]> {
  if (LIVE_BASE) {
    try {
      const params = new URLSearchParams({ q, city: CITY.id })
      if (near) {
        params.set('lat', near[1].toFixed(4))
        params.set('lon', near[0].toFixed(4))
      }
      const rows = (await getJson<{ results: Row[] }>('/live/search', params, 8000)).results
      return rows.map((x) => ({
        name: x.name,
        sub: x.sub,
        lat: x.lat,
        lon: x.lon,
        kind: x.kind === 'address' ? 'address' : 'place',
        // The server measures from the city centre without a position: only show real distances.
        distance: near ? x.distance : undefined,
      }))
    } catch {
      // Fall through to MOTIS.
    }
  }
  return geocode(q, lang)
}

/** "350 m" / "1,2 km". */
export function formatDistance(m: number): string {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`
  const km = m / 1000
  return `${(m < 9950 ? km.toFixed(1) : km.toFixed(0)).replace('.', ',')} km`
}

export type Category = 'food' | 'cafe' | 'park' | 'shop' | 'school' | 'health' | 'culture' | 'transit' | 'other'

/** Google place types to one of a few badge categories. */
export function categoryOf(types: string[]): Category {
  const has = (...xs: string[]) => xs.some((x) => types.includes(x))
  if (has('cafe', 'coffee_shop', 'tea_house', 'bakery')) return 'cafe'
  if (has('restaurant', 'food', 'meal_takeaway', 'bar', 'fast_food_restaurant')) return 'food'
  if (has('park', 'natural_feature', 'beach', 'garden', 'campground')) return 'park'
  if (has('store', 'shopping_mall', 'supermarket', 'book_store', 'clothing_store', 'market')) return 'shop'
  if (has('school', 'university', 'primary_school', 'secondary_school')) return 'school'
  if (has('hospital', 'pharmacy', 'doctor', 'health', 'dentist')) return 'health'
  if (has('museum', 'tourist_attraction', 'performing_arts_theater', 'movie_theater', 'art_gallery', 'stadium', 'mosque', 'church')) return 'culture'
  if (has('transit_station', 'bus_station', 'subway_station', 'train_station', 'ferry_terminal', 'light_rail_station')) return 'transit'
  return 'other'
}
