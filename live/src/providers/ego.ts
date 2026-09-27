// Ankara (EGO) live data provider.
//
// This file is the only place that knows where Ankara live data comes from.
// The rest of GitGel (server routes, cache, app) only relies on the two
// functions and the two types below. See docs/ankara-live-provider.md.
//
// Source: the JSON service behind EGO's own "EGO Cepte" app
// (egocptsrvand.ego.gov.tr, no key). Endpoints and field meanings come from
// the MIT-licensed EGO Mac project (github.com/byigitt/egomac, docs/api-discovery.md).
// Set EGO_MOCK=1 to get deterministic fake data for development and demos.

export type AnkaraVehicle = {
  id: string // vehicle or door number, stable per bus
  line: string // EGO line code, e.g. "185-7"
  lat: number
  lon: number
  speed: number | null // km/h
  heading: number | null // degrees clockwise from north
  plate: string | null // e.g. "06 HO 1327"
  features: string[] // e.g. ["Körüklü", "Engelli"]
  updatedAt: string // ISO time of the position fix
  stop: string | null // EGO stop number the bus is at or heading to (durak_no), for timetable calibration
}

export type AnkaraArrival = {
  line: string
  lineName: string
  plate: string | null
  features: string[]
  speed: number | null // km/h
  etaSeconds: number // 0 means "at the stop now"
  stopsAway: number | null // stops between the bus and this stop
}

/** A line at the stop with no live bus coming: what EGO says about its next trip. */
export type AnkaraLineStatus = {
  line: string
  lineName: string
  /** Next departure from the line's first stop, "HH:MM" (EGO writes "24:30" after midnight). */
  nextStart: string | null
  /** Minutes until that departure. */
  nextStartInMin: number | null
  /** EGO: "Hattın Bugün İçin Başka Servisi Yok". */
  noMoreToday: boolean
}

/** Everything the stop card needs: live buses, and the other lines' next trips. */
export type AnkaraStopBoard = { arrivals: AnkaraArrival[]; lines: AnkaraLineStatus[] }

export class NotImplemented extends Error {
  constructor() {
    super('Ankara live provider is not implemented')
  }
}

const mock = () => process.env.EGO_MOCK === '1'

const BASE = process.env.EGO_BASE ?? 'https://egocptsrvand.ego.gov.tr/mblSrv14/service.asp'
// The service answers any client; we send the official app's User-Agent like EGO Mac does.
const UA = 'EGO Cepte/8 CFNetwork/1568.300.101 Darwin/24.0.0'

export const MAX_AGE_MS = 5 * 60 * 1000
const PASSED = 999_000 // EGO sends saniye=999999 for "Geçti" / no ETA

export async function getVehiclesByLine(line: string, now = Date.now()): Promise<AnkaraVehicle[]> {
  if (mock()) return mockVehicles(line, now)
  return parseVehicles(await call({ FNC: 'Otobus', HAT: line }), line, now)
}

export async function getStopBoard(stopNo: string, now = Date.now()): Promise<AnkaraStopBoard> {
  if (mock()) return { arrivals: mockArrivals(stopNo, now), lines: mockLines() }
  const json = await call({ FNC: 'Otobusler', DURAK: stopNo })
  const arrivals = parseArrivals(json, now)
  return { arrivals, lines: parseLineStatus(json, new Set(arrivals.map((a) => a.line))) }
}

async function call(params: Record<string, string>): Promise<string> {
  const q = new URLSearchParams({ VER: '3.1.0', LAN: 'tr', ...params })
  const r = await fetch(`${BASE}?${q}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`EGO HTTP ${r.status}`)
  return r.text()
}

// ---- parsing (pure) -------------------------------------------------------

type Row = Record<string, unknown>

function rows(json: string): Row[] {
  const d = JSON.parse(json) as { status?: string; message?: string; table?: unknown }
  if (String(d.status ?? 'TRUE').toUpperCase() === 'FALSE') throw new Error(`EGO: ${d.message ?? 'status FALSE'}`)
  return Array.isArray(d.table) ? (d.table as Row[]) : []
}

const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '')

function num(v: unknown): number | null {
  const s = str(v).replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** "06 HO  1327-" -> "06 HO 1327" */
export function normalizePlate(v: unknown): string | null {
  const s = str(v).toUpperCase().replace(/[\s-]+$/, '').replace(/\s+/g, ' ').trim()
  return s && s !== '-' ? s : null
}

/** "Körüklü‚ Engelli" (EGO uses U+201A as separator) -> ["Körüklü", "Engelli"] */
export function parseFeatures(v: unknown): string[] {
  return str(v)
    .split(/[,\u201A;]/)
    .map((x) => x.trim())
    .filter((x) => x && x !== '-')
}

/** "26.09.2026 22:04:21" is Ankara time (UTC+3, no DST). */
export function ankaraToIso(s: string): string | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+03:00`).toISOString()
}

const inAnkara = (lat: number, lon: number) => lat >= 39.3 && lat <= 40.6 && lon >= 31.8 && lon <= 33.8

const lineOf = (r: Row) => str(r.hat_kisa_kod) || str(r.hat_no) || str(r.hat_kod)

/** Scheduled-only rows have arac_no "-" and no GPS. */
const isLive = (r: Row) => {
  const id = str(r.arac_no)
  return id !== '' && id !== '-' && num(r.lat) !== null
}

function fresh(r: Row, now: number): string | null {
  const at = ankaraToIso(str(r.konum_tarihi))
  if (!at || now - Date.parse(at) > MAX_AGE_MS) return null
  return at
}

export function parseVehicles(json: string, line: string, now: number): AnkaraVehicle[] {
  const out: AnkaraVehicle[] = []
  const seen = new Set<string>()
  for (const r of rows(json)) {
    if (!isLive(r)) continue
    const lat = num(r.lat)!
    const lon = num(r.lng)
    if (lon === null || !inAnkara(lat, lon)) continue
    const at = fresh(r, now)
    if (!at) continue
    const id = str(r.arac_no)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      line: lineOf(r) || line,
      lat,
      lon,
      speed: num(r.hiz),
      heading: num(r.aci),
      plate: normalizePlate(r.plaka_no),
      features: parseFeatures(r.detay),
      updatedAt: at,
      stop: str(r.durak_no) || null,
    })
  }
  return out
}

export function parseArrivals(json: string, now: number): AnkaraArrival[] {
  const out: AnkaraArrival[] = []
  for (const r of rows(json)) {
    if (!isLive(r) || !fresh(r, now) || !inAnkara(num(r.lat)!, num(r.lng) ?? 0)) continue
    const eta = num(r.saniye)
    if (eta === null || eta >= PASSED || /geçti/i.test(str(r.sure))) continue
    const busSeq = num(r.durak_sira_no)
    const stopSeq = num(r.secili_durak_sira_no)
    const away = busSeq !== null && stopSeq !== null ? stopSeq - busSeq : null
    if (away !== null && away < 0) continue
    out.push({
      line: lineOf(r),
      lineName: str(r.hat_ad),
      plate: normalizePlate(r.plaka_no),
      features: parseFeatures(r.detay),
      speed: num(r.hiz),
      etaSeconds: Math.max(0, Math.round(eta)),
      stopsAway: away,
    })
  }
  return out.sort((a, b) => a.etaSeconds - b.etaSeconds)
}

/**
 * Scheduled-only rows ("arac_no": "-") of lines with no live bus coming:
 * "Sonraki Hareket Saati İlk Duraktan\n24:30 / 33 dk Sonra" or "Hattın Bugün İçin Başka Servisi Yok".
 */
export function parseLineStatus(json: string, live: Set<string>): AnkaraLineStatus[] {
  const out = new Map<string, AnkaraLineStatus>()
  for (const r of rows(json)) {
    const line = lineOf(r)
    if (!line || live.has(line) || out.has(line) || isLive(r)) continue
    const sure = str(r.sure)
    // "15:25 / 29 dk Sonra", "23:35 / 8 sa 39 dk Sonra", "06:10 / 2 sa Sonra"
    const m = sure.match(/(\d{1,2}):(\d{2})\s*\/\s*(?:(\d+)\s*sa)?\s*(?:(\d+)\s*dk)?/i)
    const hasIn = !!m && (m[3] !== undefined || m[4] !== undefined)
    const noMore = /başka servisi yok/i.test(sure)
    if (!m && !noMore) continue
    out.set(line, {
      line,
      lineName: str(r.hat_ad),
      nextStart: m ? `${m[1].padStart(2, '0')}:${m[2]}` : null,
      nextStartInMin: m && hasIn ? Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0) : null,
      noMoreToday: !m && noMore,
    })
  }
  return [...out.values()].sort((a, b) => (a.nextStartInMin ?? 1e9) - (b.nextStartInMin ?? 1e9))
}

// ---- mock data ------------------------------------------------------------

function seed(s: string): number {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

// Three buses circling around Kızılay; positions move with time.
export function mockVehicles(line: string, now: number): AnkaraVehicle[] {
  const base = seed(line)
  return [0, 1, 2].map((i) => {
    const a = ((now / 600_000 + i / 3 + (base % 100) / 100) % 1) * 2 * Math.PI
    return {
      id: `M${(base % 900) + 100}-${i}`,
      line,
      lat: 39.9208 + 0.02 * Math.sin(a),
      lon: 32.8541 + 0.03 * Math.cos(a),
      speed: 15 + ((base + i * 7) % 30),
      heading: (i * 120 + (base % 360)) % 360,
      plate: `06 MK ${1000 + ((base + i) % 9000)}`,
      features: i === 0 ? ['Körüklü', 'Engelli'] : ['Engelli'],
      updatedAt: new Date(now - 5_000).toISOString(),
      stop: null,
    }
  })
}

export function mockLines(): AnkaraLineStatus[] {
  return [
    { line: '185-6', lineName: 'MOCK HAT 185-6', nextStart: '24:30', nextStartInMin: 33, noMoreToday: false },
    { line: '173-2', lineName: 'MOCK HAT 173-2', nextStart: null, nextStartInMin: null, noMoreToday: true },
  ]
}

export function mockArrivals(stopNo: string, now: number): AnkaraArrival[] {
  const base = seed(stopNo)
  const lines = ['185-7', '391', '114-7']
  const minute = Math.floor(now / 60_000)
  return lines
    .map((line, i) => ({
      line,
      lineName: `MOCK HAT ${line}`,
      plate: `06 MK ${1000 + ((base + i) % 9000)}`,
      features: ['Engelli'],
      speed: 20 + i * 5,
      etaSeconds: ((base >>> (i * 4)) % 20) * 60 + ((60 - (now / 1000) % 60) | 0) - (minute % 3) * 30 + 60,
      stopsAway: ((base >>> (i * 3)) % 12) + 1,
    }))
    .map((a) => ({ ...a, etaSeconds: Math.max(0, a.etaSeconds) }))
    .sort((a, b) => a.etaSeconds - b.etaSeconds)
}
