import { DATA_BASE } from './config'
import { CITY } from './city'
import type { IndexRow, Mode } from './search'

export type Line = {
  id: string
  name: string
  long_name: string
  mode: Mode
  color: string
  text_color: string
  agency: string
}

/** `code`: the operator's own stop number when it differs from the id (Istanbul: İETT's durak kodu). */
export type StopRow = { id: string; name: string; lat: number; lon: number; mode: Mode; lines: string[]; code?: string }

const cache = new Map<string, Promise<unknown>>()

/** Fetch a nightly JSON file once per session (the service worker keeps the last good copy). */
export function loadJson<T>(name: string): Promise<T> {
  let p = cache.get(name) as Promise<T> | undefined
  if (!p) {
    p = fetch(DATA_BASE + CITY.dataDir + name).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
      return r.json() as Promise<T>
    })
    p.catch(() => cache.delete(name))
    cache.set(name, p)
  }
  return p
}

/**
 * Is the network reachable? Native latestBuild: meta.json with an 8 s timeout. A unique URL has no
 * cache entry, so the service worker has to go to the network for it; a cached copy cannot answer.
 */
export async function networkUp(timeoutMs = 8000): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(`${DATA_BASE}${CITY.dataDir}meta.json?probe=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal })
    return r.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export const loadSearchIndex = () => loadJson<IndexRow[]>('search.json')
export const loadLines = () => loadJson<Line[]>('lines.json')
export const loadStops = () => loadJson<StopRow[]>('stops.json')

/** Line colour by short name, for chips. Rail colours are official (Metro İstanbul API). */
export async function lineColors(): Promise<Map<string, Line>> {
  const lines = await loadLines()
  const m = new Map<string, Line>()
  for (const l of lines) if (!m.has(l.name)) m.set(l.name, l)
  return m
}
