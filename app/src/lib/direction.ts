import { loadJson, loadStops, type Line, type StopRow } from './data'
import { CITY, type CityId } from './city'
import { distanceM } from './geo'
import type { LineDetail } from './lineDetail'

// Bus directions in words people use (Ankara, Bursa): "Oran yönü", "Kızılay / Mamak yönü",
// instead of the name of the last stop ("Otel"). Rough on purpose: the last stop is
// named after the nearest known area, and a line that still passes a hub (Kızılay, Ulus;
// Kent Meydanı, Heykel) says so first.

type Area = [name: string, lat: number, lon: number]

const ANKARA: Area[] = [
  ['Kızılay', 39.9208, 32.8541],
  ['Ulus', 39.9414, 32.8547],
  ['Kavaklıdere', 39.906, 32.861],
  ['Cebeci', 39.929, 32.883],
  ['Bahçelievler', 39.923, 32.823],
  ['AŞTİ', 39.9181, 32.8103],
  ['Balgat', 39.9, 32.818],
  ['Ayrancı', 39.896, 32.85],
  ['Dikmen', 39.88, 32.836],
  ['Oran', 39.856, 32.836],
  ['Gölbaşı', 39.788, 32.806],
  ['İncek', 39.825, 32.73],
  ['Bilkent', 39.87, 32.749],
  ['Beytepe', 39.8665, 32.735],
  ['ODTÜ', 39.892, 32.784],
  ['Ümitköy', 39.889, 32.7],
  ['Çayyolu', 39.871, 32.686],
  ['Yaşamkent', 39.858, 32.66],
  ['Eryaman', 39.977, 32.645],
  ['Etimesgut', 39.95, 32.676],
  ['Elvankent', 39.95, 32.625],
  ['Sincan', 39.968, 32.583],
  ['Batıkent', 39.969, 32.73],
  ['Demetevler', 39.966, 32.788],
  ['Yenimahalle', 39.96, 32.81],
  ['Şentepe', 39.99, 32.815],
  ['Etlik', 39.97, 32.845],
  ['Keçiören', 39.985, 32.864],
  ['Aydınlıkevler', 39.956, 32.865],
  ['Pursaklar', 40.038, 32.898],
  ['Esenboğa', 40.124, 32.999],
  ['Mamak', 39.931, 32.915],
  ['Kahramankazan', 40.207, 32.684],
  ['Elmadağ', 39.92, 33.23],
  ['Polatlı', 39.584, 32.147],
]

// Coordinates of a stop in each area, from BURULAŞ stop data (etl/out/bursa/stops.json).
const BURSA: Area[] = [
  ['Heykel', 40.183, 29.0662], // T1-HEYKEL
  ['Kent Meydanı', 40.1961, 29.0614], // KENT MEYDANI 2
  ['Yıldırım', 40.1906, 29.0858], // YILDIRIM BELEDİYESİ 2
  ['Nilüfer', 40.2115, 28.975], // FATİH SULTAN MEHMET İSTASYONU 2 (FSM Bulvarı)
  ['Beşevler', 40.213, 28.9668], // BEŞEVLER İSTASYONU 1
  ['Görükle', 40.2241, 28.8709], // ULUDAĞ ÜNİVERSİTESİ 1
  ['Özlüce', 40.2377, 28.9093], // ÖZLÜCE CAMİ 1
  ['Emek', 40.2565, 28.953], // EMEK İSTASYONU 1
  ['Nilüfer OSB', 40.2368, 28.9533], // OSB KIRMIZI CD.
  ['Terminal', 40.2659, 29.0574], // TERMİNAL 1
  ['Şehir Hastanesi', 40.2649, 28.9107], // BURSA ŞEHİR HASTANESİ
  ['Kestel', 40.2026, 29.207], // KESTEL İST. 1
  ['Gürsu', 40.2186, 29.1922], // GÜRSU MEYDAN 1
  ['Mudanya', 40.3721, 28.8902], // MUDANYA 8
]

const PLACES: Partial<Record<CityId, { areas: Area[]; hubs: Area[] }>> = {
  ankara: { areas: ANKARA, hubs: ANKARA.filter(([n]) => n === 'Kızılay' || n === 'Ulus') },
  bursa: { areas: BURSA, hubs: BURSA.filter(([n]) => n === 'Kent Meydanı' || n === 'Heykel') },
}

const AREA_M = 3000
const HUB_PASS_M = 500
const HUB_HERE_M = 700

const near = (s: { lat: number; lon: number }, a: Area) => distanceM(s.lat, s.lon, a[1], a[2])

/** Nearest known area within 3 km of a point, or null. */
export function areaOf(s: { lat: number; lon: number }, city: CityId = CITY.id): string | null {
  let best: Area | null = null
  let bestM = AREA_M
  for (const a of PLACES[city]?.areas ?? []) {
    const m = near(s, a)
    if (m < bestM) {
      best = a
      bestM = m
    }
  }
  return best?.[0] ?? null
}

/** Where a bus of this line goes from this stop: "Oran", "Kızılay / Mamak"; null if the stop is not on it. */
export function directionFrom(line: LineDetail, stopId: string, stops: Map<string, StopRow>, city: CityId = CITY.id): string | null {
  // A stop can be on both directions (loops, shared terminals): take the one it is not the end of.
  const dir =
    line.directions.find((d) => {
      const i = d.stops.indexOf(stopId)
      return i >= 0 && i < d.stops.length - 1
    }) ?? null
  if (!dir) return null
  const here = stops.get(stopId)
  const rest = dir.stops
    .slice(dir.stops.indexOf(stopId) + 1)
    .map((id) => stops.get(id))
    .filter((s): s is StopRow => !!s)
  const end = rest[rest.length - 1]
  if (!end) return dir.headsign || null
  const dest = areaOf(end, city) ?? (dir.headsign || end.name)
  const hubs = PLACES[city]?.hubs ?? []
  let via: string | null = null
  for (const s of rest.slice(0, -1)) {
    const hub = hubs.find((h) => near(s, h) < HUB_PASS_M)
    if (hub) {
      if (hub[0] !== dest && (!here || near(here, hub) > HUB_HERE_M)) via = hub[0]
      break
    }
  }
  return via ? `${via} / ${dest}` : dest
}

let stopIndex: Promise<Map<string, StopRow>> | null = null
let stopIndexCity = ''

/** Direction words for several lines at one stop, by line name. Lines without data are left out. */
export async function directionsAt(lines: Line[], stopId: string): Promise<Map<string, string>> {
  if (stopIndexCity !== CITY.id) stopIndex = null
  stopIndexCity = CITY.id
  stopIndex ??= loadStops().then(
    (all) => new Map(all.map((s) => [s.id, s])),
    (e) => {
      stopIndex = null
      throw e
    },
  )
  const stops = await stopIndex
  const found = await Promise.all(
    lines.map((l) =>
      loadJson<LineDetail>(`lines/${l.id}.json`).then(
        (d) => [l.name, directionFrom(d, stopId, stops)] as const,
        () => [l.name, null] as const,
      ),
    ),
  )
  return new Map(found.filter((f): f is readonly [string, string] => !!f[1]))
}
