import { useEffect, useState } from 'react'
import { LIVE_BASE } from './config'

export type Vehicle = { id: string; lat: number; lon: number; line: string; headsign: string; at: string }
export type LineStatus = { line: string; message: string; updated: string }
export type Announcement = { title: string; text: string; lines: string[] }
export type Status = { lines: LineStatus[]; announcements: Announcement[]; stale: boolean }

async function get<T>(path: string): Promise<T> {
  const r = await fetch(LIVE_BASE + path, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() as Promise<T>
}

const POLL_MS = 15_000

/** Live İETT vehicles of the given lines, refreshed every 15 s while the page is visible. */
export function useLiveVehicles(lines: string[]): Vehicle[] {
  const [state, setState] = useState<{ key: string; vehicles: Vehicle[] }>({ key: '', vehicles: [] })
  const key = [...new Set(lines)].sort().join(',')
  useEffect(() => {
    if (!LIVE_BASE || !key) return
    let alive = true
    const load = async () => {
      if (document.hidden) return
      const all = await Promise.all(
        key.split(',').map((l) =>
          get<{ vehicles: Vehicle[] }>(`/live/vehicles?line=${encodeURIComponent(l)}`).then(
            (r) => r.vehicles,
            () => [] as Vehicle[],
          ),
        ),
      )
      if (alive) setState({ key, vehicles: all.flat() })
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [key])
  return state.key === key && key ? state.vehicles : NONE
}

const NONE: Vehicle[] = []

let statusPromise: Promise<Status> | null = null

/** Metro İstanbul line problems. Cached for the session; null when unavailable. */
export function useLineStatus(): Status | null {
  const [status, setStatus] = useState<Status | null>(null)
  useEffect(() => {
    if (!LIVE_BASE) return
    statusPromise ??= get<Status>('/live/status')
    statusPromise.then(setStatus, () => {
      statusPromise = null
    })
  }, [])
  return status
}
