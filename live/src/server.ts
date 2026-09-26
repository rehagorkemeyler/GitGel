// GitGel live service. Small, dependency-free HTTP server behind Cloudflare.
//
//   GET /live/vehicles?line=500T  İETT buses on one line (GPS, "live")
//   GET /live/status              Metro İstanbul line problems + announcements
//   GET /live/health
//
// Every response is cached in memory and briefly by Cloudflare. When a source
// is down the last good answer is returned with "stale": true.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Cache } from './cache.ts'
import { fetchLineVehicles, type Vehicle } from './iett.ts'
import { fetchAnnouncements, fetchStatus, type Announcement, type LineStatus } from './metro.ts'

const PORT = Number(process.env.PORT ?? 8081)

const vehicles = new Cache<Vehicle[]>(15_000, 10 * 60_000)
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
  const path = url.pathname.replace(/\/+$/, '')
  if (req.method === 'OPTIONS') return send(res, 204, null)
  if (req.method !== 'GET') return send(res, 405, { error: 'method' })
  try {
    if (path === '/live/health') return send(res, 200, { ok: true })
    if (path === '/live/vehicles') {
      const line = (url.searchParams.get('line') ?? '').trim().toUpperCase()
      if (!/^[0-9A-ZÇĞİÖŞÜ-]{1,10}$/.test(line)) return send(res, 400, { error: 'line' })
      const c = await vehicles.get(line, () => fetchLineVehicles(line))
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
    return send(res, 404, { error: 'not found' })
  } catch {
    // Calm, generic message; the app shows its own text.
    return send(res, 503, { error: 'source unavailable' }, 5)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer(handle).listen(PORT, () => console.log(`live listening on :${PORT}`))
}
