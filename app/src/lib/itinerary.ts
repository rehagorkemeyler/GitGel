import { MODE_OF_LEG, type Itinerary, type Leg } from './api'

export type Summary = {
  minutes: number
  start: Date
  end: Date
  transfers: number
  walkMinutes: number
  /** Transit legs in order, for chips. */
  rides: { name: string; mode: string; color?: string; textColor?: string }[]
  firstDeparture?: { stop: string; time: Date }
}

export function summarize(it: Itinerary): Summary {
  const rides = it.legs.filter((l) => l.mode !== 'WALK')
  const walk = it.legs.filter((l) => l.mode === 'WALK').reduce((s, l) => s + l.duration, 0)
  return {
    minutes: Math.round(it.duration / 60),
    start: new Date(it.startTime),
    end: new Date(it.endTime),
    transfers: Math.max(0, rides.length - 1),
    walkMinutes: Math.round(walk / 60),
    // A stay-seated change to the same line number is one chip.
    rides: rides
      .map((l) => ({
        name: l.routeShortName || MODE_OF_LEG[l.mode] || l.mode,
        mode: MODE_OF_LEG[l.mode] ?? 'bus',
        color: l.routeColor,
        textColor: l.routeTextColor,
      }))
      .filter((r, i, all) => i === 0 || all[i - 1].name !== r.name),
    firstDeparture: rides[0] ? { stop: rides[0].from.name, time: new Date(rides[0].startTime) } : undefined,
  }
}

const key = (it: Itinerary) => it.legs.filter((l: Leg) => l.mode !== 'WALK').map((l) => l.routeShortName ?? l.mode).join('>')

// Options leaving much later than the first one are not shown (a 27-minute trip in two hours
// is not a better answer at 01:00 than a 48-minute trip now).
const LATER_MAX_MS = 45 * 60_000

/**
 * Keep up to 3 genuinely different options, fastest first: the same line sequence
 * counts once (the earliest arrival), and trips leaving much later than the
 * earliest one are dropped.
 */
export function pickOptions(its: Itinerary[], max = 3): Itinerary[] {
  const best = new Map<string, Itinerary>()
  for (const it of its) {
    const k = key(it)
    const cur = best.get(k)
    if (!cur || it.endTime < cur.endTime) best.set(k, it)
  }
  const all = [...best.values()]
  const first = Math.min(...all.map((it) => Date.parse(it.startTime)))
  return all
    .filter((it) => Date.parse(it.startTime) - first <= LATER_MAX_MS)
    .sort((a, b) => a.duration - b.duration || a.endTime.localeCompare(b.endTime))
    .slice(0, max)
}

export function hhmm(d: Date): string {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
}
