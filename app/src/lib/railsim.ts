import type { TripSegment } from './api'
import { decodePolyline } from './polyline'

// Schedule-based train positions: a train between two stops is placed along
// the track in proportion to elapsed time. Shown as hollow dots labelled
// "tarifeye göre", never as live.

export const RAIL_MODES = new Set(['SUBWAY', 'METRO', 'TRAM', 'REGIONAL_RAIL', 'SUBURBAN', 'RAIL', 'FUNICULAR', 'AERIAL_LIFT', 'AREAL_LIFT'])

export type SimSegment = {
  id: string
  from: string
  to: string
  line: string
  color: string
  dep: number
  arr: number
  pts: [number, number][]
  cum: number[] // cumulative distance (degrees, good enough for interpolation)
}

export function prepare(segments: TripSegment[], hiddenLines: Set<string>): SimSegment[] {
  const out: SimSegment[] = []
  for (const s of segments) {
    if (!RAIL_MODES.has(s.mode)) continue
    const line = s.trips[0]?.routeShortName ?? ''
    if (hiddenLines.has(line)) continue
    const pts = decodePolyline(s.polyline, 5)
    if (pts.length < 2) continue
    const cum = [0]
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0]
      const dy = pts[i][1] - pts[i - 1][1]
      cum.push(cum[i - 1] + Math.hypot(dx * Math.cos((pts[i][1] * Math.PI) / 180), dy))
    }
    out.push({
      id: s.trips[0]?.tripId ?? `${line}-${s.departure}`,
      from: s.from?.name ?? '',
      to: s.to?.name ?? '',
      line,
      color: `#${s.routeColor || '888888'}`,
      dep: Date.parse(s.departure),
      arr: Date.parse(s.arrival),
      pts,
      cum,
    })
  }
  return out
}

/** Position at time `now`, or null when the train is not on this segment. */
export function positionAt(s: SimSegment, now: number): [number, number] | null {
  if (now < s.dep || now > s.arr || s.arr <= s.dep) return null
  const target = ((now - s.dep) / (s.arr - s.dep)) * s.cum[s.cum.length - 1]
  let i = 1
  while (i < s.cum.length - 1 && s.cum[i] < target) i++
  const span = s.cum[i] - s.cum[i - 1] || 1
  const f = (target - s.cum[i - 1]) / span
  return [s.pts[i - 1][0] + (s.pts[i][0] - s.pts[i - 1][0]) * f, s.pts[i - 1][1] + (s.pts[i][1] - s.pts[i - 1][1]) * f]
}
