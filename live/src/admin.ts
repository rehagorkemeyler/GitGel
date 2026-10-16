
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Analytics } from './analytics.ts'
import { PAGE_CSS, PAGE_HTML, PAGE_JS } from './admin-page.ts'

const DAY = 86400_000

export function allowedLogins(env = process.env.ADMIN_LOGINS ?? ''): Set<string> {
  return new Set(
    env
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function authorized(req: IncomingMessage, logins: Set<string>): boolean {
  if (!logins.size) return false
  if (req.headers['tailscale-funnel-request']) return false
  const login = req.headers['tailscale-user-login']
  return typeof login === 'string' && logins.has(login.trim().toLowerCase())
}

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self' https://unpkg.com; style-src 'self' https://unpkg.com; connect-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow',
}

function reply(res: ServerResponse, code: number, type: string, body: string) {
  res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8`, ...SECURITY_HEADERS })
  res.end(body)
}

const json = (res: ServerResponse, body: unknown) => reply(res, 200, 'application/json', JSON.stringify(body))

export function rangeOf(url: URL, now: number): [number, number] {
  const from = Number(url.searchParams.get('from'))
  const to = Number(url.searchParams.get('to'))
  if (from > 0 && to > from) return [Math.max(from, now - 90 * DAY), Math.min(to, now + 60_000)]
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 7))
  return [now - days * DAY, now + 60_000]
}

export function adminHandler(analytics: Analytics, logins = allowedLogins(), clock = () => Date.now()) {
  return (req: IncomingMessage, res: ServerResponse) => {
    if (!authorized(req, logins)) return reply(res, 403, 'text/plain', 'Forbidden')
    if (req.method !== 'GET') return reply(res, 405, 'text/plain', 'Method not allowed')
    const url = new URL(req.url ?? '/', 'http://x')
    const now = clock()
    try {
      switch (url.pathname) {
        case '/':
          return reply(res, 200, 'text/html', PAGE_HTML)
        case '/app.js':
          return reply(res, 200, 'text/javascript', PAGE_JS)
        case '/app.css':
          return reply(res, 200, 'text/css', PAGE_CSS)
        case '/api/summary': {
          const [from, to] = rangeOf(url, now)
          const hourly = to - from <= 2 * DAY + 60_000
          const dims = ['country', 'city', 'device', 'model', 'os', 'browser', 'ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'app_city', 'lang', 'screen']
          return json(res, {
            from,
            to,
            login: req.headers['tailscale-user-login'],
            activeNow: analytics.activeNow(now),
            totals: { ...analytics.totals(from, to), newVisitors: analytics.newVisitors(from, to) },
            series: analytics.series(from, to, hourly),
            hourly,
            hours: analytics.hours(from, to),
            top: Object.fromEntries(dims.map((d) => [d, analytics.top(d, from, to)])),
            activity: {
              q: analytics.topActivity('q', from, to),
              place: analytics.topActivity('place', from, to),
              route: analytics.topActivity('route', from, to),
              line: analytics.topActivity('line', from, to),
            },
          })
        }
        case '/api/visitors': {
          const [from, to] = rangeOf(url, now)
          return json(res, { visitors: analytics.visitors(from, to, 200, (url.searchParams.get('q') ?? '').slice(0, 100)) })
        }
        case '/api/visitor': {
          const vid = url.searchParams.get('vid') ?? ''
          if (!/^[A-Za-z0-9-]{8,64}$/.test(vid)) return reply(res, 400, 'text/plain', 'vid')
          return json(res, { events: analytics.visitor(vid) })
        }
        case '/api/recent': {
          const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER
          return json(res, { events: analytics.recent(100, before) })
        }
        case '/api/cells': {
          const [from, to] = rangeOf(url, now)
          return json(res, { cells: analytics.cells(from, to) })
        }
        case '/api/alltime':
          return json(res, { days: analytics.allTime(now) })
        default:
          return reply(res, 404, 'text/plain', 'Not found')
      }
    } catch (e) {
      console.error(`admin ${url.pathname} failed: ${(e as Error).message}`)
      return reply(res, 500, 'text/plain', 'Error')
    }
  }
}

export function startAdmin(analytics: Analytics, port: number) {
  const logins = allowedLogins()
  if (!logins.size) console.log('admin: ADMIN_LOGINS is empty, every request is refused')
  createServer(adminHandler(analytics, logins)).listen(port, () => console.log(`admin listening on :${port}`))
}
