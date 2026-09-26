// Ankara (EGO) live data provider.
//
// This file is the only place that knows where Ankara live data comes from.
// The rest of GitGel (server routes, cache, app) only relies on the two
// functions and the two types below. See docs/ankara-live-provider.md.
//
// Until a real source is implemented, the functions throw NotImplemented and
// the app falls back to schedule-based data ("tarifeye göre"). Set
// EGO_MOCK=1 to get deterministic fake data for development and demos.

export type AnkaraVehicle = {
  id: string // vehicle or door number, stable per bus
  line: string // EGO line code, e.g. "185-7"
  lat: number
  lon: number
  speed: number | null // km/h
  plate: string | null // e.g. "06 HO 1327"
  updatedAt: string // ISO time of the position fix
}

export type AnkaraArrival = {
  line: string
  lineName: string
  plate: string | null
  etaSeconds: number // 0 means "at the stop now"
  stopsAway: number | null // stops between the bus and this stop
}

export class NotImplemented extends Error {
  constructor() {
    super('Ankara live provider is not implemented')
  }
}

const mock = () => process.env.EGO_MOCK === '1'

export async function getVehiclesByLine(line: string, now = Date.now()): Promise<AnkaraVehicle[]> {
  if (mock()) return mockVehicles(line, now)
  throw new NotImplemented()
}

export async function getArrivalsByStop(stopNo: string, now = Date.now()): Promise<AnkaraArrival[]> {
  if (mock()) return mockArrivals(stopNo, now)
  throw new NotImplemented()
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
      plate: `06 MK ${1000 + ((base + i) % 9000)}`,
      updatedAt: new Date(now - 5_000).toISOString(),
    }
  })
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
      etaSeconds: ((base >> (i * 4)) % 20) * 60 + ((60 - (now / 1000) % 60) | 0) - (minute % 3) * 30 + 60,
      stopsAway: ((base >> (i * 3)) % 12) + 1,
    }))
    .map((a) => ({ ...a, etaSeconds: Math.max(0, a.etaSeconds) }))
    .sort((a, b) => a.etaSeconds - b.etaSeconds)
}
