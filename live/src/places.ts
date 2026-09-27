// Google Places (New) proxy for the native app's "Nereye?" search. The key
// never leaves the server, and hard daily caps keep it inside the free tier:
//
//   autocomplete  300 requests a day, Istanbul or Ankara   (~9 000 a month, free cap 10 000)
//   details       160 requests a day   (~4 800 a month, free cap 5 000; Pro fields)
//
// Days are Istanbul days. Counters are written to disk so a restart does not
// reset them. Details are cached by place id for 30 days (Google's limit for
// coordinates). A client (IP) may make at most 60 requests an hour. When any
// limit is hit the app gets 429 {"fallback": true} and uses the free Photon search.

import { readFileSync, renameSync, writeFileSync } from 'node:fs'

export const AUTOCOMPLETE_PER_DAY = 300
export const DETAILS_PER_DAY = 160
export const PER_IP_PER_HOUR = 60
const DETAILS_TTL_MS = 30 * 24 * 3600_000
const MAX_CACHED_DETAILS = 5000

// Results stay inside the city the app shows (same boxes as the app's lib/city.ts).
export const RECTANGLES = {
  istanbul: { low: { latitude: 40.7, longitude: 27.9 }, high: { latitude: 41.7, longitude: 30.0 } },
  ankara: { low: { latitude: 39.5, longitude: 32.2 }, high: { latitude: 40.3, longitude: 33.4 } },
} as const
export type PlacesCity = keyof typeof RECTANGLES
const API = 'https://places.googleapis.com/v1'

export type Suggestion = { id: string; name: string; sub: string; types: string[]; distance?: number }
export type PlaceDetails = { id: string; name: string; address: string; lat: number; lon: number }

export class LimitReached extends Error {}
export class NotConfigured extends Error {}

type Usage = { day: string; autocomplete: number; details: number }
type Saved = { usage: Usage; details: [string, { at: number; value: PlaceDetails }][] }

/** Istanbul calendar day (UTC+3 all year) as YYYY-MM-DD. */
export function istanbulDay(ms: number): string {
  return new Date(ms + 3 * 3600_000).toISOString().slice(0, 10)
}

type Deps = {
  key: string
  file?: string
  fetch?: typeof fetch
  now?: () => number
}

export class Places {
  private key: string
  private file?: string
  private fetch: typeof fetch
  private now: () => number
  private usage: Usage
  private details = new Map<string, { at: number; value: PlaceDetails }>()
  private perIp = new Map<string, { hour: number; count: number }>()

  constructor({ key, file, fetch: f = fetch, now = Date.now }: Deps) {
    this.key = key
    this.file = file
    this.fetch = f
    this.now = now
    this.usage = { day: istanbulDay(now()), autocomplete: 0, details: 0 }
    this.load()
  }

  /** Today's counters (for /live/health style checks and tests). */
  today(): Usage {
    this.rollDay()
    return { ...this.usage }
  }

  /** Counts one request from `ip`; throws LimitReached past 60 an hour. */
  allowClient(ip: string) {
    const hour = Math.floor(this.now() / 3600_000)
    const e = this.perIp.get(ip)
    if (!e || e.hour !== hour) {
      if (this.perIp.size > 10_000) this.perIp.clear()
      this.perIp.set(ip, { hour, count: 1 })
      return
    }
    if (e.count >= PER_IP_PER_HOUR) throw new LimitReached('client')
    e.count++
  }

  async autocomplete(q: string, session: string, near?: [number, number], city: PlacesCity = 'istanbul'): Promise<Suggestion[]> {
    if (!this.key) throw new NotConfigured()
    this.take('autocomplete', AUTOCOMPLETE_PER_DAY)
    const body: Record<string, unknown> = {
      input: q,
      languageCode: 'tr',
      regionCode: 'TR',
      locationRestriction: { rectangle: RECTANGLES[city] },
      sessionToken: session,
    }
    if (near) body.origin = { latitude: near[0], longitude: near[1] }
    const r = await this.fetch(`${API}/places:autocomplete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) throw new Error(`places autocomplete HTTP ${r.status}`)
    const data = (await r.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId: string
          text?: { text: string }
          structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }
          types?: string[]
          distanceMeters?: number
        }
      }[]
    }
    return (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
      .map((p) => ({
        id: p.placeId,
        name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        sub: p.structuredFormat?.secondaryText?.text ?? '',
        types: p.types ?? [],
        distance: p.distanceMeters,
      }))
  }

  async place(id: string, session: string): Promise<PlaceDetails> {
    const hit = this.details.get(id)
    if (hit && this.now() - hit.at < DETAILS_TTL_MS) return hit.value
    if (!this.key) throw new NotConfigured()
    this.take('details', DETAILS_PER_DAY)
    const params = new URLSearchParams({ languageCode: 'tr', regionCode: 'TR' })
    if (session) params.set('sessionToken', session)
    const r = await this.fetch(`${API}/places/${encodeURIComponent(id)}?${params}`, {
      headers: { 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location' },
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) throw new Error(`places details HTTP ${r.status}`)
    const p = (await r.json()) as {
      id: string
      displayName?: { text: string }
      formattedAddress?: string
      location?: { latitude: number; longitude: number }
    }
    if (!p.location) throw new Error('places details without location')
    const value: PlaceDetails = {
      id: p.id ?? id,
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? '',
      lat: p.location.latitude,
      lon: p.location.longitude,
    }
    if (this.details.size >= MAX_CACHED_DETAILS) {
      const oldest = this.details.keys().next().value
      if (oldest !== undefined) this.details.delete(oldest)
    }
    this.details.set(id, { at: this.now(), value })
    this.save()
    return value
  }

  private rollDay() {
    const day = istanbulDay(this.now())
    if (day !== this.usage.day) this.usage = { day, autocomplete: 0, details: 0 }
  }

  /** Counts a Google request before it is made; past the cap nothing reaches Google. */
  private take(kind: 'autocomplete' | 'details', cap: number) {
    this.rollDay()
    if (this.usage[kind] >= cap) throw new LimitReached(kind)
    this.usage[kind]++
    this.save()
  }

  private load() {
    if (!this.file) return
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Saved
      if (saved.usage?.day === this.usage.day) this.usage = saved.usage
      const now = this.now()
      for (const [id, e] of saved.details ?? []) if (now - e.at < DETAILS_TTL_MS) this.details.set(id, e)
    } catch {
      // No file yet or unreadable: start from zero (the caps still hold for today from here on).
    }
  }

  private save() {
    if (!this.file) return
    try {
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify({ usage: this.usage, details: [...this.details] } satisfies Saved))
      renameSync(tmp, this.file)
    } catch (e) {
      console.error('places save failed', e)
    }
  }
}
