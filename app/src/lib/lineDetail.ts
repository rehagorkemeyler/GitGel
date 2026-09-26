import { useEffect, useState } from 'react'
import { loadJson, loadStops, type Line, type StopRow } from './data'

export type DayType = 'weekday' | 'saturday' | 'sunday'

export type LineDirection = {
  headsign: string
  stops: string[]
  offsets?: (number | null)[]
  first_last: Partial<Record<DayType, [string, string]>>
}

export type LineDetail = Line & { directions: LineDirection[] }

export type LineView = { id: string; color: string; coords: [number, number][] }

/** Line page data: the line file plus stop names/positions. */
export function useLineDetail(id: string | null) {
  const [state, setState] = useState<{ id: string | null; line: LineDetail | null; stops: Map<string, StopRow>; error: boolean }>({
    id: null,
    line: null,
    stops: new Map(),
    error: false,
  })
  useEffect(() => {
    if (!id) return
    let alive = true
    Promise.all([loadJson<LineDetail>(`lines/${id}.json`), loadStops()]).then(
      ([line, stops]) => alive && setState({ id, line, stops: new Map(stops.map((s) => [s.id, s])), error: false }),
      () => alive && setState({ id, line: null, stops: new Map(), error: true }),
    )
    return () => {
      alive = false
    }
  }, [id])
  return state.id === id ? state : { id, line: null, stops: new Map<string, StopRow>(), error: false }
}

export function lineView(line: LineDetail | null, stops: Map<string, StopRow>, dir: number): LineView | null {
  const d = line?.directions[dir]
  if (!line || !d) return null
  const coords = d.stops.map((s) => stops.get(s)).filter((s): s is StopRow => !!s).map((s) => [s.lon, s.lat] as [number, number])
  return { id: line.id, color: line.color ? `#${line.color}` : '#0a66c2', coords }
}

/** Istanbul day type right now (service day starts at 04:00). */
export function currentDayType(now = new Date()): DayType {
  const ist = new Date(now.getTime() + 3 * 3600_000 - 4 * 3600_000)
  const wd = ist.getUTCDay()
  return wd === 6 ? 'saturday' : wd === 0 ? 'sunday' : 'weekday'
}
