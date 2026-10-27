// İBB's open API answers Turkish addresses only, and our server is in Milan: it reaches İBB through a relay
// on an always-on machine in Turkey. When that is down too, the app asks İBB itself (the phone is in Turkey).
// Same requests and parsing as the live service (live/src/iett.ts and metro.ts) and the native app.
// A browser may only read İBB's answer if İBB allows other sites (CORS); when it does not, the first
// refused request turns this path off for the session, so the app does not keep knocking.
import type { Announcement, LineStatus, Vehicle } from './live'

const IBB = 'https://api.ibb.gov.tr'
const FILO = '/iett/FiloDurum/SeferGerceklesme.asmx'
const METRO = '/MetroIstanbul/api/MetroMobile/V2/'
/** Parked buses keep reporting hours-old positions: never show them as live. */
const MAX_AGE_MS = 5 * 60 * 1000

let refused = false

async function ibb(path: string, init: RequestInit = {}): Promise<Response> {
  if (refused) throw new Error('İBB: not reachable from the browser')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const r = await fetch(IBB + path, { ...init, signal: ctrl.signal }).catch((e: unknown) => {
      // A CORS refusal or a blocked network: a TypeError, the same for every later request.
      if (e instanceof TypeError) refused = true
      throw e
    })
    if (!r.ok) throw new Error(`İBB HTTP ${r.status}`)
    return r
  } finally {
    clearTimeout(timer)
  }
}

export function extractResult(xml: string, op: string): string {
  const m = xml.match(new RegExp(`<${op}Result>([\\s\\S]*)</${op}Result>`))
  if (!m) throw new Error(`${op}: no result in response`)
  return m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

/** "2026-09-26 03:52:52" is Istanbul time (UTC+3, no DST). */
export function istanbulToIso(s: string): string {
  return new Date(s.replace(' ', 'T') + '+03:00').toISOString()
}

type RawVehicle = { kapino: string; enlem: string; boylam: string; hatkodu: string; yon: string; son_konum_zamani: string }

export function parseVehicles(json: string, now: number): Vehicle[] {
  const out: Vehicle[] = []
  for (const r of JSON.parse(json) as RawVehicle[]) {
    const lat = Number(r.enlem)
    const lon = Number(r.boylam)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue
    const at = istanbulToIso(r.son_konum_zamani)
    if (now - Date.parse(at) > MAX_AGE_MS) continue
    out.push({ id: r.kapino, lat, lon, line: r.hatkodu, headsign: r.yon, at })
  }
  return out
}

/** İETT buses on one line, straight from İBB. */
export async function directLineVehicles(line: string): Promise<Vehicle[]> {
  const op = 'GetHatOtoKonum_json'
  const safe = line.replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü-]/g, '')
  const body = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${op} xmlns="http://tempuri.org/"><HatKodu>${safe}</HatKodu></${op}></soap:Body></soap:Envelope>`
  const r = await ibb(FILO, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"http://tempuri.org/${op}"` },
    body,
  })
  return parseVehicles(extractResult(await r.text(), op), Date.now())
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', Ccedil: 'Ç',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…',
}

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTITIES[n] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Line codes mentioned in a text ("M7 Yıldız–Mahmutbey ..." -> ["M7"]). */
export function linesIn(text: string): string[] {
  return [...new Set(text.match(/\b(?:M\d{1,2}[AB]?|T\d|F\d|TF\d)\b/g) ?? [])]
}

async function metro<T>(endpoint: string): Promise<T> {
  const r = await ibb(METRO + endpoint, { headers: { Accept: 'application/json' } })
  const d = (await r.json()) as { Success: boolean; Data: T }
  if (!d.Success) throw new Error('Metro İstanbul: Success=false')
  return d.Data
}

type RawStatus = { LineName: string; Description: string; UpdateDate: string; IsActive?: boolean }
type RawAnnouncement = { Title?: string; Content?: string }

/** Metro İstanbul line problems and announcements, straight from İBB. */
export async function directStatus(lang: 'tr' | 'en'): Promise<{ lines: LineStatus[]; announcements: Announcement[] }> {
  const [raw, ann] = await Promise.all([metro<RawStatus[]>('GetServiceStatuses'), metro<RawAnnouncement[]>(`GetAnnouncements/${lang}`).catch(() => [])])
  const lines = raw
    .filter((s) => s.IsActive !== false)
    .map((s) => ({ line: s.LineName, message: stripHtml(s.Description ?? ''), updated: s.UpdateDate }))
  const announcements = ann.map((a) => {
    const title = stripHtml(a.Title ?? '')
    return { title, text: stripHtml(a.Content ?? ''), lines: linesIn(title) }
  })
  return { lines, announcements }
}
