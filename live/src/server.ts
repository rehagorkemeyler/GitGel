// GitGel live service. Small, dependency-free HTTP server behind Cloudflare.
//
//   GET /live/vehicles?line=500T  İETT buses on one line (GPS, "live")
//   GET /live/status              Metro İstanbul line problems + announcements
//   GET /live/calibration         Bus stop-to-stop times measured from GPS (for the nightly ETL)
//   GET /live/ankara/vehicles?line=185-7  Ankara buses on one line
//   GET /live/ankara/arrivals?stop=11654  upcoming buses at one Ankara stop + other lines' next trips
//   GET /live/ankara/calibration  Ankara bus stop-to-stop times measured from EGO positions (nightly ETL)
//   GET /live/places/autocomplete?q=moda&session=<uuid>&lat=&lon=  Google Places (capped, see places.ts)
//   GET /live/places/details?id=<placeId>&session=<uuid>
//   GET /live/search?q=popeyes&city=ankara&lat=39.87&lon=32.86  places and addresses (Photon), nearest first
//   GET /live/health
//
// Every response is cached in memory and briefly by Cloudflare. When a source
// is down the last good answer is returned with "stale": true.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Cache } from './cache.ts'
import { Calibration, Sampler } from './calibration.ts'
import { fetchLineVehicles, type Vehicle } from './iett.ts'
import { getStopBoard, getVehiclesByLine, NotImplemented, type AnkaraStopBoard, type AnkaraVehicle } from './providers/ego.ts'
import { CITIES, search, type SearchResult } from './search.ts'
import { LimitReached, NotConfigured, Places } from './places.ts'
import { fetchAnnouncements, fetchStatus, type Announcement, type LineStatus } from './metro.ts'

const PORT = Number(process.env.PORT ?? 8081)

const CAL_FILE = process.env.CAL_FILE ?? '/data/calibration.json'
const LINES_URL = process.env.LINES_URL ?? 'https://rehagorkemeyler.github.io/GitGel/data/lines.json'
const ANKARA_CAL_FILE = process.env.ANKARA_CAL_FILE ?? '/data/calibration-ankara.json'
const ANKARA_LINES_URL = process.env.ANKARA_LINES_URL ?? 'https://rehagorkemeyler.github.io/GitGel/data/ankara/lines.json'

const vehicles = new Cache<Vehicle[]>(15_000, 10 * 60_000)
const calibration = new Calibration()

// Every İETT answer, whether the app or the sampler asked, also feeds the calibration.
const loadVehicles = (line: string) => () =>
  fetchLineVehicles(line).then((v) => {
    calibration.observe(v)
    return v
  })

const ankaraVehicles = new Cache<AnkaraVehicle[]>(10_000, 5 * 60_000)
const ankaraCalibration = new Calibration()

// Every EGO answer also feeds the Ankara calibration (a line code is one direction in Ankara).
const loadAnkaraVehicles = (line: string) => () =>
  getVehiclesByLine(line).then((v) => {
    ankaraCalibration.observe(
      v.filter((x) => x.stop).map((x) => ({ id: x.id, line: x.line, pattern: x.line, nearStop: x.stop!, at: x.updatedAt })),
    )
    return v
  })
const ankaraArrivals = new Cache<AnkaraStopBoard>(10_000, 2 * 60_000)
const searches = new Cache<SearchResult[]>(5 * 60_000, 60 * 60_000)
const places = new Places({ key: process.env.PLACES_API_KEY ?? '', file: process.env.PLACES_FILE ?? '/data/places.json' })

/** The client's address: Cloudflare, then the first proxy hop, then the socket. */
function clientIp(req: IncomingMessage): string {
  const cf = req.headers['cf-connecting-ip']
  if (typeof cf === 'string' && cf) return cf
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim()
  return req.socket.remoteAddress ?? '?'
}

const SESSION = /^[A-Za-z0-9-]{8,64}$/
const status = new Cache<{ lines: LineStatus[]; announcements: Announcement[] }>(60_000, 6 * 3600_000)

function send(res: ServerResponse, code: number, body: unknown, maxAge = 0) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
  })
  res.end(JSON.stringify(body))
}

export async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x')
  // Accept "/live/x" and "/x": a proxy may or may not strip the /live mount (Tailscale Funnel does).
  const path = '/live' + url.pathname.replace(/\/+$/, '').replace(/^\/live(?=\/|$)/, '')
  if (req.method === 'OPTIONS') return send(res, 204, null)
  if (req.method !== 'GET') return send(res, 405, { error: 'method' })
  try {
    if (path === '/live/health') return send(res, 200, { ok: true })
    if (path === '/live/vehicles') {
      const line = (url.searchParams.get('line') ?? '').trim().toUpperCase()
      if (!/^[0-9A-ZÇĞİÖŞÜ-]{1,10}$/.test(line)) return send(res, 400, { error: 'line' })
      const c = await vehicles.get(line, loadVehicles(line))
      return send(res, 200, { line, vehicles: c.value, fetchedAt: new Date(c.fetchedAt).toISOString(), stale: c.stale }, 10)
    }
    if (path === '/live/ankara/vehicles') {
      const line = (url.searchParams.get('line') ?? '').trim().toUpperCase()
      if (!/^[0-9A-ZÇĞİÖŞÜ-]{1,10}$/.test(line)) return send(res, 400, { error: 'line' })
      const c = await ankaraVehicles.get(line, loadAnkaraVehicles(line))
      return send(res, 200, { line, vehicles: c.value, fetchedAt: new Date(c.fetchedAt).toISOString(), stale: c.stale }, 5)
    }
    if (path === '/live/ankara/arrivals') {
      const stop = (url.searchParams.get('stop') ?? '').trim()
      if (!/^[0-9]{3,6}$/.test(stop)) return send(res, 400, { error: 'stop' })
      const c = await ankaraArrivals.get(stop, () => getStopBoard(stop))
      return send(res, 200, { stop, ...c.value, fetchedAt: new Date(c.fetchedAt).toISOString(), stale: c.stale }, 5)
    }
    if (path === '/live/places/autocomplete' || path === '/live/places/details') {
      const session = url.searchParams.get('session') ?? ''
      if (!SESSION.test(session)) return send(res, 400, { error: 'session' })
      try {
        if (path === '/live/places/autocomplete') {
          const q = (url.searchParams.get('q') ?? '').trim()
          if (q.length < 3 || q.length > 100) return send(res, 400, { error: 'q' })
          const lat = Number(url.searchParams.get('lat'))
          const lon = Number(url.searchParams.get('lon'))
          const near: [number, number] | undefined =
            Number.isFinite(lat) && Number.isFinite(lon) && lat && lon ? [Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000] : undefined
          places.allowClient(clientIp(req))
          return send(res, 200, { results: await places.autocomplete(q, session, near) })
        }
        const id = url.searchParams.get('id') ?? ''
        if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) return send(res, 400, { error: 'id' })
        places.allowClient(clientIp(req))
        return send(res, 200, { place: await places.place(id, session) })
      } catch (e) {
        if (e instanceof LimitReached) return send(res, 429, { fallback: true })
        if (e instanceof NotConfigured) return send(res, 503, { fallback: true })
        return send(res, 503, { fallback: true }, 0)
      }
    }
    if (path === '/live/search') {
      const q = (url.searchParams.get('q') ?? '').trim()
      const city = url.searchParams.get('city') ?? ''
      if (!q || q.length > 100 || !CITIES[city]) return send(res, 400, { error: 'q/city' })
      const lat = Number(url.searchParams.get('lat'))
      const lon = Number(url.searchParams.get('lon'))
      // Position rounded to ~100 m: better cache hits, and no exact location in logs.
      const user: [number, number] | undefined =
        Number.isFinite(lat) && Number.isFinite(lon) && lat && lon ? [Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000] : undefined
      const key = `${city}|${q.toLocaleLowerCase('tr')}|${user?.join(',') ?? ''}`
      const c = await searches.get(key, () => search(q, city, user))
      return send(res, 200, { results: c.value }, 300)
    }
    if (path === '/live/status') {
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'tr'
      const c = await status.get(lang, async () => {
        const [lines, announcements] = await Promise.all([fetchStatus(), fetchAnnouncements(lang).catch(() => [])])
        return { lines, announcements }
      })
      return send(res, 200, { ...c.value, fetchedAt: new Date(c.fetchedAt).toISOString(), stale: c.stale }, 30)
    }
    if (path === '/live/calibration') {
      return send(res, 200, { generatedAt: new Date().toISOString(), rows: calibration.summary() }, 600)
    }
    if (path === '/live/ankara/calibration') {
      return send(res, 200, { generatedAt: new Date().toISOString(), rows: ankaraCalibration.summary() }, 600)
    }
    return send(res, 404, { error: 'not found' })
  } catch (e) {
    if (e instanceof NotImplemented) return send(res, 501, { error: 'not implemented' }, 60)
    // Calm, generic message; the app shows its own text.
    return send(res, 503, { error: 'source unavailable' }, 5)
  }
}

async function loadLines(sampler: Sampler, url = LINES_URL) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    const lines = (await r.json()) as { name: string; mode: string }[]
    sampler.setLines(lines.filter((l) => l.mode === 'bus' || l.mode === 'metrobus').map((l) => l.name))
  } catch {
    // Pages unreachable: keep the current list and try again tomorrow.
  }
}

/** Poll one sampled line every 5 s, rotating batches through all bus lines of a city. */
function sample(sampler: Sampler, poll: (line: string) => void) {
  let i = 0
  setInterval(() => {
    const batch = sampler.current()
    if (batch.length) poll(batch[i++ % batch.length])
  }, 5_000)
}

function startCalibration() {
  calibration.load(CAL_FILE)
  ankaraCalibration.load(ANKARA_CAL_FILE)
  // Istanbul (İETT) and Ankara (EGO): one request every 5 s to each; with 12 lines per
  // batch each line is polled about once a minute.
  const sampler = new Sampler()
  const ankaraSampler = new Sampler()
  const refresh = () => {
    void loadLines(sampler)
    void loadLines(ankaraSampler, ANKARA_LINES_URL)
  }
  refresh()
  setInterval(refresh, 24 * 3600_000)
  sample(sampler, (line) => void vehicles.get(line, loadVehicles(line)).catch(() => {}))
  sample(ankaraSampler, (line) => void ankaraVehicles.get(line, loadAnkaraVehicles(line)).catch(() => {}))
  const save = () => {
    try {
      calibration.save(CAL_FILE)
      ankaraCalibration.save(ANKARA_CAL_FILE)
    } catch (e) {
      console.error('calibration save failed', e)
    }
  }
  setInterval(save, 10 * 60_000)
  process.on('SIGTERM', () => {
    save()
    process.exit(0)
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.CALIBRATE !== '0') startCalibration()
  createServer(handle).listen(PORT, () => console.log(`live listening on :${PORT}`))
}
