import type { TripSegment } from './api'
import { decodePolyline } from './polyline'

// Schedule-based train positions, labelled "tarifeye göre", never live. The
// timetable time of a stop is the middle of a short dwell there: the train waits
// DWELL_MS at each station, pulls away, cruises and brakes inside the scheduled
// minutes between two stops. Scheduled dwells (arrival before departure) keep the
// train standing at the station.

export const RAIL_MODES = new Set(['SUBWAY', 'METRO', 'TRAM', 'REGIONAL_RAIL', 'SUBURBAN', 'RAIL', 'FUNICULAR', 'AERIAL_LIFT', 'AREAL_LIFT'])

export type SimSegment = {
  id: string
  from: string
  to: string
  line: string
  color: string
  /** Scheduled departure from `from` and arrival at `to`. */
  dep: number
  arr: number
  /** Time window this piece covers on the map. */
  t0: number
  t1: number
  /** Standing at the station at the start / end of the window (ms). */
  holdA: number
  holdB: number
  /** Standing at the end of `pts` for the whole window (a scheduled dwell). */
  still?: boolean
  pts: [number, number][]
  cum: number[] // cumulative distance (degrees, good enough for interpolation)
}

const DWELL_MS = 30_000
// A dwell never takes more than this share of a hop (short hops keep most of their time moving).
const MAX_HOLD_SHARE = 0.2
// Share of the running time spent speeding up, and again braking.
const ACCEL_SHARE = 0.25

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
      t0: Date.parse(s.departure),
      t1: Date.parse(s.arrival),
      holdA: 0,
      holdB: 0,
      pts,
      cum,
    })
  }
  return withDwells(out)
}

/** Adds the station dwells: modelled ones inside hops, scheduled ones as standing pieces. */
function withDwells(segs: SimSegment[]): SimSegment[] {
  const trips = new Map<string, SimSegment[]>()
  for (const s of segs) {
    const list = trips.get(s.id)
    if (list) list.push(s)
    else trips.set(s.id, [s])
  }
  const out: SimSegment[] = []
  for (const list of trips.values()) {
    list.sort((a, b) => a.dep - b.dep)
    list.forEach((s, i) => {
      const prev = list[i - 1]
      const next = list[i + 1]
      const cap = (s.arr - s.dep) * MAX_HOLD_SHARE
      // No modelled dwell where the timetable already has one.
      s.holdA = prev && s.dep - prev.arr >= DWELL_MS / 2 ? 0 : Math.min(DWELL_MS / 2, cap)
      s.holdB = next && next.dep - s.arr >= DWELL_MS / 2 ? 0 : Math.min(DWELL_MS / 2, cap)
      out.push(s)
      if (next && next.dep > s.arr)
        out.push({ ...next, dep: next.dep, arr: next.arr, t0: s.arr, t1: next.dep, from: s.to, pts: s.pts, cum: s.cum, still: true })
    })
  }
  return out
}

/** Share of the hop's track covered at time `now` (0..1), or null outside its window. */
function progress(s: SimSegment, now: number): number | null {
  if (now < s.t0 || now > s.t1 || s.t1 <= s.t0) return null
  if (s.still) return 1
  const run = s.t1 - s.t0 - s.holdA - s.holdB
  if (run <= 0) return (now - s.t0) / (s.t1 - s.t0)
  const x = Math.max(0, Math.min(1, (now - s.t0 - s.holdA) / run))
  // Trapezoid speed: accelerate, cruise, brake; same total time as the timetable.
  const a = ACCEL_SHARE
  const v = 1 / (1 - a)
  if (x < a) return (v * x * x) / (2 * a)
  if (x > 1 - a) return 1 - (v * (1 - x) * (1 - x)) / (2 * a)
  return v * (x - a / 2)
}

/** Point `f` (0..1) of the way along the track, with the index of the piece it lies on. */
function along(s: SimSegment, f: number): { i: number; f: number } {
  const target = f * s.cum[s.cum.length - 1]
  let i = 1
  while (i < s.cum.length - 1 && s.cum[i] < target) i++
  const span = s.cum[i] - s.cum[i - 1] || 1
  return { i, f: Math.max(0, Math.min(1, (target - s.cum[i - 1]) / span)) }
}

/** Position at time `now`, or null when the train is not on this segment. */
export function positionAt(s: SimSegment, now: number): [number, number] | null {
  return positionAndBearing(s, now)?.p ?? null
}

/** Position and compass bearing (degrees, 0 = north) at time `now`, or null. */
export function positionAndBearing(s: SimSegment, now: number): { p: [number, number]; bearing: number } | null {
  const done = progress(s, now)
  if (done === null) return null
  const { i, f } = along(s, done)
  const a = s.pts[i - 1]
  const b = s.pts[i]
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180)
  const dy = b[1] - a[1]
  const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
  return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], bearing }
}
