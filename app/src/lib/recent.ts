import type { Place } from './search'

// Recent searches live only on this phone (localStorage), never on a server.
const KEY = 'gitgel.recent'
const MAX = 8

export function recentPlaces(): Place[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function rememberPlace(p: Place): void {
  if (p.kind === 'me') return
  try {
    const list = [p, ...recentPlaces().filter((x) => !(x.name === p.name && Math.abs(x.lat - p.lat) < 1e-4))]
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    // Storage full or disabled: recents are a convenience, ignore.
  }
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
