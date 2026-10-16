
import { DatabaseSync } from 'node:sqlite'
import type { Geo } from './geo.ts'

export const RETENTION_DAYS = 90
const DAY = 86400_000
const TR = 3 * 3600_000

const TYPES = new Set(['pageview', 'search', 'route', 'line', 'station', 'city'])
const ID = /^[A-Za-z0-9-]{8,64}$/

export type Incoming = {
  v?: unknown
  s?: unknown
  t?: unknown
  p?: unknown
  r?: unknown
  u?: unknown
  l?: unknown
  w?: unknown
  c?: unknown
  q?: unknown
  pl?: unknown
  f?: unknown
  to?: unknown
  ln?: unknown
  st?: unknown
}

export type Device = { device: string; model: string; os: string; browser: string }

export type Row = {
  t: number
  vid: string
  sid: string
  type: string
  ip: string
  country: string
  region: string
  city: string
  device: string
  model: string
  os: string
  browser: string
  ua: string
  lang: string
  screen: string
  app_city: string
  path: string
  ref: string
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_term: string
  utm_content: string
  q: string
  place: string
  from_name: string
  to_name: string
  line: string
}

const COLUMNS: (keyof Row)[] = [
  't', 'vid', 'sid', 'type', 'ip', 'country', 'region', 'city', 'device', 'model', 'os', 'browser', 'ua', 'lang', 'screen',
  'app_city', 'path', 'ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'q', 'place',
  'from_name', 'to_name', 'line',
]

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '')

export function parseUa(ua: string): Device {
  let os = 'Diğer'
  let model = ''
  let m: RegExpMatchArray | null
  if ((m = ua.match(/(iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/))) {
    os = `iOS ${m[2]}.${m[3]}`
    model = m[1]
  } else if ((m = ua.match(/Android (\d+(?:\.\d+)?)(?:;[^;)]*)*?; ([^;)]+?)(?: Build\/[^;)]*)?\)/))) {
    os = `Android ${m[1]}`
    model = m[2].trim() === 'K' ? '' : m[2].trim()
  } else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) os = `Android ${m[1]}`
  else if ((m = ua.match(/Windows NT (\d+\.\d+)/))) os = m[1] === '10.0' ? 'Windows 10/11' : `Windows NT ${m[1]}`
  else if ((m = ua.match(/Mac OS X (\d+)[_.](\d+)/))) os = `macOS ${m[1]}.${m[2]}`
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  const bot = /bot|crawler|spider|slurp|headless|lighthouse|preview|curl|wget|python|node-fetch/i.test(ua)
  const tablet = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
  const mobile = /Mobi|iPhone|iPod/.test(ua)
  const device = bot ? 'Bot' : tablet ? 'Tablet' : mobile ? 'Telefon' : 'Masaüstü'

  const browsers: [RegExp, string][] = [
    [/Instagram/, 'Instagram'],
    [/FBAN|FBAV/, 'Facebook'],
    [/Twitter/, 'X'],
    [/LinkedInApp/, 'LinkedIn'],
    [/TikTok|musical_ly/, 'TikTok'],
    [/WhatsApp/, 'WhatsApp'],
    [/Telegram/, 'Telegram'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/YaBrowser\/(\d+)/, 'Yandex'],
    [/Edg[AiA]?\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)|Opera/, 'Opera'],
    [/Firefox\/(\d+)|FxiOS/, 'Firefox'],
    [/CriOS\/(\d+)|Chrome\/(\d+)/, 'Chrome'],
    [/Version\/[\d.]+.*Safari/, 'Safari'],
  ]
  const browser = browsers.find(([re]) => re.test(ua))?.[1] ?? (/wv\)|; wv/.test(ua) ? 'WebView' : 'Diğer')
  return { device, model, os, browser }
}

export function toRow(e: Incoming, ip: string, ua: string, geo: Geo, now: number): Row | undefined {
  const vid = str(e.v, 64)
  const sid = str(e.s, 64)
  const type = str(e.t, 20)
  if (!ID.test(vid) || !ID.test(sid) || !TYPES.has(type)) return undefined
  const u = (e.u && typeof e.u === 'object' ? e.u : {}) as Record<string, unknown>
  const d = parseUa(ua)
  return {
    t: now,
    vid,
    sid,
    type,
    ip: str(ip, 64),
    country: geo.country ?? '',
    region: geo.region ?? '',
    city: geo.city ?? '',
    ...d,
    ua: str(ua, 400),
    lang: str(e.l, 20),
    screen: /^\d{2,5}x\d{2,5}$/.test(str(e.w, 12)) ? str(e.w, 12) : '',
    app_city: str(e.c, 20),
    path: str(e.p, 300),
    ref: str(e.r, 300),
    utm_source: str(u.source, 100),
    utm_medium: str(u.medium, 100),
    utm_campaign: str(u.campaign, 100),
    utm_term: str(u.term, 100),
    utm_content: str(u.content, 100),
    q: str(e.q, 100),
    place: str(e.pl, 150),
    from_name: str(e.f, 150),
    to_name: str(e.to, 150),
    line: str(e.ln ?? e.st, 100),
  }
}

export const dayOf = (t: number) => new Date(t + TR).toISOString().slice(0, 10)

const DIMENSIONS: Record<string, string> = {
  country: 'country',
  city: "CASE WHEN city = '' THEN '' ELSE city || CASE WHEN country <> '' THEN ' (' || country || ')' ELSE '' END END",
  device: 'device',
  model: 'model',
  os: 'os',
  browser: 'browser',
  lang: 'lang',
  screen: 'screen',
  app_city: 'app_city',
  ref: "CASE WHEN ref = '' THEN '' ELSE substr(ref, instr(ref, '//') + 2, CASE WHEN instr(substr(ref, instr(ref, '//') + 2), '/') > 0 THEN instr(substr(ref, instr(ref, '//') + 2), '/') - 1 ELSE 200 END) END",
  utm_source: 'utm_source',
  utm_medium: 'utm_medium',
  utm_campaign: 'utm_campaign',
  utm_term: 'utm_term',
  utm_content: 'utm_content',
}

export type Count = { key: string; visitors: number; events: number }

export function toCell(lat: unknown, lon: unknown): [number, number] | undefined {
  const a = Number(lat)
  const o = Number(lon)
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(a) || !Number.isFinite(o)) return undefined
  if (Math.abs(a) > 90 || Math.abs(o) > 180) return undefined
  return [Math.round(a * 1000) / 1000, Math.round(o * 1000) / 1000]
}

export class Analytics {
  readonly db: DatabaseSync

  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY,
        ${COLUMNS.map((c) => `${c} ${c === 't' ? 'INTEGER NOT NULL' : "TEXT NOT NULL DEFAULT ''"}`).join(',\n        ')}
      );
      CREATE INDEX IF NOT EXISTS events_t ON events (t);
      CREATE INDEX IF NOT EXISTS events_vid ON events (vid, t);
      CREATE TABLE IF NOT EXISTS daily (
        day TEXT PRIMARY KEY,
        visitors INTEGER NOT NULL,
        sessions INTEGER NOT NULL,
        pageviews INTEGER NOT NULL,
        searches INTEGER NOT NULL,
        routes INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cells (
        day TEXT NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        n INTEGER NOT NULL,
        PRIMARY KEY (day, lat, lon)
      );
    `)
  }

  addCell(lat: unknown, lon: unknown, now: number): boolean {
    const c = toCell(lat, lon)
    if (!c) return false
    this.db
      .prepare('INSERT INTO cells (day, lat, lon, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, lat, lon) DO UPDATE SET n = n + 1')
      .run(dayOf(now), c[0], c[1])
    return true
  }

  cells(from: number, to: number) {
    return this.db
      .prepare('SELECT lat, lon, SUM(n) AS n FROM cells WHERE day >= ? AND day <= ? GROUP BY lat, lon ORDER BY n DESC LIMIT 20000')
      .all(dayOf(from), dayOf(to)) as { lat: number; lon: number; n: number }[]
  }

  insert(r: Row) {
    this.db
      .prepare(`INSERT INTO events (${COLUMNS.join(',')}) VALUES (${COLUMNS.map(() => '?').join(',')})`)
      .run(...COLUMNS.map((c) => r[c]))
  }

  maintain(now: number) {
    const today = dayOf(now)
    const days = this.db
      .prepare(`SELECT DISTINCT date((t + ${TR}) / 1000, 'unixepoch') AS day FROM events WHERE day < ? AND day NOT IN (SELECT day FROM daily)`)
      .all(today) as { day: string }[]
    for (const { day } of days) {
      const from = Date.parse(`${day}T00:00:00Z`) - TR
      const s = this.totals(from, from + DAY)
      this.db
        .prepare('INSERT OR REPLACE INTO daily (day, visitors, sessions, pageviews, searches, routes) VALUES (?, ?, ?, ?, ?, ?)')
        .run(day, s.visitors, s.sessions, s.pageviews, s.searches, s.routes)
    }
    this.db.prepare('DELETE FROM events WHERE t < ?').run(now - RETENTION_DAYS * DAY)
  }

  totals(from: number, to: number) {
    return this.db
      .prepare(
        `SELECT COUNT(DISTINCT vid) AS visitors, COUNT(DISTINCT sid) AS sessions,
           SUM(type = 'pageview') AS pageviews, SUM(type = 'search') AS searches, SUM(type = 'route') AS routes,
           COUNT(*) AS events
         FROM events WHERE t >= ? AND t < ? AND device <> 'Bot'`,
      )
      .get(from, to) as { visitors: number; sessions: number; pageviews: number; searches: number; routes: number; events: number }
  }

  newVisitors(from: number, to: number): number {
    return (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM (SELECT vid, MIN(t) AS first FROM events GROUP BY vid) WHERE first >= ? AND first < ?`)
        .get(from, to) as { n: number }
    ).n
  }

  activeNow(now: number): number {
    return (this.db.prepare('SELECT COUNT(DISTINCT vid) AS n FROM events WHERE t >= ?').get(now - 5 * 60_000) as { n: number }).n
  }

  series(from: number, to: number, hourly: boolean) {
    const fmt = hourly ? '%Y-%m-%d %H:00' : '%Y-%m-%d'
    return this.db
      .prepare(
        `SELECT strftime('${fmt}', (t + ${TR}) / 1000, 'unixepoch') AS bucket,
           COUNT(DISTINCT vid) AS visitors, SUM(type = 'pageview') AS pageviews, SUM(type = 'route') AS routes
         FROM events WHERE t >= ? AND t < ? AND device <> 'Bot' GROUP BY bucket ORDER BY bucket`,
      )
      .all(from, to) as { bucket: string; visitors: number; pageviews: number; routes: number }[]
  }

  hours(from: number, to: number) {
    return this.db
      .prepare(
        `SELECT CAST(strftime('%H', (t + ${TR}) / 1000, 'unixepoch') AS INTEGER) AS hour, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS events
         FROM events WHERE t >= ? AND t < ? AND device <> 'Bot' GROUP BY hour ORDER BY hour`,
      )
      .all(from, to) as { hour: number; visitors: number; events: number }[]
  }

  top(dimension: string, from: number, to: number, limit = 15): Count[] {
    const expr = DIMENSIONS[dimension]
    if (!expr) throw new Error('dimension')
    return this.db
      .prepare(
        `SELECT ${expr} AS key, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS events
         FROM events WHERE t >= ? AND t < ? AND device <> 'Bot' AND type = 'pageview'
         GROUP BY key HAVING key <> '' ORDER BY visitors DESC, events DESC LIMIT ?`,
      )
      .all(from, to, limit) as Count[]
  }

  topActivity(kind: 'q' | 'place' | 'route' | 'line', from: number, to: number, limit = 20): Count[] {
    const [expr, type] = {
      q: ['lower(q)', 'search'],
      place: ['place', 'search'],
      route: ["from_name || ' → ' || to_name", 'route'],
      line: ['line', "line' OR type = 'station"],
    }[kind]
    return this.db
      .prepare(
        `SELECT ${expr} AS key, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS events
         FROM events WHERE t >= ? AND t < ? AND device <> 'Bot' AND (type = '${type}')
         GROUP BY key HAVING key <> '' AND key <> ' → ' ORDER BY events DESC LIMIT ?`,
      )
      .all(from, to, limit) as Count[]
  }

  visitors(from: number, to: number, limit = 100, search = '') {
    const like = `%${search}%`
    return this.db
      .prepare(
        `SELECT vid, MIN(t) AS first, MAX(t) AS last, COUNT(*) AS events, COUNT(DISTINCT sid) AS sessions,
           SUM(type = 'search') AS searches, SUM(type = 'route') AS routes,
           MAX(ip) AS ip, MAX(country) AS country, MAX(city) AS city, MAX(device) AS device, MAX(model) AS model,
           MAX(os) AS os, MAX(browser) AS browser, MAX(utm_source) AS utm_source, MAX(utm_campaign) AS utm_campaign,
           MAX(app_city) AS app_city
         FROM events WHERE t >= ? AND t < ? AND device <> 'Bot'
         GROUP BY vid
         HAVING ? = '' OR vid LIKE ? OR ip LIKE ? OR city LIKE ? OR model LIKE ? OR utm_source LIKE ? OR utm_campaign LIKE ?
         ORDER BY last DESC LIMIT ?`,
      )
      .all(from, to, search, like, like, like, like, like, like, limit)
  }

  visitor(vid: string, limit = 500) {
    return this.db.prepare('SELECT * FROM events WHERE vid = ? ORDER BY t DESC LIMIT ?').all(vid, limit)
  }

  recent(limit = 100, before = Number.MAX_SAFE_INTEGER) {
    return this.db
      .prepare(
        `SELECT id, t, vid, type, ip, country, city, device, model, os, browser, path, q, place, from_name, to_name, line, utm_source, app_city
         FROM events WHERE t < ? ORDER BY t DESC LIMIT ?`,
      )
      .all(before, limit)
  }

  allTime(now: number) {
    const past = this.db.prepare('SELECT * FROM daily ORDER BY day').all() as {
      day: string
      visitors: number
      sessions: number
      pageviews: number
      searches: number
      routes: number
    }[]
    const today = dayOf(now)
    const from = Date.parse(`${today}T00:00:00Z`) - TR
    const s = this.totals(from, from + DAY)
    return [...past, { day: today, visitors: s.visitors, sessions: s.sessions, pageviews: s.pageviews ?? 0, searches: s.searches ?? 0, routes: s.routes ?? 0 }]
  }
}

export class IntakeLimit {
  private counts = new Map<string, number>()
  private windowStart = 0
  private perMinute: number
  private clock: () => number

  constructor(perMinute = 120, clock = () => Date.now()) {
    this.perMinute = perMinute
    this.clock = clock
  }

  allow(ip: string): boolean {
    const now = this.clock()
    if (now - this.windowStart >= 60_000) {
      this.counts.clear()
      this.windowStart = now
    }
    const n = (this.counts.get(ip) ?? 0) + 1
    this.counts.set(ip, n)
    return n <= this.perMinute
  }
}
