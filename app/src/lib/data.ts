import { DATA_BASE } from './config'
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

export type StopRow = { id: string; name: string; lat: number; lon: number; mode: Mode; lines: string[] }

const cache = new Map<string, Promise<unknown>>()

/** Fetch a nightly JSON file once per session (the service worker keeps the last good copy). */
export function loadJson<T>(name: string): Promise<T> {
  let p = cache.get(name) as Promise<T> | undefined
  if (!p) {
    p = fetch(DATA_BASE + name).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
      return r.json() as Promise<T>
    })
    p.catch(() => cache.delete(name))
    cache.set(name, p)
  }
  return p
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
