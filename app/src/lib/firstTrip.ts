import type { DayType, LineDetail } from './lineDetail'

// Ankara and Istanbul are UTC+3 all year (no DST).
const TZ_MS = 3 * 3600_000
// A service day runs from 04:00 to 04:00 (night trips count to the evening before).
const DAY_START_MIN = 4 * 60

function dayType(utcDay: number): DayType {
  return utcDay === 0 ? 'sunday' : utcDay === 6 ? 'saturday' : 'weekday'
}

/**
 * Scheduled first arrival at `stopId` on the next service day(s): the line's first
 * departure plus the minutes from the first stop to this one. For "no more trips
 * today". Holidays are not modelled (EGO runs the Saturday timetable then).
 */
export function nextFirstArrival(line: LineDetail, stopId: string, now: number): number | null {
  const dir = line.directions.find((d) => d.stops.includes(stopId))
  if (!dir) return null
  const offset = dir.offsets?.[dir.stops.indexOf(stopId)] ?? 0
  const local = new Date(now + TZ_MS)
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes()
  // Midnight of today's service day, in "local as UTC" milliseconds.
  let day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - (minutes < DAY_START_MIN ? 86400_000 : 0)
  for (let i = 1; i <= 3; i++) {
    day += 86400_000
    const first = dir.first_last[dayType(new Date(day).getUTCDay())]?.[0]
    if (!first) continue
    const [h, m] = first.split(':').map(Number)
    return day + ((h * 60 + m + (offset ?? 0)) * 60_000) - TZ_MS
  }
  return null
}
