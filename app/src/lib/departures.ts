import type { StopTime } from './api'

export type DepartureGroup = {
  line: string
  headsign: string
  color?: string
  textColor?: string
  times: { at: Date; live: boolean }[]
}

type StopTimeWithRoute = StopTime & { routeColor?: string; routeTextColor?: string }

/** Group a stop's next departures by line and direction, soonest group first. */
export function groupDepartures(list: StopTimeWithRoute[], perGroup = 3): DepartureGroup[] {
  const groups = new Map<string, DepartureGroup>()
  for (const d of list) {
    const at = new Date(d.place.departure ?? d.place.arrival ?? '')
    if (Number.isNaN(at.getTime())) continue
    const key = `${d.routeShortName}|${d.headsign}`
    let g = groups.get(key)
    if (!g) {
      g = { line: d.routeShortName ?? '', headsign: d.headsign ?? '', color: d.routeColor, textColor: d.routeTextColor, times: [] }
      groups.set(key, g)
    }
    if (g.times.length < perGroup) g.times.push({ at, live: !!d.realTime })
  }
  return [...groups.values()].sort((a, b) => a.times[0].at.getTime() - b.times[0].at.getTime())
}
