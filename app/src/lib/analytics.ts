import { CITY } from './city'
import { LIVE_BASE } from './config'


const VID_KEY = 'gitgel.vid'
const SID_KEY = 'gitgel.sid'
const CELL_KEY = 'gitgel.cell'
const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const

export type EventType = 'pageview' | 'search' | 'route' | 'line' | 'station'
export type EventData = { q?: string; pl?: string; f?: string; to?: string; ln?: string; st?: string }

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function stored(storage: () => Storage, key: string): string {
  try {
    const s = storage()
    let id = s.getItem(key)
    if (!id) {
      id = newId()
      s.setItem(key, id)
    }
    return id
  } catch {
    return newId()
  }
}

export function utmOf(search: string): Record<string, string> | undefined {
  const p = new URLSearchParams(search)
  const out: Record<string, string> = {}
  for (const k of UTM_KEYS) {
    const v = p.get(`utm_${k}`)
    if (v) out[k] = v.slice(0, 100)
  }
  return Object.keys(out).length ? out : undefined
}

function send(body: string): void {
  const url = `${LIVE_BASE.replace(/\/+$/, '')}/live/e`
  const blob = new Blob([body], { type: 'text/plain' })
  if (!navigator.sendBeacon?.(url, blob)) void fetch(url, { method: 'POST', body: blob, keepalive: true, mode: 'no-cors' }).catch(() => {})
}

export function cellOf(lat: number, lon: number): [number, number] {
  return [Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000]
}

export function trackCell(lat: number, lon: number): void {
  if (!LIVE_BASE || typeof window === 'undefined' || !Number.isFinite(lat) || !Number.isFinite(lon)) return
  try {
    if (sessionStorage.getItem(CELL_KEY)) return
    sessionStorage.setItem(CELL_KEY, '1')
    const [la, lo] = cellOf(lat, lon)
    send(JSON.stringify({ t: 'cell', la, lo }))
  } catch {
  }
}

export function track(type: EventType, data: EventData = {}): void {
  if (!LIVE_BASE || typeof window === 'undefined') return
  try {
    const body = JSON.stringify({
      v: stored(() => localStorage, VID_KEY),
      s: stored(() => sessionStorage, SID_KEY),
      t: type,
      p: location.pathname + location.search,
      r: type === 'pageview' ? document.referrer : undefined,
      u: type === 'pageview' ? utmOf(location.search) : undefined,
      l: navigator.language,
      w: `${screen.width}x${screen.height}`,
      c: CITY.id,
      ...data,
    })
    send(body)
  } catch {
  }
}
