// Bursa (BURULAŞ) live data provider.
//
// This file is the only place that knows where Bursa live data comes from.
// Source: the JSON service behind BursaKart's public "Otobüsüm Nerede" page
// (www.bursakart.com.tr/wheremybus, no login). It only answers requests that
// carry the page's Origin. Samples and field notes: docs/api-samples/bursa/.
// Set BURULAS_MOCK=1 to get deterministic fake data for development and demos.
//
// Privacy: the service sends the driver's full name (surucu). The parsers never
// copy it; it is not stored, logged or forwarded.

import type { AnkaraArrival, AnkaraLineStatus, AnkaraStopBoard } from './ego.ts'

export type BursaVehicle = {
  id: string // validatorNo, stable per bus
  line: string // hatkodu, e.g. "38"
  lat: number
  lon: number
  speed: number | null // km/h
  plate: string | null // e.g. "16 BJZ 19"
  direction: 'G' | 'D' | null // istikamet
  features: string[] // "Klima", "Engelli"
  tripBoardings: number | null // seferYolcu: card taps on this trip so far (nobody taps out)
  stopBoardings: number | null // durakYolcu
  updatedAt: string // fetch time: the service sends no fix time
}

/** Same shape as Ankara's so the app can share one stop board. */
export type BursaStopBoard = AnkaraStopBoard

const mock = () => process.env.BURULAS_MOCK === '1'

const BASE = process.env.BURULAS_BASE ?? 'https://bursakartapi.abys-web.com/api/'
const ORIGIN = 'https://www.bursakart.com.tr'

/** Lines at a stop hardly change: keep them for 6 h, one upstream call per stop. */
const STOP_LINES_TTL = 6 * 3600_000
const stopLines = new Map<number, { at: number; lines: StopLine[] }>()

export async function getBursaVehicles(line: string, now = Date.now()): Promise<BursaVehicle[]> {
  if (mock()) return mockBursaVehicles(line, now)
  return parseBursaVehicles(await call('static/realtimedata', { keyword: line }), line, now)
}

export async function getBursaStopBoard(stopId: number, now = Date.now()): Promise<BursaStopBoard> {
  if (mock()) return mockBursaBoard(stopId, now)
  const [board, lines] = await Promise.all([call('static/stationremainingtime', { keyword: stopId }), linesAt(stopId, now)])
  const arrivals = parseBursaArrivals(board)
  return { arrivals, lines: otherLines(lines, arrivals) }
}

async function linesAt(stopId: number, now: number): Promise<StopLine[]> {
  const hit = stopLines.get(stopId)
  if (hit && now - hit.at < STOP_LINES_TTL) return hit.lines
  try {
    const lines = parseStopLines(await call('static/RouteByStop', { keyword: stopId }))
    if (stopLines.size > 5000) stopLines.clear()
    stopLines.set(stopId, { at: now, lines })
    return lines
  } catch {
    // The board still works without the "other lines" list.
    return hit?.lines ?? []
  }
}

async function call(path: string, body: unknown): Promise<string> {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: ORIGIN, Referer: ORIGIN + '/' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`BURULAŞ HTTP ${r.status}`)
  return r.text()
}

// ---- parsing (pure) -------------------------------------------------------

type Row = Record<string, unknown>

function rows(json: string): Row[] {
  const d = JSON.parse(json) as { statusCode?: number; message?: string; result?: unknown }
  if (d.statusCode !== 200) throw new Error(`BURULAŞ: ${d.message ?? `status ${d.statusCode}`}`)
  return Array.isArray(d.result) ? (d.result as Row[]) : []
}

const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '')

function num(v: unknown): number | null {
  const s = str(v)
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** "16  bjz 19 " -> "16 BJZ 19" */
function plateOf(v: unknown): string | null {
  const s = str(v).toLocaleUpperCase('tr').replace(/\s+/g, ' ')
  return s || null
}

function features(klima: unknown, engelli: unknown): string[] {
  const on = (v: unknown) => v === true || v === 1 || v === '1'
  return [...(on(klima) ? ['Klima'] : []), ...(on(engelli) ? ['Engelli'] : [])]
}

// Rows without a fix carry placeholder coordinates like 40/29 or 40/28, which fall outside this box.
export const inBursa = (lat: number, lon: number) =>
  lat >= 39.5 && lat <= 40.8 && lon >= 28.0 && lon <= 30.1 && !(Number.isInteger(lat) && Number.isInteger(lon))

export function parseBursaVehicles(json: string, line: string, now: number): BursaVehicle[] {
  const at = new Date(now).toISOString()
  const out: BursaVehicle[] = []
  const seen = new Set<string>()
  for (const r of rows(json)) {
    const lat = num(r.enlem)
    const lon = num(r.boylam)
    if (lat === null || lon === null || !inBursa(lat, lon)) continue
    const plate = plateOf(r.plaka)
    const validator = num(r.validatorNo)
    const id = validator ? String(validator) : plate // 0 means no validator
    if (!id || seen.has(id)) continue
    seen.add(id)
    const dir = str(r.istikamet).toUpperCase()
    // Only whitelisted fields are copied: surucu (driver name) and gunlukYolcu never leave this function.
    out.push({
      id,
      line: str(r.hatkodu) || line,
      lat,
      lon,
      speed: num(r.hiz),
      plate,
      direction: dir === 'G' || dir === 'D' ? dir : null,
      features: features(r.klimaVarMi, r.engelliUygunMu),
      tripBoardings: num(r.seferYolcu),
      stopBoardings: num(r.durakYolcu),
      updatedAt: at,
    })
  }
  return out
}

/** "00:05:00" -> 300 */
export function hmsToSeconds(v: unknown): number | null {
  const m = str(v).match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

export function parseBursaArrivals(json: string): AnkaraArrival[] {
  const out: AnkaraArrival[] = []
  for (const r of rows(json)) {
    const line = str(r.routeCode)
    const eta = hmsToSeconds(r.realTime) ?? hmsToSeconds(r.passTime)
    if (!line || eta === null) continue
    out.push({
      line,
      lineName: str(r.routeTitle),
      plate: plateOf(r.licencePlate),
      features: features(r.isAirConditioner, r.isSuitableForDisabled),
      // vehicleSpeed and vehicleLat/Lng are placeholders (0, 40/29) in this answer.
      speed: null,
      etaSeconds: eta,
      stopsAway: null,
    })
  }
  return out.sort((a, b) => a.etaSeconds - b.etaSeconds)
}

export type StopLine = { line: string; name: string }

export function parseStopLines(json: string): StopLine[] {
  return rows(json)
    .map((r) => ({ line: str(r.routeCode), name: str(r.routeName) }))
    .filter((l) => l.line)
}

/** Lines at the stop with no live bus coming. The service gives no next-trip time for them. */
export function otherLines(lines: StopLine[], arrivals: AnkaraArrival[]): AnkaraLineStatus[] {
  const live = new Set(arrivals.map((a) => a.line))
  const seen = new Set<string>()
  const out: AnkaraLineStatus[] = []
  for (const l of lines) {
    if (live.has(l.line) || seen.has(l.line)) continue
    seen.add(l.line)
    out.push({ line: l.line, lineName: l.name === l.line ? '' : l.name, nextStart: null, nextStartInMin: null, noMoreToday: false })
  }
  return out.sort((a, b) => a.line.localeCompare(b.line, 'tr', { numeric: true }))
}

// ---- mock data ------------------------------------------------------------

function seed(s: string): number {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

// Three buses circling around Kent Meydanı; positions move with time.
export function mockBursaVehicles(line: string, now: number): BursaVehicle[] {
  const base = seed(line)
  return [0, 1, 2].map((i) => {
    const a = ((now / 600_000 + i / 3 + (base % 100) / 100) % 1) * 2 * Math.PI
    return {
      id: `M${(base % 900) + 100}-${i}`,
      line,
      lat: 40.195 + 0.02 * Math.sin(a),
      lon: 29.06 + 0.03 * Math.cos(a),
      speed: 15 + ((base + i * 7) % 30),
      plate: `16 MK ${100 + ((base + i) % 900)}`,
      direction: i % 2 ? 'D' : 'G',
      features: i === 0 ? ['Klima', 'Engelli'] : ['Klima'],
      tripBoardings: 10 + ((base >>> i) % 70),
      stopBoardings: (base >>> i) % 6,
      updatedAt: new Date(now).toISOString(),
    }
  })
}

export function mockBursaBoard(stopId: number, now: number): BursaStopBoard {
  const base = seed(String(stopId))
  const minute = Math.floor(now / 60_000)
  const arrivals = ['38', '97A', 'B17A'].map((line, i) => ({
    line,
    lineName: `MOCK HAT ${line}`,
    plate: `16 MK ${100 + ((base + i) % 900)}`,
    features: ['Klima', 'Engelli'],
    speed: null,
    etaSeconds: (((base >>> (i * 4)) + minute) % 20) * 60,
    stopsAway: null,
  }))
  return {
    arrivals: arrivals.sort((a, b) => a.etaSeconds - b.etaSeconds),
    lines: [{ line: 'B25', lineName: '', nextStart: null, nextStartInMin: null, noMoreToday: false }],
  }
}
