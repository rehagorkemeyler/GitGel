// GitGel live service. Small, dependency-free HTTP server behind Cloudflare.
//
//   GET /live/vehicles?line=500T  İETT buses on one line (GPS, "live")
//   GET /live/status              Metro İstanbul line problems + announcements
//   GET /live/calibration         Bus stop-to-stop times measured from GPS (for the nightly ETL)
//   GET /live/health
//
// Every response is cached in memory and briefly by Cloudflare. When a source
// is down the last good answer is returned with "stale": true.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Cache } from './cache.ts'
import { Calibration, Sampler } from './calibration.ts'
import { fetchLineVehicles, type Vehicle } from './iett.ts'
import { fetchAnnouncements, fetchStatus, type Announcement, type LineStatus } from './metro.ts'

const PORT = Number(process.env.PORT ?? 8081)

const CAL_FILE = process.env.CAL_FILE ?? '/data/calibration.json'
const LINES_URL = process.env.LINES_URL ?? 'https://rehagorkemeyler.github.io/GitGel/data/lines.json'

const vehicles = new Cache<Vehicle[]>(15_000, 10 * 60_000)
const calibration = new Calibration()

// Every İETT answer, whether the app or the sampler asked, also feeds the calibration.
const loadVehicles = (line: string) => () =>
  fetchLineVehicles(line).then((v) => {
    calibration.observe(v)
    return v
  })
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
    return send(res, 404, { error: 'not found' })
  } catch {
    // Calm, generic message; the app shows its own text.
    return send(res, 503, { error: 'source unavailable' }, 5)
  }
}

async function loadLines(sampler: Sampler) {
  try {
    const r = await fetch(LINES_URL, { signal: AbortSignal.timeout(30_000) })
    const lines = (await r.json()) as { name: string; mode: string }[]
    sampler.setLines(lines.filter((l) => l.mode === 'bus' || l.mode === 'metrobus').map((l) => l.name))
  } catch {
    // Pages unreachable: keep the current list and try again tomorrow.
  }
}

function startCalibration() {
  calibration.load(CAL_FILE)
  const sampler = new Sampler()
  void loadLines(sampler)
  setInterval(() => void loadLines(sampler), 24 * 3600_000)
  // One request every 5 s: with 12 lines per batch each is polled about once a minute.
  let i = 0
  setInterval(() => {
    const batch = sampler.current()
    if (!batch.length) return
    const line = batch[i++ % batch.length]
    vehicles.get(line, loadVehicles(line)).catch(() => {})
  }, 5_000)
  const save = () => {
    try {
      calibration.save(CAL_FILE)
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
