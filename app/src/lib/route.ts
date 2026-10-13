import type { Itinerary, Leg, LegPlace } from './api'
import { distanceM } from './geo'

export type ChainItem = { kind: 'walk'; minutes: number } | { kind: 'ride'; name: string; color?: string; textColor?: string; mode: string }

const MIN_WALK_S = 60

/** "4 dk yürü › M2 › Marmaray › 7 dk yürü": walks shorter than a minute are left out. */
export function chain(it: Itinerary): ChainItem[] {
  const out: ChainItem[] = []
  for (const l of it.legs) {
    if (l.mode === 'WALK') {
      if (l.duration >= MIN_WALK_S) out.push({ kind: 'walk', minutes: Math.round(l.duration / 60) })
      continue
    }
    const name = l.routeShortName || l.mode
    const prev = out[out.length - 1]
    // A stay-seated change to the same line number is one chip.
    if (prev?.kind === 'ride' && prev.name === name) continue
    out.push({ kind: 'ride', name, color: l.routeColor, textColor: l.routeTextColor, mode: l.mode })
  }
  return out
}

export function firstRide(it: Itinerary): Leg | undefined {
  return it.legs.find((l) => l.mode !== 'WALK')
}

/** Minutes until the user must leave (walk to the first boarding included), never negative. */
export function leaveInMinutes(it: Itinerary, now: number): number {
  return Math.max(0, Math.floor((Date.parse(it.startTime) - now) / 60000))
}

/** Typical gap between departures, in whole minutes; null with fewer than two times. */
export function headwayMinutes(times: Date[]): number | null {
  if (times.length < 2) return null
  const gaps = times
    .slice(1)
    .map((t, i) => (t.getTime() - times[i].getTime()) / 60000)
    .filter((g) => g > 0)
    .sort((a, b) => a - b)
  if (!gaps.length) return null
  return Math.round(gaps[Math.floor(gaps.length / 2)])
}

export type TrackState = {
  /** Index of the leg the user is on (or walking to). */
  leg: number
  /** On a ride and the next stop is where to get off. */
  getOffNext: boolean
  arrived: boolean
}

const NEAR_M = 250

function near(pos: { lat: number; lon: number }, p: LegPlace, m = NEAR_M): boolean {
  return distanceM(pos.lat, pos.lon, p.lat, p.lon) <= m
}

/**
 * Where the user is on the trip. Uses position when there is one (a ride counts
 * as current from boarding until near its alighting stop), otherwise the timetable.
 */
export function trackState(it: Itinerary, pos: { lat: number; lon: number } | null, now: number): TrackState {
  const legs = it.legs
  const last = legs[legs.length - 1]
  if (pos && near(pos, last.to, 60)) return { leg: legs.length - 1, getOffNext: false, arrived: true }
  // Timetable guess: the leg whose time window contains now.
  let leg = legs.findIndex((l) => now < Date.parse(l.endTime))
  if (leg < 0) leg = legs.length - 1
  if (pos) {
    // Position beats the clock: the last leg whose start point we have reached.
    for (let i = legs.length - 1; i >= 0; i--) {
      if (near(pos, legs[i].from)) {
        leg = i
        break
      }
    }
    // Past the end of a ride (near where it ends): move on.
    const cur = legs[leg]
    if (cur && near(pos, cur.to, 120) && leg < legs.length - 1) leg++
  }
  const cur = legs[leg]
  let getOffNext = false
  // Not on board yet: nothing to get off.
  if (cur && cur.mode !== 'WALK' && now >= Date.parse(cur.startTime) - 30_000) {
    const stops = cur.intermediateStops ?? []
    const before = stops[stops.length - 1]
    if (before) {
      getOffNext = pos ? near(pos, before, 300) || distanceM(pos.lat, pos.lon, cur.to.lat, cur.to.lon) < distanceM(pos.lat, pos.lon, before.lat, before.lon) : now >= Date.parse(before.departure ?? before.arrival ?? cur.endTime)
    } else {
      getOffNext = true
    }
  }
  return { leg, getOffNext, arrived: false }
}
