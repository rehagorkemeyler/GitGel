import type { StopTime } from './api'
import type { Status } from './live'
import { hasProblem } from './status'

/**
 * Next departures under a nearby stop: lines with a reported service problem are dropped
 * (product rule: their schedule data is hidden), then the first `keep` are shown.
 */
export function nearbyDepartures(list: StopTime[], status: Status | null, keep = 3): StopTime[] {
  return list.filter((d) => !hasProblem(status, d.routeShortName ?? '')).slice(0, keep)
}

/** Whole minutes from `fromMs` until `at`, never negative (native rounding). */
export function minutesUntil(at: Date, fromMs: number): number {
  return Math.max(0, Math.round((at.getTime() - fromMs) / 60000))
}
