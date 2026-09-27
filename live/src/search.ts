// Place and address search for the "Nereye?" box, on a self-hosted Photon
// (OpenStreetMap geocoder, infra/docker-compose.yml). Photon finds names well;
// this module adds what people type in Turkish cities:
//
//   "530 13"            street number + house number: 530. Sokak No 13, nearest first
//   "coffeelab kızılay" a place + an area: coffeelab near Kızılay
//   "odtü vişnelik"     no match with every word: retry with fewer words
//
// Results stay inside the chosen city and come nearest first, with the distance.

const PHOTON_URL = process.env.PHOTON_URL ?? 'http://photon:2322'

export type City = { bbox: [number, number, number, number]; center: [number, number] } // bbox: minLon,minLat,maxLon,maxLat; center: lat,lon

export const CITIES: Record<string, City> = {
  istanbul: { bbox: [27.9, 40.7, 30.0, 41.7], center: [41.03, 28.98] },
  ankara: { bbox: [32.2, 39.5, 33.4, 40.3], center: [39.92, 32.854] },
}

export type SearchResult = {
  name: string
  /** Street, neighbourhood, district: what tells two same-named places apart. */
  sub: string
  lat: number
  lon: number
  kind: 'place' | 'address' | 'area'
  /** Metres from the user (or the city centre when the position is unknown). */
  distance: number
}

type Feature = { geometry: { coordinates: [number, number] }; properties: Record<string, unknown> }

const LIMIT = 8

function str(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''
}

export function distanceM(a: [number, number], b: [number, number]): number {
  const k = Math.PI / 180
  const x = (b[1] - a[1]) * k * Math.cos(((a[0] + b[0]) / 2) * k)
  const y = (b[0] - a[0]) * k
  return Math.round(Math.hypot(x, y) * 6371000)
}

const isArea = (p: Record<string, unknown>) =>
  p.osm_key === 'place' || ['district', 'locality', 'city', 'county'].includes(str(p.type))

/** One Photon feature as a result row. */
export function toResult(f: Feature, from: [number, number]): SearchResult {
  const p = f.properties
  const [lon, lat] = f.geometry.coordinates
  const street = [str(p.street), str(p.housenumber)].filter(Boolean).join(' ')
  const name = str(p.name) || street || str(p.district) || '?'
  const parts = [street, str(p.district) || str(p.locality), str(p.county) || str(p.city)]
  const sub = [...new Set(parts.filter((x) => x && x !== name))].join(', ')
  const kind = isArea(p) ? 'area' : p.osm_key === 'highway' && !p.housenumber ? 'address' : p.housenumber && !p.name ? 'address' : 'place'
  return { name, sub, lat, lon, kind, distance: distanceM(from, [lat, lon]) }
}

/** Inside the city, one row per place (same name within 60 m counts once), nearest first. */
export function rank(results: SearchResult[], city: City, limit = LIMIT): SearchResult[] {
  const [minLon, minLat, maxLon, maxLat] = city.bbox
  const inCity = results.filter((r) => r.lon >= minLon && r.lon <= maxLon && r.lat >= minLat && r.lat <= maxLat)
  const out: SearchResult[] = []
  for (const r of inCity.sort((a, b) => a.distance - b.distance)) {
    if (out.some((o) => o.name === r.name && distanceM([o.lat, o.lon], [r.lat, r.lon]) < 60)) continue
    out.push(r)
  }
  return out.slice(0, limit)
}

/** "530 13", "530 no 13", "530/13": street number and house number. */
export function parseStreetNumber(q: string): { street: string; house: string } | null {
  const m = q.trim().match(/^(\d{1,5})\.?\s*(?:\/|\s+no\s*:?\s*|\s+)(\d{1,4}[a-zA-Z]?)$/i)
  return m ? { street: m[1], house: m[2] } : null
}

async function photon(q: string, near: [number, number], city: City, limit = 15): Promise<Feature[]> {
  const params = new URLSearchParams({
    q,
    lat: String(near[0]),
    lon: String(near[1]),
    limit: String(limit),
    lang: 'tr',
    bbox: city.bbox.join(','),
  })
  const r = await fetch(`${PHOTON_URL}/api?${params}`, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`photon HTTP ${r.status}`)
  return ((await r.json()) as { features?: Feature[] }).features ?? []
}

export async function search(q: string, cityId: string, user?: [number, number]): Promise<SearchResult[]> {
  const city = CITIES[cityId]
  if (!city) return []
  const from = user ?? city.center
  const text = q.trim().replace(/\s+/g, ' ')

  // 1. Street number + house number: OSM rarely has Ankara house numbers, so point at the street.
  const sn = parseStreetNumber(text)
  if (sn) {
    const feats = [...(await photon(`${sn.street}. Sokak`, from, city)), ...(await photon(`${sn.street}. Cadde`, from, city))]
    const streets = feats
      .filter((f) => str(f.properties.name).startsWith(`${sn.street}.`))
      .map((f) => {
        const r = toResult(f, from)
        return { ...r, name: `${r.name} No ${sn.house}`, kind: 'address' as const }
      })
    const hit = rank(streets, city)
    if (hit.length) return hit
  }

  // 2. The whole query.
  const all = rank((await photon(text, from, city)).map((f) => toResult(f, from)), city)
  if (all.length) return all

  const words = text.split(' ')
  if (words.length < 2) return []

  // 3. "<what> <area>": search the rest around the area.
  const area = rank((await photon(words[words.length - 1], from, city, 5)).map((f) => toResult(f, from)), city).find((r) => r.kind === 'area')
  if (area) {
    const around: [number, number] = [area.lat, area.lon]
    const feats = await photon(words.slice(0, -1).join(' '), around, city)
    // Nearest to the area first; distances still from the user.
    const near = feats
      .map((f) => ({ r: toResult(f, from), d: distanceM(around, [f.geometry.coordinates[1], f.geometry.coordinates[0]]) }))
      .filter((x) => x.d < 3000)
      .sort((a, b) => a.d - b.d)
      .map((x) => x.r)
    const hit = rank(near, city).sort((a, b) => distanceM(around, [a.lat, a.lon]) - distanceM(around, [b.lat, b.lon]))
    if (hit.length) return hit
  }

  // 4. Fewer words: leave one out at a time, longest remaining phrase first.
  const found: SearchResult[] = []
  for (let i = words.length - 1; i >= 0 && found.length < LIMIT; i--) {
    const rest = words.filter((_, k) => k !== i).join(' ')
    found.push(...(await photon(rest, from, city)).map((f) => toResult(f, from)))
  }
  return rank(found, city)
}
