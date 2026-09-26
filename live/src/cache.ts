// Tiny in-memory cache: fresh for `ttlMs`, then refreshed on demand. If the
// source fails, the last good value is served (marked stale) for `maxStaleMs`.
// Concurrent requests for the same key share one upstream call.

export type Cached<T> = { value: T; fetchedAt: number; stale: boolean }

type Entry<T> = { value?: T; fetchedAt: number; pending?: Promise<T> }

export class Cache<T> {
  private entries = new Map<string, Entry<T>>()
  private ttlMs: number
  private maxStaleMs: number
  private maxEntries: number
  private now: () => number

  constructor(ttlMs: number, maxStaleMs: number, maxEntries = 2000, now: () => number = Date.now) {
    this.ttlMs = ttlMs
    this.maxStaleMs = maxStaleMs
    this.maxEntries = maxEntries
    this.now = now
  }

  async get(key: string, load: () => Promise<T>): Promise<Cached<T>> {
    const e = this.entries.get(key)
    const t = this.now()
    if (e?.value !== undefined && t - e.fetchedAt < this.ttlMs) return { value: e.value, fetchedAt: e.fetchedAt, stale: false }
    const entry: Entry<T> = e ?? { fetchedAt: 0 }
    if (!e) this.remember(key, entry)
    if (!entry.pending) {
      entry.pending = load().finally(() => {
        entry.pending = undefined
      })
    }
    try {
      const value = await entry.pending
      entry.value = value
      entry.fetchedAt = this.now()
      return { value, fetchedAt: entry.fetchedAt, stale: false }
    } catch (err) {
      if (entry.value !== undefined && t - entry.fetchedAt < this.maxStaleMs) {
        return { value: entry.value, fetchedAt: entry.fetchedAt, stale: true }
      }
      throw err
    }
  }

  private remember(key: string, entry: Entry<T>) {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(key, entry)
  }
}
